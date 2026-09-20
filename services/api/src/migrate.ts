import { createHash } from 'node:crypto';
import { configuration } from './config.js';
import { createPool } from './database.js';
import { migrations } from './migrations.js';

const pool = createPool(configuration());
try {
  const connection = await pool.connect();
  try {
    await connection.query('BEGIN');
    await connection.query('SELECT pg_advisory_xact_lock(72430815)');
    await connection.query('CREATE TABLE IF NOT EXISTS chordviewer_migrations (id text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
    const applied = await connection.query<{ id: string; checksum: string }>('SELECT id, checksum FROM chordviewer_migrations');
    const known = new Map(migrations.map(migration => [migration.id, createHash('sha256').update(migration.sql).digest('hex')]));
    if (applied.rows.some(row => known.get(row.id) !== row.checksum)) throw new Error('Migration history differs.');
    for (const migration of migrations) {
      if (applied.rows.some(row => row.id === migration.id)) continue;
      await connection.query(migration.sql);
      await connection.query('INSERT INTO chordviewer_migrations (id, checksum) VALUES ($1,$2)', [migration.id, known.get(migration.id)]);
    }
    await connection.query('COMMIT');
    console.info('Local database migrations are current.');
  } catch (error) { await connection.query('ROLLBACK'); throw error; }
  finally { connection.release(); }
} catch {
  console.error('Database migration failed. Check database availability and migration history; stored data was not reset.');
  process.exitCode = 1;
} finally { await pool.end(); }
