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
  const input = object(value, ['title', 'template', 'tutorialUrl']);
  if (typeof input.template !== 'string' || !['blank', 'example'].includes(input.template)) throw new InputError('Choose a blank sheet or example copy.');
  return { title: title(input.title), template: input.template as 'blank' | 'example', tutorialUrl: tutorialUrl(input.tutorialUrl) };
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
