import { parseScore, type LeadSheet } from '@chordviewer/contracts';

export class InputError extends Error {}
export function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) {
    throw new InputError('Unexpected request fields.');
  }
  return value as Record<string, unknown>;
}
export function title(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || [...value].length > 200 ||
      [...value].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) {
    throw new InputError('Enter a title of 1–200 characters without control characters.');
  }
  return value;
}
export function tutorialUrl(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || value.length > 500) throw new InputError('Enter a valid YouTube video URL.');
  let url: URL;
  try { url = new URL(value); } catch { throw new InputError('Enter a valid YouTube video URL.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) throw new InputError('Use an HTTPS YouTube video URL.');
  const id = url.hostname === 'youtu.be' ? url.pathname.slice(1) :
    ['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(url.hostname) && url.pathname === '/watch' ? url.searchParams.get('v') : null;
  if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) throw new InputError('Use a youtube.com/watch or youtu.be video URL.');
  return `https://www.youtube.com/watch?v=${id}`;
}
export function createInput(value: unknown) {
  const input = object(value, ['title', 'template', 'tutorialUrl', 'keySignature', 'timeSignature']);
  if (typeof input.template !== 'string' || !['blank', 'example'].includes(input.template)) throw new InputError('Choose a blank sheet or example copy.');
  const settings = parseScore({ schemaVersion: 2, id: 'new-sheet', title: 'New sheet', ticksPerQuarter: 480,
    keySignature: input.keySignature === undefined ? 'C' : input.keySignature,
    timeSignature: input.timeSignature === undefined ? { numerator: 4, denominator: 4 } : input.timeSignature,
    measures: [{ id: 'new-measure', chords: [], melody: [] }] });
  if (input.template === 'example' && (settings.keySignature !== 'C' || settings.timeSignature.numerator !== 4 || settings.timeSignature.denominator !== 4)) {
    throw new InputError('Example copies use their original C major and 4/4 meter.');
  }
  return { title: title(input.title), template: input.template as 'blank' | 'example', tutorialUrl: tutorialUrl(input.tutorialUrl),
    keySignature: settings.keySignature, timeSignature: settings.timeSignature };
}
export function importInput(value: unknown): { score: LeadSheet; title: string; tutorialUrl: string | null } {
  const input = object(value, ['score', 'title', 'tutorialUrl']);
  const score = parseScore(input.score);
  return { score, title: title(input.title), tutorialUrl: tutorialUrl(input.tutorialUrl) };
}
export function updateInput(value: unknown, id: string): { score: LeadSheet; tutorialUrl: string | null; expectedRevision: number } {
  const input = object(value, ['score', 'tutorialUrl', 'expectedRevision']);
  if (!Number.isInteger(input.expectedRevision) || Number(input.expectedRevision) < 1 || Number(input.expectedRevision) >= 2_147_483_647) {
    throw new InputError('A current sheet revision is required.');
  }
  if (!Object.hasOwn(input, 'tutorialUrl')) throw new InputError('Include tutorialUrl, or null to remove it.');
  const score = parseScore(input.score);
  if (score.id !== id) throw new InputError('The score ID must match the saved sheet.');
  title(score.title);
  return { score, tutorialUrl: tutorialUrl(input.tutorialUrl), expectedRevision: Number(input.expectedRevision) };
}
export function revisionInput(value: unknown): number {
  const input = object(value, ['expectedRevision']);
  if (!Number.isInteger(input.expectedRevision) || Number(input.expectedRevision) < 1 || Number(input.expectedRevision) >= 2_147_483_647)
    throw new InputError('A current sheet revision is required.');
  return Number(input.expectedRevision);
}
export function metadataInput(value: unknown): { expectedRevision: number; title?: string; favorite?: boolean; draft?: boolean } {
  const input = object(value, ['expectedRevision', 'title', 'favorite', 'draft']);
  const expectedRevision = revisionInput({ expectedRevision: input.expectedRevision });
  if (!['title', 'favorite', 'draft'].some(key => Object.hasOwn(input, key))) throw new InputError('Choose metadata to change.');
  if (input.favorite !== undefined && typeof input.favorite !== 'boolean') throw new InputError('Favorite must be true or false.');
  if (input.draft !== undefined && typeof input.draft !== 'boolean') throw new InputError('Draft must be true or false.');
  return { expectedRevision, ...(input.title === undefined ? {} : { title: title(input.title) }),
    ...(input.favorite === undefined ? {} : { favorite: input.favorite as boolean }),
    ...(input.draft === undefined ? {} : { draft: input.draft as boolean }) };
}
