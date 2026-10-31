import { createPool } from './database.js';

if (!process.env.MIGRATION_DATABASE_URL) throw new Error('MIGRATION_DATABASE_URL is required.');
const pool = createPool({ databaseUrl: process.env.MIGRATION_DATABASE_URL });
try {
  await pool.query(`
    GRANT USAGE ON SCHEMA public TO chordviewer_runtime;
    GRANT SELECT ON "user", account TO chordviewer_runtime;
    GRANT UPDATE (id) ON "user" TO chordviewer_runtime;
    GRANT SELECT, INSERT, UPDATE, DELETE ON session, "rateLimit" TO chordviewer_runtime;
    GRANT SELECT, INSERT, UPDATE ON lead_sheets TO chordviewer_runtime;
    DO $block$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='release_score_size') THEN
        ALTER TABLE lead_sheets ADD CONSTRAINT release_score_size CHECK (octet_length(score::text) <= 2097152);
      END IF;
    END $block$;
  `);
  console.info('Release runtime grants and saved-score bound applied.');
} catch {
  console.error('Release database setup failed. The API has not been started.');
  process.exitCode = 1;
} finally { await pool.end(); }
