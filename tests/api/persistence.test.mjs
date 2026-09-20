import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

// This suite restarts/recreates only the separately labelled test project. It never removes data.
const base = process.env.TEST_API_URL ?? 'http://127.0.0.1:3001';
if (base !== 'http://127.0.0.1:3001') throw new Error('Persistence tests require the isolated test backend on port 3001.');
const origin = 'http://127.0.0.1:5173';
const repository = fileURLToPath(new URL('../../', import.meta.url));
const containers = { api: 'chordviewer-test-api-1', database: 'chordviewer-test-database-1' };
const execute = promisify(execFile);

async function command(program, args, timeout = 30_000) {
  try {
    const { stdout } = await execute(program, args, { cwd: repository, timeout, maxBuffer: 4_194_304, windowsHide: true });
    return stdout.trim();
  } catch (error) {
    // Do not attach process output: callers must never accidentally print generated credentials.
    throw new Error(`Local test command ${program} failed (${error.code ?? error.signal ?? 'unknown'}). Check the test project's status and sanitized logs.`);
  }
}

async function request(path, { method = 'GET', body, token, cookie, browser = false } = {}) {
  // Match native HTTP: Node fetch injects Fetch Metadata even when it has no browser Origin.
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : JSON.stringify(body);
    const outgoing = httpRequest(`${base}${path}`, {
      method, agent: false, signal: AbortSignal.timeout(15_000),
      headers: {
        ...(payload !== null ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(cookie ? { cookie } : {}), ...(browser ? { origin } : {}),
      },
    }, incoming => {
      const chunks = [];
      let size = 0;
      incoming.on('data', chunk => {
        size += chunk.length;
        if (size > 1_048_576) incoming.destroy(new Error('Test response exceeded its size bound.'));
        else chunks.push(chunk);
      });
      incoming.on('error', reject);
      incoming.on('end', () => {
        try {
          const content = Buffer.concat(chunks).toString('utf8');
          resolve({ status: incoming.statusCode, headers: incoming.headers, body: content ? JSON.parse(content) : null });
        } catch { reject(new Error('The local backend returned invalid JSON.')); }
      });
    });
    outgoing.on('error', reject);
    outgoing.end(payload);
  });
}

function cookies(response) {
  const values = response.headers['set-cookie'] ?? [];
  return values.map(value => value.split(';')[0]).join('; ');
}

async function inspect(service) {
  // Deliberately omit Config.Env, which contains this project's generated credentials.
  const format = '{"Id":{{json .Id}},"Config":{"Labels":{{json .Config.Labels}}},"HostConfig":{"PortBindings":{{json .HostConfig.PortBindings}}},"Mounts":{{json .Mounts}},"State":{"Running":{{json .State.Running}},"Health":{"Status":{{json .State.Health.Status}}}}}';
  return JSON.parse(await command('docker', ['inspect', '--format', format, containers[service]]));
}

async function verifyTestProject() {
  const state = {};
  for (const service of ['api', 'database']) {
    const container = await inspect(service);
    assert.equal(container.Config.Labels['com.docker.compose.project'], 'chordviewer-test', 'Lifecycle operations require the test project label');
    assert.equal(container.Config.Labels['com.docker.compose.service'], service, 'Lifecycle operations require the expected service label');
    state[service] = container;
  }
  const bindings = state.api.HostConfig.PortBindings['3000/tcp'];
  assert.deepEqual(bindings, [{ HostIp: '127.0.0.1', HostPort: '3001' }], 'Test API must publish only loopback port 3001');
  assert.deepEqual(state.database.HostConfig.PortBindings, {}, 'The test database must not publish a host port');
  const volume = state.database.Mounts.find(mount => mount.Destination === '/var/lib/postgresql');
  assert.equal(volume?.Type, 'volume');
  assert.equal(volume?.Name, 'chordviewer-test_database', 'Never operate on the development database volume');
  return { api: state.api.Id, database: state.database.Id, volume: volume.Name };
}

async function waitHealthy(service, timeout = 90_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const state = await inspect(service);
    if (state.State.Running && state.State.Health?.Status === 'healthy') return;
    if (!state.State.Running) throw new Error(`The test ${service} container exited before becoming healthy.`);
    await delay(1_000);
  }
  throw new Error(`The test ${service} container did not become healthy within its time bound.`);
}

async function ageOwnSessions(userId, mode) {
  assert.match(userId, /^[A-Za-z0-9_-]{1,128}$/, 'Only the freshly generated test account may be aged');
  assert.ok(['renew', 'expire'].includes(mode));
  await verifyTestProject();
  // Values are passed separately from parameterized SQL. The container reads its own private settings.
  const script = String.raw`
    import { configuration } from './services/api/dist/config.js';
    import { createPool } from './services/api/dist/database.js';
    const [userId, mode] = process.argv.slice(1);
    const statements = {
      renew: 'UPDATE session SET "expiresAt"=now()+interval \'22 hours\', "updatedAt"=now()-interval \'2 hours\' WHERE "userId"=$1',
      expire: 'UPDATE session SET "expiresAt"=now()-interval \'1 minute\' WHERE "userId"=$1'
    };
    if (!Object.hasOwn(statements, mode) || !/^[A-Za-z0-9_-]{1,128}$/.test(userId)) process.exit(2);
    const pool = createPool(configuration());
    try {
      const result = await pool.query(statements[mode], [userId]);
      console.log(JSON.stringify({ changed: result.rowCount }));
    } finally { await pool.end(); }
  `;
  const result = JSON.parse(await command('docker', ['exec', containers.api, 'node', '--input-type=module', '-e', script, userId, mode]));
  assert.ok(result.changed > 0, 'The fresh test account must have a session to age');
  if (mode === 'renew') assert.equal(result.changed, 1, 'Only the fresh browser session should exist before the renewal check');
}

test('test-project persistence, browser renewal and native session lifetime', { timeout: 600_000 }, async t => {
  const before = await verifyTestProject();
  assert.equal((await request('/health')).status, 200, 'Start the isolated backend before running this suite');
  const credentials = { name: 'Persistence acceptance', email: `${randomUUID()}@example.test`, password: `M3-${randomUUID()}` };
  let userId;
  let cookie;
  let token;
  let saved;
  const title = `Persistence ${randomUUID()}`;

  async function login() {
    const { email, password } = credentials;
    const response = await request('/api/auth/sign-in/email', { method: 'POST', body: { email, password } });
    assert.equal(response.status, 200, 'The account password must still work');
    assert.ok(!Object.hasOwn(response.body, 'token'), 'The JSON response must not contain a raw token');
    const signed = response.headers['set-auth-token'];
    assert.ok(typeof signed === 'string' && signed.includes('.'), 'Native login must issue a signed session');
    return signed;
  }
  async function verifyStoredSheet() {
    const response = await request(`/api/v1/sheets/${saved.id}`, { token });
    assert.equal(response.status, 200, 'The authenticated account must reopen its saved sheet');
    assert.equal(response.body.revision, 2);
    assert.equal(response.body.score.title, title);
    assert.equal(response.body.tutorialUrl, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    assert.deepEqual(response.body.score.measures, saved.score.measures);
  }

  await t.test('save a sheet and renew an aged browser cookie', async () => {
    const registered = await request('/api/auth/sign-up/email', { method: 'POST', browser: true, body: credentials });
    assert.equal(registered.status, 200);
    assert.ok(registered.headers['set-auth-token'] === undefined, 'Browser authentication must not expose a bearer header');
    userId = registered.body.user.id;
    cookie = cookies(registered);
    assert.ok(cookie.length > 0, 'The browser receives its session cookie');
    const empty = await request('/api/v1/sheets', { cookie, browser: true });
    assert.deepEqual(empty.body, { sheets: [] });
    const created = await request('/api/v1/sheets', { method: 'POST', cookie, browser: true,
      body: { title: 'Before persistence check', template: 'example' } });
    assert.equal(created.status, 201);
    const updated = await request(`/api/v1/sheets/${created.body.id}`, { method: 'PUT', cookie, browser: true,
      body: { score: { ...created.body.score, title }, tutorialUrl: 'https://youtu.be/dQw4w9WgXcQ', expectedRevision: 1 } });
    assert.equal(updated.status, 200);
    saved = updated.body;
    await ageOwnSessions(userId, 'renew');
    const renewed = await request('/api/v1/me', { cookie, browser: true });
    assert.equal(renewed.status, 200);
    assert.ok((renewed.headers['set-cookie'] ?? []).some(value => /Max-Age=86400/i.test(value) && /HttpOnly/i.test(value) && /SameSite=Lax/i.test(value)), 'An aged active session must refresh its browser cookie');
    assert.ok(renewed.headers['set-auth-token'] === undefined, 'Browser renewal must not expose a bearer header');
    cookie = cookies(renewed);
    token = await login();
  });
  // A failed subtest must never lead to lifecycle operations with incomplete account state.
  assert.ok(saved && token && userId, 'Account/session setup must complete before container lifecycle checks');

  await t.test('database/API restart retains saved data, sessions and password login', async () => {
    await verifyTestProject();
    await command('docker', ['restart', '--time', '15', containers.database], 45_000);
    await waitHealthy('database');
    await command('docker', ['restart', '--time', '15', containers.api], 45_000);
    await waitHealthy('api');
    const restarted = await verifyTestProject();
    assert.deepEqual(restarted, before, 'A restart retains the same containers and volume');
    await verifyStoredSheet();
    assert.equal((await request('/api/v1/me', { cookie, browser: true })).status, 200);
    token = await login();
    await verifyStoredSheet();
  });

  await t.test('rebuilt/recreated containers retain data in the same named volume', { timeout: 360_000 }, async () => {
    await verifyTestProject();
    const script = [
      ". .\\scripts\\development\\LocalBackend.Common.ps1",
      "$backend = Get-LocalBackendSettings -Environment test",
      "Invoke-LocalBackendCompose -Settings $backend -Arguments @('up', '--detach', '--build', '--force-recreate', '--wait', '--wait-timeout', '120')",
    ].join('\n');
    await command('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], 330_000);
    const recreated = await verifyTestProject();
    assert.notEqual(recreated.api, before.api, 'API container must actually be recreated');
    assert.notEqual(recreated.database, before.database, 'Database container must actually be recreated');
    assert.equal(recreated.volume, before.volume, 'The same test data volume must be retained');
    await verifyStoredSheet();
    token = await login();
    await verifyStoredSheet();
  });

  await t.test('expired and explicitly revoked sessions are rejected', async () => {
    await ageOwnSessions(userId, 'expire');
    assert.equal((await request('/api/v1/me', { token })).status, 401, 'An expired native session is rejected');
    assert.equal((await request('/api/v1/me', { cookie, browser: true })).status, 401, 'An expired browser session is rejected');
    token = await login();
    await verifyStoredSheet();
    assert.equal((await request('/api/auth/sign-out', { method: 'POST', token, body: {} })).status, 200);
    assert.equal((await request('/api/v1/me', { token })).status, 401, 'A revoked native session is rejected');
  });
});
