import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { buildApp } from './app.js';
import type { Configuration } from './config.js';

const authentication = vi.hoisted(() => ({ handler: vi.fn(), getSession: vi.fn() }));
vi.mock('./auth.js', () => ({ createAuth: () => ({ handler: authentication.handler, api: { getSession: authentication.getSession } }) }));

const origin = 'http://127.0.0.1:5173';
const config: Configuration = {
  databaseUrl: 'postgres://unused', authSecret: 'unused-in-authentication-stub',
  authBaseUrl: 'http://127.0.0.1:3000', trustedOrigins: [origin], host: '127.0.0.1', port: 3000,
};
const user = { id: 'account-1', name: 'Account', email: 'account@example.test' };
const sheetPath = '/api/v1/sheets/11111111-1111-1111-1111-111111111111/open';
const query = vi.fn();
let app: ReturnType<typeof buildApp>;

beforeEach(() => {
  vi.resetAllMocks();
  query.mockResolvedValue({ rows: [], rowCount: 0 });
  authentication.getSession.mockResolvedValue({ response: { user }, headers: new Headers() });
  authentication.handler.mockResolvedValue(Response.json({ success: true }));
  app = buildApp({ query } as unknown as Pool, config);
});
afterEach(async () => { await app.close(); });

// Exercise the real HTTP boundary without requiring Docker. The authentication provider is
// replaced here; its password hashing, signatures and persistence remain integration checks.
describe('HTTP security boundary', () => {
  it.each([
    { origin: 'https://untrusted.example' },
    { origin: 'null' },
    { origin, 'sec-fetch-site': 'cross-site' },
  ])('rejects untrusted browser reads before consulting a session: %j', async headers => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/me', headers });
    expect(response.statusCode).toBe(403);
    expect(authentication.getSession).not.toHaveBeenCalled();
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it.each([
    {},
    { cookie: 'chordviewer.session_token=browser' },
    { cookie: 'chordviewer.session_token=browser', authorization: 'Bearer native' },
  ])('rejects writes without a trusted Origin or explicit native credentials: %j', async headers => {
    const response = await app.inject({ method: 'POST', url: sheetPath, headers, payload: {} });
    expect(response.statusCode).toBe(403);
    expect(authentication.getSession).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it.each([{ origin, cookie: 'chordviewer.session_token=browser' }, { authorization: 'Bearer native' }])(
    'permits authenticated browser/native writes to reach owner-scoped persistence: %j', async headers => {
      const response = await app.inject({ method: 'POST', url: sheetPath, headers, payload: {} });
      expect(response.statusCode).toBe(404);
      expect(query).toHaveBeenCalledWith(expect.stringContaining('owner_id=$2'), [sheetPath.split('/')[4], user.id]);
    },
  );

  it('requires JSON and enforces its size bound before authentication or persistence', async () => {
    const form = await app.inject({ method: 'POST', url: sheetPath, headers: { origin, 'content-type': 'text/plain' }, payload: '{}' });
    expect(form.statusCode).toBe(415);
    const oversized = await app.inject({ method: 'POST', url: sheetPath, headers: { origin }, payload: { value: 'x'.repeat(1_048_576) } });
    expect(oversized.statusCode).toBe(413);
    expect(oversized.json()).toEqual({ error: 'too_large', message: 'A sheet request must be no larger than 1 MiB.' });
    expect(authentication.getSession).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it('derives the authentication IP from the socket and strips spoofable forwarding headers', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/me', remoteAddress: '127.0.0.42', headers: {
      'x-chordviewer-client-ip': '198.51.100.1', 'x-forwarded-for': '198.51.100.2', 'x-real-ip': '198.51.100.3',
      forwarded: 'for=198.51.100.4', 'x-forwarded-host': 'untrusted.example', 'x-forwarded-proto': 'https',
    } });
    expect(response.statusCode).toBe(200);
    const headers = authentication.getSession.mock.calls[0]![0].headers as Headers;
    expect(headers.get('x-chordviewer-client-ip')).toBe('127.0.0.42');
    for (const name of ['x-forwarded-for', 'x-real-ip', 'forwarded', 'x-forwarded-host', 'x-forwarded-proto']) {
      expect(headers.has(name)).toBe(false);
    }
  });

  it('returns no account data or persistence access without a session', async () => {
    authentication.getSession.mockResolvedValue({ response: null, headers: new Headers() });
    const response = await app.inject('/api/v1/sheets');
    expect(response.statusCode).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });

  it('renews browser cookies without returning provider session fields', async () => {
    authentication.getSession.mockResolvedValue({ response: { user: { ...user, internal: 'private' }, session: { token: 'raw-token' } },
      headers: new Headers({ 'set-cookie': 'chordviewer.session_token=renewed; HttpOnly; SameSite=Lax', 'set-auth-token': 'signed-token' }) });
    const response = await app.inject('/api/v1/me');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ user });
    expect(response.headers['set-cookie']).toContain('chordviewer.session_token=renewed; HttpOnly; SameSite=Lax');
    expect(response.headers['set-auth-token']).toBeUndefined();
  });

  it('redacts unexpected persistence errors', async () => {
    query.mockRejectedValue(new Error('postgres://secret:password@database SQL SELECT sensitive-data'));
    const response = await app.inject('/api/v1/sheets');
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: 'temporarily_unavailable', message: 'The local backend is temporarily unavailable. Retry after it is ready.' });
  });
});

describe('authentication HTTP adapter', () => {
  it.each(['/api/auth/get-session', '/api/auth/change-password', '/api/auth/sign-in/email?callbackURL=https://untrusted.example']) (
    'does not expose unapproved provider endpoints or query options: %s', async url => {
      const response = await app.inject({ method: 'POST', url, payload: {} });
      expect(response.statusCode).toBe(404);
      expect(authentication.handler).not.toHaveBeenCalled();
    },
  );

  it.each([false, true])('hides raw tokens and exposes signed credentials only for native callers (browser=%s)', async browser => {
    authentication.handler.mockResolvedValue(Response.json({ user, token: 'raw-token' }, { headers: {
      'set-cookie': 'chordviewer.session_token=signed-cookie; HttpOnly; SameSite=Lax', 'set-auth-token': 'signed-token',
    } }));
    const response = await app.inject({ method: 'POST', url: '/api/auth/sign-in/email', headers: browser ? { origin } : {},
      payload: { email: user.email, password: 'a-long-password' } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ user });
    expect(response.headers['set-auth-token']).toBe(browser ? undefined : 'signed-token');
    expect(response.headers['set-cookie']).toContain('chordviewer.session_token=signed-cookie; HttpOnly; SameSite=Lax');
  });

  it.each(['retry-after', 'x-retry-after'])('preserves authentication throttling and normalizes its %s interval', async header => {
    authentication.handler.mockResolvedValue(Response.json({ error: 'rate_limited' }, { status: 429, headers: { [header]: '45' } }));
    const response = await app.inject({ method: 'POST', url: '/api/auth/sign-in/email', payload: { email: user.email, password: 'a-long-password' } });
    expect(response.statusCode).toBe(429);
    expect(response.headers['retry-after']).toBe('45');
  });
});
