import Fastify, { type FastifyInstance } from 'fastify';
import { parseScore, scoreSchema } from '@chordviewer/contracts';
import example from '@chordviewer/contracts/fixtures/lead-sheet-v1.json' with { type: 'json' };

/** M2 exposes only deterministic diagnostics; persistence and account access belong to M3. */
export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false, bodyLimit: 65_536, requestTimeout: 10_000 });
  const scoreExample = parseScore(example);
  app.addSchema(scoreSchema);
  app.get('/health', {
    schema: {
      response: {
        200: {
          type: 'object', additionalProperties: false, required: ['status', 'service', 'apiVersion'],
          properties: {
            status: { type: 'string', const: 'ok' },
            service: { type: 'string', const: 'chordviewer-api' },
            apiVersion: { type: 'string', const: '1' },
          },
        },
      },
    },
  }, async () => ({ status: 'ok', service: 'chordviewer-api', apiVersion: '1' }));
  app.get('/api/v1/score-example', {
    schema: { response: { 200: { $ref: scoreSchema.$id } } },
  }, async () => scoreExample);
  return app;
}
