import { afterEach, describe, expect, it, vi } from 'vitest'
import { portraitFixture } from '../../tests/helpers/portraits'
import manifest from '../../public/portraits/manifest.json'
import {
  validatePortraits,
  identifyGame,
  loadIdentify,
  IDENTIFY_KEY,
  fetchPortraits,
} from './identify'

afterEach(() => vi.unstubAllGlobals())
describe('Identify Me collection and game logic', () => {
  it('accepts the complete production collection with its actual licensing records', () => {
    expect(validatePortraits(manifest)).toHaveLength(80)
    expect(identifyGame(validatePortraits(manifest)).byId.size).toBe(80)
  })
  it('requires 80 unique people, supported licensing, valid local filenames and complete credits', () => {
    const fixture = portraitFixture()
    expect(validatePortraits(fixture)).toBe(fixture.images)
    for (const bad of [
      null,
      {},
      { version: 1, images: [] },
      { ...fixture, images: fixture.images.slice(1) },
      { ...fixture, images: [fixture.images[0], ...fixture.images.slice(0, -1)] },
    ])
      expect(() => validatePortraits(bad)).toThrow(/unavailable/)
    for (const patch of [
      { creator: '' },
      { personId: 'unknown' },
      { file: '../unsafe.webp' },
      { sha256: 'bad' },
      { verifiedAt: 'yesterday' },
      { width: 0 },
      { sourceUrl: 'https://example.org/File:Test.jpg' },
      { originalUrl: 'http://upload.wikimedia.org/test.jpg' },
      {
        license: {
          name: 'CC BY-NC 4.0',
          code: 'CC-BY-NC-4.0',
          url: 'https://creativecommons.org/licenses/by-nc/4.0/',
          attributionRequired: true,
        },
      },
      { license: { ...fixture.images[0].license, url: 'https://example.org' } },
    ])
      expect(() =>
        validatePortraits({
          ...fixture,
          images: [{ ...fixture.images[0], ...patch }, ...fixture.images.slice(1)],
        }),
      ).toThrow(/unavailable/)
  })
  it('accepts only explicit public-domain and CC0 rights statements', () => {
    const fixture = portraitFixture()
    fixture.images[0].license = {
      name: 'Public domain',
      code: 'Public-Domain',
      url: fixture.images[0].sourceUrl + '#Licensing',
      attributionRequired: false,
    }
    fixture.images[1].license = {
      name: 'CC0 1.0',
      code: 'CC0-1.0',
      url: 'https://creativecommons.org/publicdomain/zero/1.0/',
      attributionRequired: false,
    }
    expect(validatePortraits(fixture)).toHaveLength(80)
    fixture.images[0].license.url = 'https://example.org/not-proof'
    expect(() => validatePortraits(fixture)).toThrow()
  })
  it('starts with a picture, offers one free text clue and preserves guesses and completion', () => {
    const game = identifyGame(portraitFixture().images)
    const round = {
      version: 1 as const,
      id: 'portrait-001',
      cluesShown: 1,
      guesses: [],
      revealed: false,
    }
    const hinted = game.nextClue(round)
    expect(hinted.cluesShown).toBe(2)
    expect(hinted.guesses).toEqual([])
    expect(game.nextClue(hinted)).toBe(hinted)
    const wrong = game.guess(hinted, 'Wrong Person').round
    expect(game.guess(wrong, 'WRONG PERSON!').error).toMatch(/already tried/)
    const solved = game.guess(wrong, 'Einstein').round
    expect(game.solved(solved)).toBe(true)
    expect(
      game.parseSession(JSON.stringify({ version: 1, seen: [], round: solved }))?.round,
    ).toEqual(solved)
    expect(game.solved(game.reveal(round))).toBe(false)
    expect(game.newSession({ version: 1, seen: [], round: solved }).round.id).not.toBe(
      'portrait-001',
    )
  })
  it('isolates saved progress from Who am I and handles corrupt or blocked storage', () => {
    const game = identifyGame(portraitFixture().images)
    const saved = game.newSession()
    const data = new Map([
      [IDENTIFY_KEY, JSON.stringify(saved)],
      ['someone.who.v1', 'untouched'],
    ])
    vi.stubGlobal('localStorage', { getItem: (key: string) => data.get(key) || null })
    expect(loadIdentify(game)).toEqual({ session: saved, warning: '' })
    data.set(IDENTIFY_KEY, '{')
    expect(loadIdentify(game).warning).toMatch(/fresh portrait/)
    expect(data.get('someone.who.v1')).toBe('untouched')
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
    })
    expect(loadIdentify(game).warning).toMatch(/unavailable/)
  })
  it('loads only the local manifest and surfaces missing or invalid collection errors', async () => {
    const fixture = portraitFixture()
    const request = vi.fn().mockResolvedValue({ ok: true, json: async () => fixture })
    vi.stubGlobal('fetch', request)
    expect(await fetchPortraits()).toHaveLength(80)
    expect(request.mock.calls[0][0]).toBe('/portraits/manifest.json')
    request.mockResolvedValue({ ok: false })
    await expect(fetchPortraits()).rejects.toThrow(/could not load/)
    request.mockResolvedValue({ ok: true, json: async () => ({ version: 1, images: [] }) })
    await expect(fetchPortraits()).rejects.toThrow(/unavailable/)
  })
})
