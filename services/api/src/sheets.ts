import { randomUUID } from 'node:crypto';
import type { Pool, QueryResultRow } from 'pg';
import { parseScore, type LeadSheet } from '@chordviewer/contracts';
import example from '@chordviewer/contracts/fixtures/lead-sheet-v1.json' with { type: 'json' };
import type { createInput, updateInput } from './input.js';

interface SheetRow extends QueryResultRow {
  id: string; score: LeadSheet; tutorial_url: string | null; revision: number; created_at: Date; updated_at: Date;
}
function record(row: SheetRow) {
  return { id: row.id, score: parseScore(row.score), tutorialUrl: row.tutorial_url, revision: row.revision,
    createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString() };
}
export async function listSheets(pool: Pool, owner: string) {
  const rows = await pool.query<Omit<SheetRow, 'score'> & { title: string }>(`SELECT id, score->>'title' AS title, tutorial_url, revision, created_at, updated_at
    FROM lead_sheets WHERE owner_id=$1 ORDER BY updated_at DESC, id LIMIT 100`, [owner]);
  return rows.rows.map(row => ({ id: row.id, title: row.title, tutorialUrl: row.tutorial_url, revision: row.revision,
    createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString() }));
}
export async function getSheet(pool: Pool, owner: string, id: string) {
  const result = await pool.query<SheetRow>('SELECT * FROM lead_sheets WHERE id=$1 AND owner_id=$2', [id, owner]);
  return result.rows[0] ? record(result.rows[0]) : null;
}
export async function createSheet(pool: Pool, owner: string, input: ReturnType<typeof createInput>) {
  const id = randomUUID();
  const score: LeadSheet = input.template === 'example' ? { ...structuredClone(example) as LeadSheet, id, title: input.title } : {
    schemaVersion: 1, id, title: input.title, keySignature: 'C', timeSignature: { numerator: 4, denominator: 4 }, ticksPerQuarter: 480,
    measures: Array.from({ length: 4 }, () => ({ id: randomUUID(), chords: [], melody: [] })),
  };
  parseScore(score);
  const connection = await pool.connect();
  try {
    await connection.query('BEGIN');
    // Serialize creations for an owner so the bounded library cannot race past its limit.
    await connection.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE', [owner]);
    const count = await connection.query<{ count: string }>('SELECT count(*) FROM lead_sheets WHERE owner_id=$1', [owner]);
    if (Number(count.rows[0]?.count) >= 100) { await connection.query('ROLLBACK'); return null; }
    const inserted = await connection.query<SheetRow>('INSERT INTO lead_sheets (id, owner_id, score, tutorial_url) VALUES ($1,$2,$3::jsonb,$4) RETURNING *', [id, owner, JSON.stringify(score), input.tutorialUrl]);
    await connection.query('COMMIT');
    return record(inserted.rows[0]!);
  } catch (error) { await connection.query('ROLLBACK'); throw error; }
  finally { connection.release(); }
}
export async function updateSheet(pool: Pool, owner: string, id: string, input: ReturnType<typeof updateInput>) {
  const result = await pool.query<SheetRow>(`UPDATE lead_sheets SET score=$1::jsonb, tutorial_url=$2, revision=revision+1, updated_at=clock_timestamp()
    WHERE id=$3 AND owner_id=$4 AND revision=$5 RETURNING *`, [JSON.stringify(input.score), input.tutorialUrl, id, owner, input.expectedRevision]);
  if (result.rows[0]) return { kind: 'saved' as const, sheet: record(result.rows[0]) };
  const exists = await pool.query('SELECT id FROM lead_sheets WHERE id=$1 AND owner_id=$2', [id, owner]);
  return { kind: exists.rowCount ? 'conflict' as const : 'missing' as const };
}
