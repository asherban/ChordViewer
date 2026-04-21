import { describe, it, expect, vi, afterEach } from 'vitest'
import { parseYouTubeId, parseYouTubeStart, buildEmbedUrl, fetchVideoTitle } from './youtube'

const VALID_ID = 'dQw4w9WgXcQ'

describe('parseYouTubeId', () => {
  it('accepts a bare 11-character video ID', () => {
    expect(parseYouTubeId(VALID_ID)).toBe(VALID_ID)
  })

  it('parses standard watch URL', () => {
    expect(parseYouTubeId(`https://www.youtube.com/watch?v=${VALID_ID}`)).toBe(VALID_ID)
  })

  it('parses short youtu.be URL', () => {
    expect(parseYouTubeId(`https://youtu.be/${VALID_ID}`)).toBe(VALID_ID)
  })

  it('parses shorts URL', () => {
    expect(parseYouTubeId(`https://youtube.com/shorts/${VALID_ID}`)).toBe(VALID_ID)
  })

  it('parses mobile m.youtube.com URL', () => {
    expect(parseYouTubeId(`https://m.youtube.com/watch?v=${VALID_ID}`)).toBe(VALID_ID)
  })

  it('parses music.youtube.com URL', () => {
    expect(parseYouTubeId(`https://music.youtube.com/watch?v=${VALID_ID}`)).toBe(VALID_ID)
  })

  it('parses embed URL', () => {
    expect(parseYouTubeId(`https://www.youtube.com/embed/${VALID_ID}`)).toBe(VALID_ID)
  })

  it('parses URL with timestamp parameter', () => {
    expect(parseYouTubeId(`https://youtu.be/${VALID_ID}?t=90`)).toBe(VALID_ID)
  })

  it('returns null for empty input', () => {
    expect(parseYouTubeId('')).toBeNull()
  })

  it('returns null for non-YouTube URL', () => {
    expect(parseYouTubeId('https://vimeo.com/123456')).toBeNull()
  })

  it('returns null for invalid bare string', () => {
    expect(parseYouTubeId('not-a-url')).toBeNull()
  })

  it('returns null for ID that is too short', () => {
    expect(parseYouTubeId('shortid')).toBeNull()
  })
})

describe('parseYouTubeStart', () => {
  it('parses t=90 as 90 seconds', () => {
    expect(parseYouTubeStart(`https://youtu.be/${VALID_ID}?t=90`)).toBe(90)
  })

  it('parses t=1m30s as 90 seconds', () => {
    expect(parseYouTubeStart(`https://youtu.be/${VALID_ID}?t=1m30s`)).toBe(90)
  })

  it('parses t=2m as 120 seconds', () => {
    expect(parseYouTubeStart(`https://youtu.be/${VALID_ID}?t=2m`)).toBe(120)
  })

  it('parses start= parameter', () => {
    expect(parseYouTubeStart(`https://www.youtube.com/watch?v=${VALID_ID}&start=45`)).toBe(45)
  })

  it('returns null when no timestamp present', () => {
    expect(parseYouTubeStart(`https://youtu.be/${VALID_ID}`)).toBeNull()
  })

  it('returns null for t=0', () => {
    expect(parseYouTubeStart(`https://youtu.be/${VALID_ID}?t=0`)).toBeNull()
  })
})

describe('buildEmbedUrl', () => {
  it('builds a basic embed URL with no start time', () => {
    expect(buildEmbedUrl(VALID_ID)).toBe(`https://www.youtube.com/embed/${VALID_ID}`)
  })

  it('appends start param when startSec > 0', () => {
    expect(buildEmbedUrl(VALID_ID, 90)).toBe(`https://www.youtube.com/embed/${VALID_ID}?start=90`)
  })

  it('omits start param when startSec is 0', () => {
    expect(buildEmbedUrl(VALID_ID, 0)).toBe(`https://www.youtube.com/embed/${VALID_ID}`)
  })

  it('omits start param when startSec is null', () => {
    expect(buildEmbedUrl(VALID_ID, null)).toBe(`https://www.youtube.com/embed/${VALID_ID}`)
  })

  it('omits start param when startSec is undefined', () => {
    expect(buildEmbedUrl(VALID_ID, undefined)).toBe(`https://www.youtube.com/embed/${VALID_ID}`)
  })
})

describe('fetchVideoTitle', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns title from oEmbed response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ title: 'Never Gonna Give You Up' }),
    }))
    const title = await fetchVideoTitle(VALID_ID)
    expect(title).toBe('Never Gonna Give You Up')
  })

  it('returns null when response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    const title = await fetchVideoTitle(VALID_ID)
    expect(title).toBeNull()
  })

  it('returns null when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')))
    const title = await fetchVideoTitle(VALID_ID)
    expect(title).toBeNull()
  })

  it('returns null when title is missing from response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    }))
    const title = await fetchVideoTitle(VALID_ID)
    expect(title).toBeNull()
  })
})
