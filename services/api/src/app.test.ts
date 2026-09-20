import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseScore } from '@chordviewer/contracts';
import example from '@chordviewer/contracts/fixtures/lead-sheet-v1.json' with { type: 'json' };
import { buildApp } from './app.js';

const application = buildApp();
// Cold schema compilation shares this workstation with the Android emulator; keep it outside request timing.
beforeAll(async () => { await application.ready(); }, 20_000);
afterAll(async () => { await application.close(); });

describe('local API foundation', () => {
  it('reports availability without claiming database readiness', async () => {
    const response = await application.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', service: 'chordviewer-api', apiVersion: '1' });
  });

  it('serves the exact shared notation fixture through schema serialization', async () => {
    const response = await application.inject({ method: 'GET', url: '/api/v1/score-example' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/json');
    expect(parseScore(response.json())).toEqual(example);
  });

  it('exposes no write endpoint and remains deterministic after a write attempt', async () => {
    const instance = application;
    const attemptedWrite = await instance.inject({ method: 'POST', url: '/api/v1/score-example', payload: { title: 'Changed' } });
    expect(attemptedWrite.statusCode).toBe(404);
    const response = await instance.inject({ method: 'GET', url: '/api/v1/score-example' });
    expect(response.json()).toEqual(example);
  });

  it('does not enable cross-origin access implicitly', async () => {
    const response = await application.inject({ method: 'GET', url: '/api/v1/score-example', headers: { origin: 'https://unrelated.example' } });
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});
