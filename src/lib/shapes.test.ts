import { readFileSync } from 'node:fs'
import { describe, expect, it, vi, afterEach } from 'vitest'
import { countries, exactLocation, searchLocations } from './countries'
import {
  newRound,
  revealContinentHint,
  revealAnswer,
  addGuess,
  guessDetails,
  hasWon,
  loadRound,
  parseRound,
  storageKeyFor,
  MODE_KEY,
  type Round,
} from './game'

afterEach(() => vi.unstubAllGlobals())
const shapeRound: Round = {
  version: 2,
  mode: 'shapes',
  answer: 'FRA',
  guesses: [],
  revealed: false,
  hintUsed: false,
}

describe('shape rounds', () => {
  it('keeps the hint, answer and guesses until a real win or reveal', () => {
    const hinted = revealContinentHint(shapeRound)
    expect(hinted).toEqual({ ...shapeRound, hintUsed: true })
    expect(revealContinentHint(hinted)).toBe(hinted)
    const guessed = addGuess(hinted, 'DEU').round
    expect(guessed).toMatchObject({ answer: 'FRA', hintUsed: true, guesses: ['DEU'] })
    expect(addGuess(guessed, 'DEU').error).toMatch(/already/)
    expect(guessDetails(guessed)).toEqual(guessDetails({ ...guessed, mode: 'countries' }))
    expect(hasWon(guessed)).toBe(false)
    const won = addGuess(guessed, 'FRA').round
    expect(hasWon(won)).toBe(true)
    expect(revealContinentHint(won)).toBe(won)
    const revealed = revealAnswer(guessed)
    expect(hasWon(revealed)).toBe(false)
    expect(revealed.guesses).toEqual(['DEU'])
    expect(addGuess(revealed, 'FRA').error).toMatch(/complete/)
  })
  it('restores an independent shape round and validates its hint and mode', () => {
    const saved = { ...shapeRound, hintUsed: true, guesses: ['JPN'] }
    const values = new Map([
      [storageKeyFor('shapes'), JSON.stringify(saved)],
      [MODE_KEY, 'shapes'],
    ])
    vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null })
    expect(loadRound().round).toEqual(saved)
    expect(parseRound(JSON.stringify(saved), 'shapes')).toEqual(saved)
    expect(parseRound(JSON.stringify(saved), 'flags')).toBeNull()
    expect(parseRound(JSON.stringify({ ...saved, hintUsed: 1 }))).toBeNull()
    expect(
      new Set(
        ['countries', 'capitals', 'flags', 'shapes'].map((mode) =>
          storageKeyFor(mode as Round['mode']),
        ),
      ).size,
    ).toBe(4)
    const next = newRound('FRA', 'shapes')
    expect(next).toMatchObject({ mode: 'shapes', guesses: [], hintUsed: false, revealed: false })
    expect(next.answer).not.toBe('FRA')
  })
  it('accepts country aliases and rejects capitals as shape guesses', () => {
    expect(exactLocation('UK', 'shapes')?.id).toBe('GBR')
    expect(searchLocations('Ivory Coast', 'shapes')[0]?.id).toBe('CIV')
    expect(searchLocations('Paris', 'shapes')).toEqual([])
  })
})

describe('bundled silhouettes', () => {
  const outlines = JSON.parse(readFileSync('public/shapes/outlines.json', 'utf8')) as {
    id: string
    path: string
    bounds: [[number, number], [number, number]]
    area: number
  }[]
  it('matches all 195 playable identities, including tiny countries and disconnected regions', () => {
    expect(outlines.map((o) => o.id).sort()).toEqual(countries.map((c) => c.id).sort())
    expect(new Set(outlines.map((o) => o.path)).size).toBe(countries.length)
    for (const country of countries) {
      const outline = outlines.find((o) => o.id === country.id)!
      const svg = readFileSync(`public/shapes/${country.id}.svg`, 'utf8')
      expect(svg).toContain('viewBox="0 0 320 220"')
      expect(svg).toContain(`d="${outline.path}"`)
      expect(svg).not.toMatch(/NaN|Infinity|<title|<text/)
      expect(outline.path).toMatch(/^M.+Z$/)
      expect(outline.area).toBeGreaterThan(0)
      // Detect reversed exteriors rendering the whole globe, notably South Sudan.
      expect(outline.area).toBeLessThan(2 * Math.PI)
      const [[left, top], [right, bottom]] = outline.bounds
      expect(left).toBeGreaterThanOrEqual(13.999)
      expect(top).toBeGreaterThanOrEqual(13.999)
      expect(right).toBeLessThanOrEqual(306.001)
      expect(bottom).toBeLessThanOrEqual(206.001)
    }
    expect(outlines.find((o) => o.id === 'TUV')!.path.match(/M/g)!.length).toBeGreaterThan(1)
    expect(outlines.find((o) => o.id === 'USA')!.path.match(/M/g)!.length).toBeGreaterThan(1)
    expect(readFileSync('public/shapes/ODbL.txt', 'utf8')).toContain('Open Database License')
  })
})
