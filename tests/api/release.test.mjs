import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';
import { chromium, expect } from '@playwright/test';

// Deliberately fixed to the disposable local release project; never run against production.
const compose = ['compose', '-p', 'chordviewer-release-test', '--env-file', '.local/deployment/rehearsal.env', '-f', 'infra/release/compose.yaml'];
const run = (args, input) => execFileSync('docker', args, { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 8 * 1024 * 1024 });
const operation = input => run([...compose, 'run', '--rm', '-T', 'operator'], JSON.stringify(input));
const sql = query => run([...compose, 'exec', '-T', 'database', 'psql', '-U', 'postgres', '-d', 'chordviewer', '-At', '-v', 'ON_ERROR_STOP=1'], query);
const origin = 'https://chordviewer.app';
const ca = readFileSync('.local/deployment/rehearsal-root.crt');
function request(path, { method = 'GET', body, token, cookie, headers = {}, host = 'chordviewer.app', http = false } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const outgoing = (http ? httpRequest : httpsRequest)({ hostname: '127.0.0.1', port: http ? 8080 : 8443,
      servername: host, ca, agent: false, method, path, signal: AbortSignal.timeout(20_000), headers: {
        host, ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}), ...(cookie ? { cookie } : {}), ...headers,
      } }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('error', reject);
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers,
        text: Buffer.concat(chunks).toString(), json: () => JSON.parse(Buffer.concat(chunks).toString()) }));
    });
    outgoing.on('error', reject);
    outgoing.end(payload);
  });
}

test('packaged HTTPS release enforces identity, persistence, enrollment and gateway boundaries', { timeout: 180_000 }, async () => {
  const first = { action: 'create', name: 'Release rehearsal A', email: `${randomUUID()}@example.test`, password: randomUUID() };
  const second = { ...first, name: 'Release rehearsal B', email: `${randomUUID()}@example.test`, password: randomUUID() };
  const download = '.local/deployment/downloads/verification.txt';
  try {
    sql('TRUNCATE "rateLimit";');
    operation(first); operation(second);
    writeFileSync(download, 'authenticated download');
    assert.equal((await request('/')).status, 200);
    assert.match((await request('/')).headers['content-security-policy'], /frame-ancestors 'none'/);
    assert.equal((await request('/health')).status, 404);
    assert.equal((await request('/api/v1/me')).status, 401);
    assert.equal((await request('/downloads/verification.txt')).status, 401);
    const redirect = await request('/library', { http: true });
    assert.equal(redirect.status, 308);
    assert.equal(redirect.headers.location, `${origin}/library`);
    assert.equal((await request('/library', { host: 'www.chordviewer.app' })).headers.location, `${origin}/library`);
    assert.equal((await request('/api/v1/me', { host: 'api.chordviewer.app' })).status, 401);
    assert.equal((await request('/api/auth/sign-up/email', { method: 'POST', body: first })).status, 403);
    console.log('TLS, redirects, headers, private health and closed enrollment passed.');

    const login = (person, browser = false) => request('/api/auth/sign-in/email', { method: 'POST', body: { email: person.email, password: person.password }, headers: browser ? { origin } : {} });
    const browser = await login(first, true);
    assert.equal(browser.status, 200, browser.text);
    assert.equal(browser.headers['set-auth-token'], undefined);
    assert.equal(browser.json().token, undefined);
    const setCookies = browser.headers['set-cookie'];
    assert.ok(setCookies.some(value => /; Secure/i.test(value) && /; HttpOnly/i.test(value) && /; SameSite=Lax/i.test(value) && value.startsWith('__Secure-')));
    const cookie = setCookies.map(value => value.split(';')[0]).join('; ');
    const native = await login(first);
    assert.equal(native.status, 200, native.text);
    const token = native.headers['set-auth-token'];
    assert.ok(token.includes('.'));
    const otherLogin = await login(second);
    assert.equal(otherLogin.status, 200, otherLogin.text);
    const other = otherLogin.headers['set-auth-token'];
    assert.equal((await request('/api/v1/me', { cookie })).status, 200);
    assert.equal((await request('/api/v1/me', { token })).status, 200);
    assert.equal((await request('/api/v1/me', { token: token.split('.')[0] })).status, 401);
    assert.equal((await request('/downloads/verification.txt', { cookie })).text, 'authenticated download');
    const creation = { title: 'Release rehearsal', template: 'example', tutorialUrl: 'https://youtu.be/dQw4w9WgXcQ' };
    assert.equal((await request('/api/v1/sheets', { method: 'POST', body: creation, cookie })).status, 403);
    assert.equal((await request('/api/v1/sheets', { method: 'POST', body: creation, cookie, headers: { origin: 'https://evil.example' } })).status, 403);
    const created = await request('/api/v1/sheets', { method: 'POST', body: creation, cookie, headers: { origin } });
    assert.equal(created.status, 201, created.text);
    let saved = created.json();
    const path = `/api/v1/sheets/${saved.id}`;
    assert.equal((await request(path, { token: other })).status, 404);
    assert.deepEqual((await request('/api/v1/sheets', { token: other })).json(), { sheets: [] });
    assert.deepEqual((await request(path, { token })).json(), saved);
    const updated = await request(path, { method: 'PUT', token, body: { score: { ...saved.score, title: 'Saved from native session' }, tutorialUrl: saved.tutorialUrl, expectedRevision: saved.revision } });
    assert.equal(updated.status, 200, updated.text);
    assert.equal((await request(path, { method: 'PUT', token, body: { score: saved.score, tutorialUrl: null, expectedRevision: saved.revision } })).status, 409);
    saved = updated.json();
    const favorite = await request(path + '/metadata', { method: 'PATCH', token, body: { expectedRevision: saved.revision, favorite: true, draft: true } });
    assert.equal(favorite.status, 200, favorite.text); saved = favorite.json();
    const trashed = await request(path + '/trash', { method: 'POST', token, body: { expectedRevision: saved.revision } });
    assert.equal(trashed.status, 200, trashed.text); saved = trashed.json();
    assert.ok(saved.trashedAt);
    assert.equal((await request('/api/v1/sheets', { method: 'POST', token, body: { title: 'x'.repeat(1_048_576), template: 'blank' } })).status, 413);
    console.log('Secure cookie and signed bearer sessions, save/reopen, revision conflict, metadata, Trash and account isolation passed.');

    run([...compose, 'up', '-d', '--force-recreate', '--wait', 'database', 'api', 'gateway']);
    const afterReplacement = (await request('/api/v1/sheets', { token })).json().sheets.find(sheet => sheet.id === saved.id);
    assert.equal(afterReplacement.revision, saved.revision);
    assert.equal(afterReplacement.favorite, true);
    assert.equal(afterReplacement.draft, true);
    assert.equal(afterReplacement.trashedAt, saved.trashedAt);
    const restored = await request(path + '/restore', { method: 'POST', token, body: { expectedRevision: saved.revision } });
    assert.equal(restored.status, 200); assert.equal(restored.json().trashedAt, null);
    assert.deepEqual(restored.json().score, saved.score);
    assert.equal(sql("SELECT has_table_privilege('chordviewer_runtime','account','UPDATE'), has_table_privilege('chordviewer_runtime','\"user\"','INSERT');").trim(), 'f|f');
    const bypass = run([...compose, 'exec', '-T', 'api', 'node', '-e', "fetch('http://127.0.0.1:3000/api/v1/me',{headers:{'x-chordviewer-client-ip':'1.2.3.4','x-chordviewer-gateway':'spoof'}}).then(r=>console.log(r.status))"]);
    assert.equal(bypass.trim(), '403');
    const resetPassword = randomUUID();
    operation({ action: 'reset', email: first.email, password: resetPassword });
    assert.equal((await request('/api/v1/me', { token })).status, 401);
    assert.equal((await request('/api/v1/me', { cookie })).status, 401);
    assert.equal((await login(first)).status, 401);
    first.password = resetPassword;
    assert.equal((await login(first)).status, 200);
    console.log('Container replacement preserves data; runtime credentials cannot enroll users; reset revokes browser and native sessions.');

    sql('TRUNCATE "rateLimit";');
    for (let attempt = 1; attempt <= 21; attempt++) {
      const response = await request('/api/auth/sign-in/email', { method: 'POST', body: { email: first.email, password: 'incorrect-password' }, headers: {
        'x-forwarded-for': `198.51.100.${attempt}`, forwarded: `for=198.51.100.${attempt}`, 'x-real-ip': `198.51.100.${attempt}`,
        'x-chordviewer-client-ip': `198.51.100.${attempt}`, 'x-chordviewer-gateway': 'spoof',
      } });
      assert.equal(response.status, attempt === 21 ? 429 : 401, `Login attempt ${attempt}`);
      if (attempt === 21) assert.ok(Number(response.headers['retry-after']) > 0);
    }
    console.log('Changing spoofed forwarding headers cannot evade the persisted login limit.');
  } finally {
    sql(`DELETE FROM "user" WHERE email IN ('${first.email}', '${second.email}'); TRUNCATE "rateLimit";`);
    try { unlinkSync(download); } catch { /* A failed setup may not create it. */ }
  }
});

test('operator enrollment enforces the deployment account bound', { timeout: 30_000 }, () => {
  const prefix = `release-cap-${randomUUID()}-`;
  const email = `${prefix}extra@example.test`;
  try {
    const existing = Number(sql('SELECT count(*) FROM "user";').trim());
    assert.ok(existing < 100, 'Use an isolated rehearsal database with spare account capacity.');
    sql(`INSERT INTO "user" (id,name,email) SELECT gen_random_uuid()::text,'Admission fixture','${prefix}' || n || '@example.test' FROM generate_series(1,${100 - existing}) n;`);
    assert.throws(() => operation({ action: 'create', name: 'Over capacity', email, password: randomUUID() }), /Account operation failed/);
    assert.equal(Number(sql('SELECT count(*) FROM "user";').trim()), 100);
    assert.equal(sql(`SELECT count(*) FROM "user" WHERE email='${email}';`).trim(), '0');
  } finally { sql(`DELETE FROM "user" WHERE email LIKE '${prefix}%';`); }
});

test('release browser renders with the gateway content security policy', { timeout: 30_000 }, async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true,
    args: ['--host-resolver-rules=MAP chordviewer.app 127.0.0.1'] });
  try {
    // This browser-only check uses the isolated internal CA. The HTTPS integration
    // above separately validates that CA and every certificate without bypassing TLS.
    const page = await browser.newPage({ ignoreHTTPSErrors: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('https://chordviewer.app:8443/');
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create account', exact: true })).toHaveCount(0);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
