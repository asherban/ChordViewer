import { Pool } from 'pg';
import type { Configuration } from './config.js';

export function createPool(config: Configuration): Pool {
  const pool = new Pool({ connectionString: config.databaseUrl, max: 5,
    connectionTimeoutMillis: 5_000, idleTimeoutMillis: 30_000, statement_timeout: 10_000 });
  pool.on('error', () => console.error('A database connection failed. Requests will report temporary unavailability.'));
  return pool;
}
