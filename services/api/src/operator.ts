import { createPool } from './database.js';
import { manageAccount } from './account-admin.js';

// Secrets arrive through stdin, never process arguments or logs. This command uses the
// migration identity in an ephemeral operator container, never the runtime API identity.
const databaseUrl = process.env.OPERATOR_DATABASE_URL;
if (!databaseUrl) throw new Error('OPERATOR_DATABASE_URL is required.');
const pool = createPool({ databaseUrl });
try {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += Buffer.byteLength(chunk);
    if (size > 4096) throw new Error('Input too large.');
    chunks.push(Buffer.from(chunk));
  }
  const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!input || typeof input.email !== 'string' || typeof input.password !== 'string' ||
      (input.name !== undefined && typeof input.name !== 'string')) throw new Error('Invalid input.');
  console.info(JSON.stringify(await manageAccount(pool, input)));
} catch {
  console.error('Account operation failed. Check input, account existence, admission limit and database access. No credential was logged.');
  process.exitCode = 1;
} finally { await pool.end(); }
