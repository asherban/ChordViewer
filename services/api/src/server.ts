import { buildApp } from './app.js';

const app = buildApp();
try {
  // This milestone is local-only; later deployment configuration must make public exposure explicit.
  await app.listen({ host: '127.0.0.1', port: 3000 });
  console.info('ChordViewer API is listening at http://127.0.0.1:3000');
} catch (error) {
  console.error('API startup failed:', error instanceof Error ? error.message : 'Unknown error');
  await app.close();
  process.exitCode = 1;
}
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void app.close().catch(() => { process.exitCode = 1; });
  });
}
