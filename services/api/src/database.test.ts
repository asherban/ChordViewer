import { describe, expect, it } from 'vitest';
import { types } from 'pg';
import { databaseTypes } from './database.js';

describe('database numeric boundary', () => {
  it('decodes authentication timestamps as numbers so retry intervals use arithmetic', () => {
    const lastRequest = databaseTypes.getTypeParser(types.builtins.INT8, 'text')('1790401050000');
    expect(lastRequest).toBe(1_790_401_050_000);
    const now = 1_790_401_052_000;
    expect(Math.ceil((lastRequest + 60_000 - now) / 1000)).toBe(58);
    expect(databaseTypes.getTypeParser(types.builtins.INT8)('100')).toBe(100);
  });

  it('preserves exact safe integers and rejects BIGINT precision loss', () => {
    const parse = databaseTypes.getTypeParser(types.builtins.INT8, 'text');
    expect(parse('9007199254740991')).toBe(Number.MAX_SAFE_INTEGER);
    expect(parse('-9007199254740991')).toBe(Number.MIN_SAFE_INTEGER);
    for (const value of ['9007199254740992', '-9007199254740992', '9223372036854775807']) {
      expect(() => parse(value)).toThrow('safe range');
    }
  });

  it('leaves other PostgreSQL types and the global BIGINT parser unchanged', () => {
    expect(databaseTypes.getTypeParser(types.builtins.JSONB, 'text')('{"score":true}')).toEqual({ score: true });
    expect(databaseTypes.getTypeParser(types.builtins.INT8, 'binary')).toBe(types.getTypeParser(types.builtins.INT8, 'binary'));
    expect(types.getTypeParser(types.builtins.INT8, 'text')('1790401050000')).toBe('1790401050000');
  });
});
