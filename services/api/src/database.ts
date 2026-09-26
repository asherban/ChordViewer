import { Pool, types, type CustomTypesConfig } from 'pg';
import type { Configuration } from './config.js';

export const databaseTypes: CustomTypesConfig = {
  getTypeParser(oid, format) {
    if (oid !== types.builtins.INT8 || (format !== undefined && format !== 'text')) return types.getTypeParser(oid, format);
    return (value: string) => {
      const integer = Number(value);
      if (!Number.isSafeInteger(integer)) throw new RangeError('Database integer exceeds the supported safe range.');
      return integer;
    };
  },
};

export function createPool(config: Configuration): Pool {
  // pg otherwise returns BIGINT as text. Better Auth performs numeric arithmetic on its
  // millisecond lastRequest field. Our other BIGINT results are bounded sheet counts.
  // Scope conversion to this pool and reject precision loss instead of rounding silently.
  const pool = new Pool({ connectionString: config.databaseUrl, max: 5,
    connectionTimeoutMillis: 5_000, idleTimeoutMillis: 30_000, statement_timeout: 10_000, types: databaseTypes });
  pool.on('error', () => console.error('A database connection failed. Requests will report temporary unavailability.'));
  return pool;
}
