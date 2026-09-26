import { randomUUID } from 'node:crypto';
import type { Pool, QueryResultRow } from 'pg';
import { parseScore, type LeadSheet } from '@chordviewer/contracts';
import example from '@chordviewer/contracts/fixtures/lead-sheet-v1.json' with { type: 'json' };
import type { createInput, importInput, updateInput } from './input.js';

interface SheetRow extends QueryResultRow {
  id: string; score: LeadSheet; tutorial_url: string | null; revision: number; created_at: Date; updated_at: Date;
  favorite: boolean; draft: boolean; trashed_at: Date | null; opened_at: Date | null;
}
function metadata(row: SheetRow) {
  return { favorite: row.favorite, draft: row.draft, trashedAt: row.trashed_at?.toISOString() ?? null,
    openedAt: row.opened_at?.toISOString() ?? null };
}
function record(row: SheetRow) {
  return { id: row.id, score: parseScore(row.score), tutorialUrl: row.tutorial_url, revision: row.revision,
    createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(), ...metadata(row) };
}
interface SummaryRow extends SheetRow {
  title: string; key_signature: string; meter: { numerator: number; denominator: number };
  has_chords: boolean; has_melody: boolean; preview_chords: Array<{ symbol: string }> | null;
}
export async function listSheets(pool: Pool, owner: string) {
  const rows = await pool.query<SummaryRow>(`SELECT id, score->>'title' AS title, tutorial_url, revision, created_at, updated_at,
    favorite, draft, trashed_at, opened_at, score->>'keySignature' AS key_signature,
    score->'timeSignature' AS meter,
    jsonb_path_exists(score, '$.measures[*].chords[*]') AS has_chords,
    jsonb_path_exists(score, '$.measures[*].melody[*]') AS has_melody,
    score #> '{measures,0,chords}' AS preview_chords
    FROM lead_sheets WHERE owner_id=$1 ORDER BY updated_at DESC, id LIMIT 100`, [owner]);
  return rows.rows.map(row => ({ id: row.id, title: row.title, tutorialUrl: row.tutorial_url, revision: row.revision,
    createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(), ...metadata(row),
    keySignature: row.key_signature, timeSignature: row.meter, hasChords: row.has_chords, hasMelody: row.has_melody,
    previewChords: (row.preview_chords ?? []).slice(0, 4).map(chord => chord.symbol) }));
}
export async function getSheet(pool: Pool, owner: string, id: string) {
  const result = await pool.query<SheetRow>('SELECT * FROM lead_sheets WHERE id=$1 AND owner_id=$2 AND trashed_at IS NULL', [id, owner]);
  return result.rows[0] ? record(result.rows[0]) : null;
}
export async function markOpened(pool: Pool, owner: string, id: string) {
  const result = await pool.query<SheetRow>('UPDATE lead_sheets SET opened_at=clock_timestamp() WHERE id=$1 AND owner_id=$2 AND trashed_at IS NULL RETURNING *', [id, owner]);
  return result.rows[0] ? record(result.rows[0]) : null;
}
export async function createSheet(pool: Pool, owner: string, input: ReturnType<typeof createInput>) {
  const id = randomUUID();
  const score: LeadSheet = input.template === 'example' ? { ...structuredClone(example) as LeadSheet, id, title: input.title } : {
    schemaVersion: 2, id, title: input.title, keySignature: input.keySignature, timeSignature: input.timeSignature, ticksPerQuarter: 480,
    measures: Array.from({ length: 4 }, () => ({ id: randomUUID(), chords: [], melody: [] })),
  };
  return insertSheet(pool, owner, parseScore(score), input.tutorialUrl);
}
export async function importSheet(pool: Pool, owner: string, input: ReturnType<typeof importInput>) {
  const score = parseScore({ ...input.score, id: randomUUID(), title: input.title });
  return insertSheet(pool, owner, score, input.tutorialUrl);
}
async function insertSheet(pool: Pool, owner: string, score: LeadSheet, tutorialUrl: string | null) {
  const connection = await pool.connect();
  try {
    await connection.query('BEGIN');
    await connection.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE', [owner]);
    const count = await connection.query<{ count: number }>('SELECT count(*) FROM lead_sheets WHERE owner_id=$1', [owner]);
    if (Number(count.rows[0]?.count) >= 100) { await connection.query('ROLLBACK'); return null; }
    const inserted = await connection.query<SheetRow>('INSERT INTO lead_sheets (id, owner_id, score, tutorial_url) VALUES ($1,$2,$3::jsonb,$4) RETURNING *', [score.id, owner, JSON.stringify(score), tutorialUrl]);
    await connection.query('COMMIT');
    return record(inserted.rows[0]!);
  } catch (error) { await connection.query('ROLLBACK'); throw error; }
  finally { connection.release(); }
}
export async function updateSheet(pool: Pool, owner: string, id: string, input: ReturnType<typeof updateInput>) {
  const result = await pool.query<SheetRow>(`UPDATE lead_sheets SET score=$1::jsonb, tutorial_url=$2, revision=revision+1, updated_at=clock_timestamp()
    WHERE id=$3 AND owner_id=$4 AND revision=$5 AND trashed_at IS NULL RETURNING *`, [JSON.stringify(input.score), input.tutorialUrl, id, owner, input.expectedRevision]);
  if (result.rows[0]) return { kind: 'saved' as const, sheet: record(result.rows[0]) };
  return status(pool, owner, id);
}
async function status(pool: Pool, owner: string, id: string) {
  const exists = await pool.query('SELECT id FROM lead_sheets WHERE id=$1 AND owner_id=$2', [id, owner]);
  return { kind: exists.rowCount ? 'conflict' as const : 'missing' as const };
}
export async function changeMetadata(pool: Pool, owner: string, id: string, input: {
  expectedRevision: number; title?: string; favorite?: boolean; draft?: boolean; transition?: 'trash' | 'restore';
}) {
  const values: unknown[] = [id, owner, input.expectedRevision];
  const updates: string[] = [];
  if (input.title !== undefined) { values.push(input.title); updates.push(`score=jsonb_set(score, '{title}', to_jsonb($${values.length}::text))`); }
  if (input.favorite !== undefined) { values.push(input.favorite); updates.push(`favorite=$${values.length}`); }
  if (input.draft !== undefined) { values.push(input.draft); updates.push(`draft=$${values.length}`); }
  if (input.transition === 'trash') updates.push('trashed_at=clock_timestamp()');
  if (input.transition === 'restore') updates.push('trashed_at=NULL');
  updates.push('revision=revision+1', 'updated_at=clock_timestamp()');
  const requiredState = input.transition === 'restore' ? 'IS NOT NULL' : 'IS NULL';
  const result = await pool.query<SheetRow>(`UPDATE lead_sheets SET ${updates.join(', ')}
    WHERE id=$1 AND owner_id=$2 AND revision=$3 AND trashed_at ${requiredState} RETURNING *`, values);
  if (result.rows[0]) return { kind: 'saved' as const, sheet: record(result.rows[0]) };
  return status(pool, owner, id);
}
export async function duplicateSheet(pool: Pool, owner: string, id: string, expectedRevision: number) {
  const connection = await pool.connect();
  try {
    await connection.query('BEGIN');
    await connection.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE', [owner]);
    const count = await connection.query<{ count: number }>('SELECT count(*) FROM lead_sheets WHERE owner_id=$1', [owner]);
    if (Number(count.rows[0]?.count) >= 100) { await connection.query('ROLLBACK'); return { kind: 'limit' as const }; }
    const original = await connection.query<SheetRow>('SELECT * FROM lead_sheets WHERE owner_id=$1 AND id=$2 AND revision=$3 AND trashed_at IS NULL FOR UPDATE', [owner, id, expectedRevision]);
    if (!original.rows[0]) { await connection.query('ROLLBACK'); return status(pool, owner, id); }
    const source = original.rows[0];
    const newId = randomUUID();
    const copy = parseScore({ ...source.score, id: newId, title: `${[...source.score.title].slice(0, 193).join('')} (copy)` });
    const result = await connection.query<SheetRow>('INSERT INTO lead_sheets (id, owner_id, score, tutorial_url, draft) VALUES ($1,$2,$3::jsonb,$4,$5) RETURNING *',
      [newId, owner, JSON.stringify(copy), source.tutorial_url, source.draft]);
    await connection.query('COMMIT');
    return { kind: 'saved' as const, sheet: record(result.rows[0]!) };
  } catch (error) { await connection.query('ROLLBACK'); throw error; }
  finally { connection.release(); }
}
