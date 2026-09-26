import Fastify, { type FastifyRequest } from 'fastify';
import { fromNodeHeaders } from 'better-auth/node';
import type { Pool } from 'pg';
import { ScoreValidationError, parseScore } from '@chordviewer/contracts';
import example from '@chordviewer/contracts/fixtures/lead-sheet-v1.json' with { type: 'json' };
import type { Configuration } from './config.js';
import { createAuth } from './auth.js';
import { InputError, createInput, importInput, metadataInput, object, revisionInput, updateInput } from './input.js';
import { changeMetadata, createSheet, duplicateSheet, getSheet, importSheet, listSheets, markOpened, updateSheet } from './sheets.js';

export function buildApp(pool: Pool, config: Configuration) {
  const app = Fastify({ logger: false, bodyLimit: 1_048_576, requestTimeout: 15_000, trustProxy: false });
  const auth = createAuth(pool, config);
  const trusted = new Set([config.authBaseUrl, ...config.trustedOrigins]);
  const authenticationPaths = new Set(['/api/auth/sign-up/email', '/api/auth/sign-in/email', '/api/auth/sign-out']);
  const code = (error: string, message: string) => ({ error, message });
  const authHeaders = (request: FastifyRequest) => {
    const headers = fromNodeHeaders(request.headers);
    // Caller-supplied forwarding headers cannot choose their own authentication rate-limit identity.
    headers.set('x-chordviewer-client-ip', request.ip);
    for (const name of ['x-forwarded-for', 'x-real-ip', 'forwarded', 'x-forwarded-host', 'x-forwarded-proto']) headers.delete(name);
    return headers;
  };
  app.addHook('onRequest', async (request, reply) => {
    reply.header('Cache-Control', 'no-store').header('X-Content-Type-Options', 'nosniff');
    if (!request.url.startsWith('/api/')) return;
    const origin = request.headers.origin;
    if ((origin && !trusted.has(origin)) || request.headers['sec-fetch-site'] === 'cross-site') {
      return reply.code(403).send(code('untrusted_origin', 'This request origin is not allowed.'));
    }
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
      if (!request.headers['content-type']?.toLowerCase().startsWith('application/json')) {
        return reply.code(415).send(code('json_required', 'Send application/json.'));
      }
      // A browser cookie write must carry its trusted Origin. Native callers use explicit bearer credentials.
      if (!origin && request.headers.cookie) return reply.code(403).send(code('origin_required', 'A cookie request requires its origin.'));
      if (!origin && !request.url.startsWith('/api/auth/') && !request.headers.authorization?.startsWith('Bearer ')) {
        return reply.code(403).send(code('origin_required', 'Use a trusted browser origin or a native session.'));
      }
    }
  });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof InputError || error instanceof ScoreValidationError) {
      return reply.code(400).send(code('invalid_input', error instanceof InputError ? error.message : 'The score does not match the supported notation format.'));
    }
    const status = (error as { statusCode?: number }).statusCode;
    if (status === 413) return reply.code(413).send(code('too_large', 'A sheet request must be no larger than 1 MiB.'));
    if (status && status >= 400 && status < 500) return reply.code(status).send(code('invalid_request', 'The request could not be read.'));
    return reply.code(503).send(code('temporarily_unavailable', 'The local backend is temporarily unavailable. Retry after it is ready.'));
  });
  app.get('/health', async (_request, reply) => {
    try {
      await pool.query('SELECT 1 FROM lead_sheets LIMIT 0');
      return { status: 'ok', service: 'chordviewer-api', apiVersion: '1', database: 'ready' };
    } catch { return reply.code(503).send({ status: 'unavailable', service: 'chordviewer-api', apiVersion: '1', database: 'unavailable' }); }
  });
  app.get('/api/v1/score-example', async () => parseScore(example));
  app.route({ method: ['GET', 'POST'], url: '/api/auth/*', handler: async (request, reply) => {
    const path = request.url.split('?')[0]!;
    if (request.method !== 'POST' || !authenticationPaths.has(path) || request.url.includes('?')) {
      return reply.code(404).send(code('not_found', 'Endpoint not found.'));
    }
    const keys = path.endsWith('sign-up/email') ? ['email', 'name', 'password'] : path.endsWith('sign-in/email') ? ['email', 'password'] : [];
    const input = object(request.body, keys);
    if (keys.length > 0) {
      if (typeof input.email !== 'string' || input.email.length > 254 || typeof input.password !== 'string' || input.password.length > 128) {
        throw new InputError('Enter a valid email and password.');
      }
      if (keys.includes('name') && (typeof input.name !== 'string' || !input.name.trim() || [...input.name].length > 100)) {
        throw new InputError('Enter a name of 1–100 characters.');
      }
    }
    const response = await auth.handler(new Request(new URL(path, config.authBaseUrl), {
      method: request.method, headers: authHeaders(request), body: JSON.stringify(input),
    }));
    reply.code(response.status);
    const cookies = response.headers.getSetCookie();
    if (cookies.length) reply.header('set-cookie', cookies);
    const nativeToken = response.headers.get('set-auth-token');
    if (!request.headers.origin && nativeToken) reply.header('set-auth-token', nativeToken);
    // Better Auth currently uses X-Retry-After; expose the standard header to our clients.
    const retry = response.headers.get('retry-after') ?? response.headers.get('x-retry-after');
    if (retry) reply.header('retry-after', retry);
    const content = await response.json() as Record<string, unknown>;
    // Native uses the signed header; browser uses HttpOnly cookies. Neither needs a raw token in JSON.
    delete content.token;
    return reply.send(content);
  } });
  app.register(async routes => {
    routes.decorateRequest('account', null);
    routes.addHook('preHandler', async (request, reply) => {
      const { response: session, headers } = await auth.api.getSession({ headers: authHeaders(request), returnHeaders: true });
      const renewedCookies = headers.getSetCookie();
      if (renewedCookies.length) reply.header('set-cookie', renewedCookies);
      if (!session) return reply.code(401).send(code('unauthorized', 'Sign in to open your library.'));
      request.account = { id: session.user.id, name: session.user.name, email: session.user.email };
    });
    routes.get('/api/v1/me', async request => ({ user: request.account }));
    routes.get('/api/v1/sheets', async request => ({ sheets: await listSheets(pool, request.account!.id) }));
    routes.post('/api/v1/sheets', async (request, reply) => {
      const sheet = await createSheet(pool, request.account!.id, createInput(request.body));
      if (!sheet) return reply.code(409).send(code('sheet_limit', 'Your account has reached 100 sheets, including Trash.'));
      return reply.code(201).send(sheet);
    });
    routes.post('/api/v1/sheets/import', async (request, reply) => {
      const sheet = await importSheet(pool, request.account!.id, importInput(request.body));
      if (!sheet) return reply.code(409).send(code('sheet_limit', 'Your account has reached 100 sheets, including Trash.'));
      return reply.code(201).send(sheet);
    });
    function sheetId(value: string): boolean { return /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value); }
    routes.get<{ Params: { id: string } }>('/api/v1/sheets/:id', async (request, reply) => {
      const sheet = sheetId(request.params.id) ? await getSheet(pool, request.account!.id, request.params.id) : null;
      return sheet ?? reply.code(404).send(code('not_found', 'Sheet not found.'));
    });
    routes.post<{ Params: { id: string } }>('/api/v1/sheets/:id/open', async (request, reply) => {
      if (!sheetId(request.params.id)) return reply.code(404).send(code('not_found', 'Sheet not found.'));
      object(request.body, []);
      const sheet = await markOpened(pool, request.account!.id, request.params.id);
      return sheet ?? reply.code(404).send(code('not_found', 'Sheet not found.'));
    });
    routes.put<{ Params: { id: string } }>('/api/v1/sheets/:id', async (request, reply) => {
      if (!sheetId(request.params.id)) return reply.code(404).send(code('not_found', 'Sheet not found.'));
      const result = await updateSheet(pool, request.account!.id, request.params.id, updateInput(request.body, request.params.id));
      if (result.kind === 'saved') return result.sheet;
      return result.kind === 'conflict' ? reply.code(409).send(code('revision_conflict', 'This sheet changed on another device. Reload before saving.')) :
        reply.code(404).send(code('not_found', 'Sheet not found.'));
    });
    routes.patch<{ Params: { id: string } }>('/api/v1/sheets/:id/metadata', async (request, reply) => {
      if (!sheetId(request.params.id)) return reply.code(404).send(code('not_found', 'Sheet not found.'));
      const result = await changeMetadata(pool, request.account!.id, request.params.id, metadataInput(request.body));
      if (result.kind === 'saved') return result.sheet;
      return result.kind === 'conflict' ? reply.code(409).send(code('revision_conflict', 'This sheet changed. Refresh before changing it.')) :
        reply.code(404).send(code('not_found', 'Sheet not found.'));
    });
    routes.post<{ Params: { id: string } }>('/api/v1/sheets/:id/duplicate', async (request, reply) => {
      if (!sheetId(request.params.id)) return reply.code(404).send(code('not_found', 'Sheet not found.'));
      const result = await duplicateSheet(pool, request.account!.id, request.params.id, revisionInput(request.body));
      if (result.kind === 'saved') return reply.code(201).send(result.sheet);
      if (result.kind === 'limit') return reply.code(409).send(code('sheet_limit', 'Your account has reached 100 sheets, including Trash.'));
      return result.kind === 'conflict' ? reply.code(409).send(code('revision_conflict', 'This sheet changed. Refresh before duplicating it.')) :
        reply.code(404).send(code('not_found', 'Sheet not found.'));
    });
    for (const transition of ['trash', 'restore'] as const) {
      routes.post<{ Params: { id: string } }>(`/api/v1/sheets/:id/${transition}`, async (request, reply) => {
        if (!sheetId(request.params.id)) return reply.code(404).send(code('not_found', 'Sheet not found.'));
        const result = await changeMetadata(pool, request.account!.id, request.params.id, { expectedRevision: revisionInput(request.body), transition });
        if (result.kind === 'saved') return result.sheet;
        return result.kind === 'conflict' ? reply.code(409).send(code('revision_conflict', 'This sheet changed. Refresh before changing it.')) :
          reply.code(404).send(code('not_found', 'Sheet not found.'));
      });
    }
  });
  return app;
}

declare module 'fastify' { interface FastifyRequest { account: { id: string; name: string; email: string } | null } }
