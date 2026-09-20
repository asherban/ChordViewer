import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';

const base = process.env.TEST_API_URL ?? 'http://127.0.0.1:3001';
if (base !== 'http://127.0.0.1:3001') throw new Error('Integration tests require the isolated local test backend on port 3001.');
const origin = 'http://127.0.0.1:5173';
async function request(path, { method = 'GET', body, token, cookie, headers = {} } = {}) {
  // Raw HTTP matches native callers: Node fetch adds browser Fetch Metadata without an Origin.
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : JSON.stringify(body);
    const outgoing = httpRequest(`${base}${path}`, { method, signal: AbortSignal.timeout(15_000),
      headers: { ...(payload !== null ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}), ...(cookie ? { cookie } : {}), ...headers },
    }, incoming => {
      const chunks = [];
      let size = 0;
      incoming.on('data', chunk => { size += chunk.length; if (size > 2_097_152) incoming.destroy(new Error('Response too large')); else chunks.push(chunk); });
      incoming.on('error', reject);
      incoming.on('end', () => {
        const responseHeaders = new Headers();
        for (const [key, values] of Object.entries(incoming.headers)) for (const value of Array.isArray(values) ? values : [values]) {
          if (value !== undefined) responseHeaders.append(key, value);
        }
        resolve(new Response(Buffer.concat(chunks), { status: incoming.statusCode, headers: responseHeaders }));
      });
    });
    outgoing.on('error', reject);
    outgoing.end(payload);
  });
}
async function account(label, browser = false) {
  const credentials = { name: label, email: `${randomUUID()}@example.test`, password: `M3-${randomUUID()}` };
  const response = await request('/api/auth/sign-up/email', { method: 'POST', body: credentials, headers: browser ? { origin } : {} });
  assert.equal(response.status, 200, 'Account registration succeeds');
  const body = await response.json();
  assert.equal(Object.hasOwn(body, 'token'), false, 'No raw session token in JSON');
  const token = response.headers.get('set-auth-token');
  const setCookie = response.headers.getSetCookie();
  const cookie = setCookie.map(value => value.split(';')[0]).join('; ');
  if (browser) {
    assert.equal(token, null, 'Browser uses cookies only');
    assert.ok(setCookie.some(value => /HttpOnly/i.test(value) && /SameSite=Lax/i.test(value)));
  } else assert.ok(typeof token === 'string' && token.includes('.'), 'Native gets signed session');
  return { credentials, token, cookie, user: body.user };
}
let first;
let second;
let saved;
before(async () => {
  const health = await request('/health');
  assert.equal(health.status, 200, 'Start the isolated test backend before this suite');
  first = await account('First');
  second = await account('Second');
});
test('new accounts start empty and unauthenticated reads are denied', async () => {
  assert.equal((await request('/api/v1/sheets')).status, 401);
  for (const person of [first, second]) {
    const response = await request('/api/v1/sheets', { token: person.token });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { sheets: [] });
  }
});
test('create stores a validated score; identity comes only from the session', async () => {
  const invalid = await request('/api/v1/sheets', { method: 'POST', token: first.token,
    body: { title: 'Spoofed owner', template: 'blank', ownerId: second.user.id } });
  assert.equal(invalid.status, 400);
  const response = await request('/api/v1/sheets', { method: 'POST', token: first.token,
    body: { title: 'First saved sheet', template: 'example', tutorialUrl: 'https://youtu.be/dQw4w9WgXcQ' } });
  assert.equal(response.status, 201);
  saved = await response.json();
  assert.equal(saved.score.id, saved.id);
  assert.equal(saved.score.measures.length, 4);
  assert.equal(saved.revision, 1);
  assert.equal(saved.tutorialUrl, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
});
test('a second account cannot discover, read or overwrite the first account sheet', async () => {
  const list = await request('/api/v1/sheets', { token: second.token });
  assert.deepEqual(await list.json(), { sheets: [] });
  assert.equal((await request(`/api/v1/sheets/${saved.id}`, { token: second.token })).status, 404);
  assert.equal((await request(`/api/v1/sheets/${saved.id}`, { method: 'PUT', token: second.token,
    body: { score: saved.score, tutorialUrl: null, expectedRevision: 1 } })).status, 404);
  assert.equal((await request('/api/v1/sheets/not-a-uuid', { token: first.token })).status, 404);
});
test('simultaneous writes allow exactly one revision; stale writes never overwrite data', async () => {
  const write = title => request(`/api/v1/sheets/${saved.id}`, { method: 'PUT', token: first.token,
    body: { score: { ...saved.score, title }, tutorialUrl: null, expectedRevision: 1 } });
  const results = await Promise.all([write('Device A'), write('Device B')]);
  assert.deepEqual(results.map(response => response.status).sort(), [200, 409]);
  const current = await request(`/api/v1/sheets/${saved.id}`, { token: first.token });
  saved = await current.json();
  assert.equal(saved.revision, 2);
  assert.ok(['Device A', 'Device B'].includes(saved.score.title));
});
test('schema, body limits and tutorial validation reject unsafe writes without changing revision', async () => {
  const updates = [
    { score: { ...saved.score, schemaVersion: 99 }, tutorialUrl: null, expectedRevision: 2 },
    { score: { ...saved.score, id: randomUUID() }, tutorialUrl: null, expectedRevision: 2 },
    { score: saved.score, tutorialUrl: 'https://127.0.0.1/private', expectedRevision: 2 },
  ];
  for (const body of updates) assert.equal((await request(`/api/v1/sheets/${saved.id}`, { method: 'PUT', token: first.token, body })).status, 400);
  assert.equal((await request('/api/v1/sheets', { method: 'POST', token: first.token, body: { title: 'x'.repeat(1_048_576), template: 'blank' } })).status, 413);
  const current = await request(`/api/v1/sheets/${saved.id}`, { token: first.token });
  assert.equal((await current.json()).revision, 2);
});
test('browser cookie writes need a trusted origin and cannot opt into native authentication', async () => {
  const browser = await account('Browser', true);
  const body = { title: 'Cookie sheet', template: 'blank' };
  assert.equal((await request('/api/v1/sheets', { method: 'POST', cookie: browser.cookie, body })).status, 403);
  assert.equal((await request('/api/v1/sheets', { method: 'POST', cookie: browser.cookie, body, headers: { origin: 'https://evil.example' } })).status, 403);
  assert.equal((await request('/api/v1/sheets', { method: 'POST', cookie: browser.cookie, body, headers: { origin } })).status, 201);
  assert.equal((await request('/api/auth/sign-out', { method: 'POST', cookie: browser.cookie, body: {} })).status, 403);
  assert.equal((await request('/api/auth/sign-out', { method: 'POST', cookie: browser.cookie, body: {}, headers: { origin } })).status, 200);
  assert.equal((await request('/api/v1/me', { cookie: browser.cookie })).status, 401);
});
test('revoked/tampered native credentials are rejected and a fresh login reopens saved data', async () => {
  assert.equal((await request('/api/v1/me', { token: `${first.token}tamper` })).status, 401);
  assert.equal((await request('/api/v1/me', { token: first.token.split('.')[0] })).status, 401);
  assert.equal((await request('/api/auth/sign-out', { method: 'POST', token: first.token, body: {} })).status, 200);
  assert.equal((await request('/api/v1/me', { token: first.token })).status, 401);
  const { email, password } = first.credentials;
  const login = await request('/api/auth/sign-in/email', { method: 'POST', body: { email, password } });
  assert.equal(login.status, 200);
  const response = await request(`/api/v1/sheets/${saved.id}`, { token: login.headers.get('set-auth-token') });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).revision, 2);
});
test('concurrent creation cannot exceed the personal library limit', async () => {
  for (let index = 0; index < 99; index++) {
    const response = await request('/api/v1/sheets', { method: 'POST', token: second.token,
      body: { title: `Quota check ${index + 1}`, template: 'blank' } });
    assert.equal(response.status, 201);
  }
  const results = await Promise.all([1, 2].map(index => request('/api/v1/sheets', { method: 'POST', token: second.token,
    body: { title: `Last available slot ${index}`, template: 'blank' } })));
  assert.deepEqual(results.map(response => response.status).sort(), [201, 409]);
  const response = await request('/api/v1/sheets', { token: second.token });
  assert.equal((await response.json()).sheets.length, 100);
});
test('authentication throttling survives spoofed forwarding headers', async () => {
  let limited = false;
  for (let index = 0; index < 24; index++) {
    const response = await request('/api/auth/sign-in/email', { method: 'POST', body: { email: 'missing@example.test', password: 'incorrect-password' },
      headers: { 'x-chordviewer-client-ip': `198.51.100.${index + 1}`, 'x-forwarded-for': `198.51.100.${index + 1}` } });
    if (response.status === 429) { limited = true; break; }
    assert.equal(response.status, 401);
  }
  assert.ok(limited, 'Repeated authentication attempts must be throttled');
});
