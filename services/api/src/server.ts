import { buildApp } from './app.js';
import { configuration } from './config.js';
import { createPool } from './database.js';

try {
  const config = configuration();
  const pool = createPool(config);
  const app = buildApp(pool, config);
  app.addHook('onClose', async () => { await pool.end(); });
  try {
    await app.listen({ host: config.host, port: config.port });
    console.info('ChordViewer local API is ready.');
  } catch {
    console.error('API startup failed. Check the local configuration and database availability.');
    await app.close();
    process.exitCode = 1;
  }
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => { void app.close().catch(() => { process.exitCode = 1; }); });
  }
} catch { console.error('API configuration is invalid. Run the documented local setup.'); process.exitCode = 1; }
