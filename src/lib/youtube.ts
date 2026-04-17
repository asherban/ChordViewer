const ID_RE = /^[A-Za-z0-9_-]{11}$/;

export interface VideoHistoryEntry {
  id: string;
  startSec: number | null;
  label: string;
  title?: string;
}

export async function fetchVideoTitle(id: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${encodeURIComponent(id)}&format=json`
    );
    if (!res.ok) return null;
    const data = await res.json() as { title?: string };
    return data.title ?? null;
  } catch {
    return null;
  }
}

export function parseYouTubeId(input: string): string | null {
  if (!input) return null;
  const s = input.trim();

  if (ID_RE.test(s)) return s;

  let url: URL;
  try {
    url = new URL(s.startsWith('http') ? s : `https://${s}`);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, '');

  if (host === 'youtu.be') {
    const id = url.pathname.slice(1).split('/')[0];
    return ID_RE.test(id) ? id : null;
  }

  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
    const v = url.searchParams.get('v');
    if (v && ID_RE.test(v)) return v;

    const m = url.pathname.match(/^\/(embed|shorts|v|live)\/([A-Za-z0-9_-]{11})/);
    if (m) return m[2];
  }

  return null;
}

export function parseYouTubeStart(input: string): number | null {
  try {
    const url = new URL(input.startsWith('http') ? input : `https://${input}`);
    const t = url.searchParams.get('t') ?? url.searchParams.get('start');
    if (!t) return null;
    const m = t.match(/^(?:(\d+)m)?(?:(\d+)s?)?$/);
    if (!m) {
      const n = parseInt(t, 10);
      return Number.isFinite(n) && n > 0 ? n : null;
    }
    const mins = parseInt(m[1] ?? '0', 10);
    const secs = parseInt(m[2] ?? '0', 10);
    const total = mins * 60 + secs;
    return total > 0 ? total : null;
  } catch {
    return null;
  }
}

export function buildEmbedUrl(id: string, startSec?: number | null): string {
  const base = `https://www.youtube.com/embed/${id}`;
  return startSec && startSec > 0 ? `${base}?start=${startSec}` : base;
}
