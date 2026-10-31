import { randomUUID } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import type { Pool } from 'pg';

export async function manageAccount(pool: Pool, input: { action: 'create' | 'reset'; email: string; password: string; name?: string }) {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || input.password.length < 12 || input.password.length > 128 ||
      !['create', 'reset'].includes(input.action) || (input.action === 'create' && (!input.name?.trim() || [...input.name.trim()].length > 100))) {
    throw new Error('Invalid account details.');
  }
  const password = await hashPassword(input.password);
  const connection = await pool.connect();
  try {
    await connection.query('BEGIN');
    // Serialize admission and reset with the same operator workflow; no HTTP admin endpoint exists.
    await connection.query('SELECT pg_advisory_xact_lock(72430816)');
    if (input.action === 'create') {
      const count = await connection.query<{ count: string }>('SELECT count(*) FROM "user"');
      if (Number(count.rows[0]?.count) >= 100) throw new Error('Deployment account limit reached.');
      const id = randomUUID();
      await connection.query('INSERT INTO "user" (id,name,email,"emailVerified") VALUES ($1,$2,$3,false)', [id, input.name!.trim(), email]);
      await connection.query('INSERT INTO account (id,"accountId","providerId","userId",password,"updatedAt") VALUES ($1,$2,\'credential\',$2,$3,now())', [randomUUID(), id, password]);
    } else {
      const user = await connection.query<{ id: string }>('SELECT id FROM "user" WHERE email=$1 FOR UPDATE', [email]);
      if (!user.rows[0]) throw new Error('Account not found.');
      const id = user.rows[0].id;
      const changed = await connection.query('UPDATE account SET password=$1,"updatedAt"=now() WHERE "userId"=$2 AND "providerId"=\'credential\'', [password, id]);
      if (changed.rowCount !== 1) throw new Error('Credential account not found.');
      await connection.query('DELETE FROM session WHERE "userId"=$1', [id]);
    }
    await connection.query('COMMIT');
    return { email, action: input.action };
  } catch (error) { await connection.query('ROLLBACK'); throw error; }
  finally { connection.release(); }
}
