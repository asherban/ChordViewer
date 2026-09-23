import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { migrations } from '../../services/api/src/migrations.ts';

test('additive 002 migration preserves a preexisting 001 score and revision', () => {
  const namespace = `m6_fixture_${randomUUID().replaceAll('-', '_')}`;
  const id = randomUUID();
  const owner = `test-${randomUUID()}`;
  const score = { schemaVersion: 1, id, title: 'Existing score before M6', keySignature: 'C',
    timeSignature: { numerator: 4, denominator: 4 }, ticksPerQuarter: 480,
    measures: [{ id: 'bar-1', chords: [], melody: [] }] };
  const sql = `BEGIN;
CREATE SCHEMA ${namespace};
SET LOCAL search_path TO ${namespace}, public;
${migrations[0].sql}
INSERT INTO "user" (id, name, email) VALUES ('${owner}', 'Fixture', '${owner}@example.test');
INSERT INTO lead_sheets (id, owner_id, score, tutorial_url, revision) VALUES ('${id}', '${owner}', $score$${JSON.stringify(score)}$score$::jsonb, NULL, 7);
${migrations[1].sql}
SELECT row_to_json(s) FROM (SELECT score, revision, favorite, draft, trashed_at, opened_at FROM lead_sheets WHERE id='${id}') s;
ROLLBACK;`;
  // The transaction rolls back even the fixture schema; production and persisted test rows are untouched.
  const result = spawnSync('docker', ['exec', '-i', 'chordviewer-test-database-1', 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'chordviewer'],
    { input: sql, encoding: 'utf8', timeout: 30_000, maxBuffer: 2_000_000 });
  assert.equal(result.status, 0, result.stderr?.slice(0, 500));
  const row = JSON.parse(result.stdout.trim());
  assert.deepEqual(row.score, score);
  assert.equal(row.revision, 7);
  assert.equal(row.favorite, false);
  assert.equal(row.draft, false);
  assert.equal(row.trashed_at, null);
  assert.equal(row.opened_at, null);
});
