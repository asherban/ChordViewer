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

test('import creates a new owned sheet atomically even when its source ID belongs to another account', async () => {
  const body = { score: { ...saved.score, schemaVersion: 2, keySignature: 'D' }, title: 'Imported copy', tutorialUrl: 'https://youtu.be/dQw4w9WgXcQ' };
  assert.equal((await request('/api/v1/sheets/import', { method: 'POST', body, headers: { origin } })).status, 401);
  const rejected = await request('/api/v1/sheets/import', { method: 'POST', token: second.token, body: { ...body, ownerId: first.user.id } });
  assert.equal(rejected.status, 400);
  assert.deepEqual(await (await request('/api/v1/sheets', { token: second.token })).json(), { sheets: [] });
  const response = await request('/api/v1/sheets/import', { method: 'POST', token: second.token, body });
  assert.equal(response.status, 201);
  const imported = await response.json();
  assert.notEqual(imported.id, saved.id);
  assert.equal(imported.score.id, imported.id);
  assert.equal(imported.score.title, 'Imported copy');
  assert.equal(imported.revision, 1);
  assert.equal(imported.score.schemaVersion, 2);
  assert.equal(imported.score.keySignature, 'D');
  assert.deepEqual(imported.score.measures, saved.score.measures);
  assert.equal((await request(`/api/v1/sheets/${imported.id}`, { token: first.token })).status, 404);
  const original = await (await request(`/api/v1/sheets/${saved.id}`, { token: first.token })).json();
  assert.equal(original.revision, saved.revision);
  assert.equal(original.score.title, saved.score.title);
});

test('blank creation persists the selected v2 key and meter', async () => {
  const response = await request('/api/v1/sheets', { method: 'POST', token: first.token,
    body: { title: 'Six-eight study', template: 'blank', keySignature: 'F#m', timeSignature: { numerator: 6, denominator: 8 } } });
  assert.equal(response.status, 201);
  const sheet = await response.json();
  assert.equal(sheet.score.schemaVersion, 2);
  assert.equal(sheet.score.keySignature, 'F#m');
  assert.deepEqual(sheet.score.timeSignature, { numerator: 6, denominator: 8 });
  assert.ok(sheet.score.measures.every(measure => measure.melody.length === 0 && measure.chords.length === 0));
  assert.deepEqual((await (await request(`/api/v1/sheets/${sheet.id}`, { token: first.token })).json()).score, sheet.score);
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
test('storage-incompatible Unicode is rejected without changing saved music or creating a copy', async () => {
  const path = `/api/v1/sheets/${saved.id}`;
  const before = await (await request('/api/v1/sheets', { token: first.token })).json();
  for (const title of ['bad\u0000title', 'bad\ud800title', 'bad\udc00title']) {
    assert.equal((await request('/api/v1/sheets', { method: 'POST', token: first.token,
      body: { title, template: 'blank' } })).status, 400);
    assert.equal((await request(path + '/metadata', { method: 'PATCH', token: first.token,
      body: { expectedRevision: saved.revision, title } })).status, 400);
    const score = structuredClone(saved.score);
    score.measures[0].chords[0].symbol = title;
    assert.equal((await request('/api/v1/sheets/import', { method: 'POST', token: first.token,
      body: { score, title: 'Invalid imported symbol' } })).status, 400);
    assert.equal((await request(path, { method: 'PUT', token: first.token,
      body: { score, tutorialUrl: saved.tutorialUrl, expectedRevision: saved.revision } })).status, 400);
  }
  assert.deepEqual(await (await request('/api/v1/sheets', { token: first.token })).json(), before);
  assert.deepEqual(await (await request(path, { token: first.token })).json(), saved);
});

test('Library metadata and recency are owner-scoped, bounded and guarded', async () => {
  const path = '/api/v1/sheets/' + saved.id;
  const summary = (await (await request('/api/v1/sheets', { token: first.token })).json()).sheets.find(sheet => sheet.id === saved.id);
  assert.equal(summary.openedAt, null);
  assert.equal(summary.keySignature, saved.score.keySignature);
  assert.deepEqual(summary.timeSignature, saved.score.timeSignature);
  assert.ok(summary.previewChords.length <= 4);
  assert.equal((await (await request(path, { token: first.token })).json()).openedAt, null);
  const opened = await request(path + '/open', { method: 'POST', token: first.token, body: {} });
  assert.equal(opened.status, 200);
  assert.ok((await opened.json()).openedAt);
  assert.equal((await request(path + '/open', { method: 'POST', token: second.token, body: {} })).status, 404);
  const changed = await request(path + '/metadata', { method: 'PATCH', token: first.token,
    body: { expectedRevision: 2, title: 'Renamed from Library', favorite: true, draft: true } });
  assert.equal(changed.status, 200);
  saved = await changed.json();
  assert.equal(saved.score.title, 'Renamed from Library');
  assert.equal(saved.revision, 3);
  assert.equal(saved.favorite, true);
  assert.equal(saved.draft, true);
  assert.equal((await request(path + '/metadata', { method: 'PATCH', token: first.token,
    body: { expectedRevision: 2, favorite: false } })).status, 409);
  assert.equal((await request(path + '/metadata', { method: 'PATCH', token: second.token,
    body: { expectedRevision: 3, favorite: false } })).status, 404);
});
test('bounded chord previews preserve complete Unicode score symbols', async () => {
  const person = await account('Unicode preview');
  const symbol = '😀'.repeat(32);
  const score = structuredClone(saved.score);
  score.measures[0].chords[0].symbol = symbol;
  const created = await request('/api/v1/sheets/import', { method: 'POST', token: person.token,
    body: { score, title: 'Unicode chord preview' } });
  assert.equal(created.status, 201);
  const record = await created.json();
  const listing = (await (await request('/api/v1/sheets', { token: person.token })).json()).sheets;
  assert.equal(listing.find(item => item.id === record.id).previewChords[0], symbol);
});
test('duplicate uses a fresh identity and Unicode-safe title; Trash is recoverable and blocks stale saves', async () => {
  const source = '/api/v1/sheets/' + saved.id;
  const renamed = await request(source + '/metadata', { method: 'PATCH', token: first.token,
    body: { expectedRevision: saved.revision, title: '😀'.repeat(199) } });
  assert.equal(renamed.status, 200);
  saved = await renamed.json();
  const response = await request(source + '/duplicate', { method: 'POST', token: first.token,
    body: { expectedRevision: saved.revision } });
  assert.equal(response.status, 201);
  const copy = await response.json();
  assert.notEqual(copy.id, saved.id);
  assert.equal([...copy.score.title].length, 200);
  assert.ok(copy.score.title.endsWith(' (copy)'));
  assert.deepEqual(copy.score.measures, saved.score.measures);
  assert.equal(copy.tutorialUrl, saved.tutorialUrl);
  assert.equal((await request(source + '/duplicate', { method: 'POST', token: second.token,
    body: { expectedRevision: saved.revision } })).status, 404);
  const path = '/api/v1/sheets/' + copy.id;
  const trash = await request(path + '/trash', { method: 'POST', token: first.token, body: { expectedRevision: 1 } });
  assert.equal(trash.status, 200);
  const trashed = await trash.json();
  assert.ok(trashed.trashedAt);
  assert.equal((await request(path, { token: first.token })).status, 404);
  assert.equal((await request(path, { method: 'PUT', token: first.token,
    body: { score: copy.score, tutorialUrl: copy.tutorialUrl, expectedRevision: 1 } })).status, 409);
  assert.equal((await request(path + '/restore', { method: 'POST', token: first.token,
    body: { expectedRevision: 1 } })).status, 409);
  const restored = await request(path + '/restore', { method: 'POST', token: first.token,
    body: { expectedRevision: trashed.revision } });
  assert.equal(restored.status, 200);
  assert.equal((await restored.json()).trashedAt, null);
});
test('browser cookie writes need a trusted origin and cannot opt into native authentication', async () => {
  const browser = await account('Browser', true);
  const body = { title: 'Cookie sheet', template: 'blank' };
  assert.equal((await request('/api/v1/sheets', { method: 'POST', cookie: browser.cookie, body })).status, 403);
  assert.equal((await request('/api/v1/sheets', { method: 'POST', cookie: browser.cookie, body, headers: { origin: 'https://evil.example' } })).status, 403);
  assert.equal((await request('/api/v1/sheets', { method: 'POST', cookie: browser.cookie, body, headers: { origin } })).status, 201);
  assert.equal((await request('/api/v1/sheets/import', { method: 'POST', cookie: browser.cookie,
    body: { score: saved.score, title: 'CSRF import' } })).status, 403);
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
  assert.equal((await response.json()).revision, saved.revision);
});
test('concurrent creation cannot exceed the personal library limit', async () => {
  const before = (await (await request('/api/v1/sheets', { token: second.token })).json()).sheets;
  const existing = before.length;
  assert.ok(existing > 0, 'Duplicate needs a source owned by this account');
  const duplicateSource = before[0];
  for (let index = existing; index < 99; index++) {
    const response = await request('/api/v1/sheets', { method: 'POST', token: second.token,
      body: { title: `Quota check ${index + 1}`, template: 'blank' } });
    assert.equal(response.status, 201);
  }
  const results = await Promise.all([
    request('/api/v1/sheets', { method: 'POST', token: second.token, body: { title: 'Last available blank slot', template: 'blank' } }),
    request('/api/v1/sheets/import', { method: 'POST', token: second.token, body: { title: 'Last available import slot', score: saved.score } }),
    request(`/api/v1/sheets/${duplicateSource.id}/duplicate`, { method: 'POST', token: second.token,
      body: { expectedRevision: duplicateSource.revision } }),
  ]);
  assert.deepEqual(results.map(response => response.status).sort(), [201, 409, 409]);
  const response = await request('/api/v1/sheets', { token: second.token });
  const full = (await response.json()).sheets;
  assert.equal(full.length, 100);
  const moved = await request('/api/v1/sheets/' + full[0].id + '/trash', { method: 'POST', token: second.token,
    body: { expectedRevision: full[0].revision } });
  assert.equal(moved.status, 200);
  assert.equal((await request('/api/v1/sheets', { method: 'POST', token: second.token,
    body: { title: 'Trash does not free quota', template: 'blank' } })).status, 409);
  assert.equal((await request(`/api/v1/sheets/${duplicateSource.id}/duplicate`, { method: 'POST', token: second.token,
    body: { expectedRevision: duplicateSource.revision } })).status, 409);
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
