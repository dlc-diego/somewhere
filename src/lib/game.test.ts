import { describe, expect, it } from 'vitest'
import {
  addGuess,
  guessDetails,
  hasWon,
  newRound,
  parseRound,
  sortGuessesByDistance,
  type Round,
} from './game'
import {
  countries,
  areAdjacent,
  countryById,
  countryByNumeric,
  exactCountry,
  searchCountries,
} from './countries'

const round: Round = { version: 1, answer: 'FRA', guesses: [] }
describe('game rules', () => {
  it('keeps the answer stable and does not mutate the previous round', () => {
    const result = addGuess(round, 'JPN')
    expect(result.round).toEqual({ ...round, guesses: ['JPN'] })
    expect(round.guesses).toEqual([])
    expect(hasWon(result.round)).toBe(false)
    expect(guessDetails(result.round)[0].distance).toBeGreaterThan(9000)
  })
  it('rejects duplicate and unknown guesses without changing the round', () => {
    const first = addGuess(round, 'DEU').round
    expect(addGuess(first, 'DEU').error).toMatch(/already/)
    expect(addGuess(first, 'DEU').round).toBe(first)
    expect(addGuess(first, 'INVALID').error).toBeTruthy()
    expect(first.guesses).toEqual(['DEU'])
  })
  it('detects a win only for the exact answer, then rejects further guesses', () => {
    const win = addGuess(addGuess(round, 'DEU').round, 'FRA').round
    expect(hasWon(win)).toBe(true)
    expect(guessDetails(win).at(-1)).toMatchObject({ distance: 0, temperature: 'found', number: 2 })
    expect(addGuess(win, 'ESP').round).toBe(win)
    expect(addGuess(win, 'ESP').error).toBeTruthy()
  })
  it('starts a clean round with a valid country different from the previous answer', () => {
    for (let i = 0; i < 20; i++) {
      const next = newRound('FRA')
      expect(countryById.has(next.answer)).toBe(true)
      expect(next.answer).not.toBe('FRA')
      expect(next.guesses).toEqual([])
    }
  })
  it('marks neighboring countries adjacent even when their centers are far apart', () => {
    const r: Round = { version: 1, answer: 'RUS', guesses: ['CHN', 'JPN', 'RUS'] }
    const details = guessDetails(r)
    expect(details[0].distance).toBeGreaterThan(1000)
    expect(details[0]).toMatchObject({ adjacent: true, temperature: 'adjacent' })
    expect(details[1].adjacent).toBe(false)
    expect(details[2]).toMatchObject({ adjacent: false, temperature: 'found' })
  })
  it('puts the closest guess first without changing guess numbers or saved chronological order', () => {
    const r: Round = { ...round, guesses: ['GBR', 'DEU', 'JPN'] }
    const details = guessDetails(r)
    const sorted = sortGuessesByDistance(details)
    expect(sorted.map((g) => g.country.id)).toEqual(['DEU', 'GBR', 'JPN'])
    expect(sorted.map((g) => g.number)).toEqual([2, 1, 3])
    expect(details.map((g) => g.country.id)).toEqual(r.guesses)
    expect(r.guesses).toEqual(['GBR', 'DEU', 'JPN'])
    expect(
      sortGuessesByDistance(guessDetails({ ...r, guesses: [...r.guesses, 'FRA'] }))[0].temperature,
    ).toBe('found')
  })
  it('keeps equal-distance guesses in their original order', () => {
    const details = guessDetails({ ...round, guesses: ['GBR', 'DEU'] }).map((g) => ({
      ...g,
      distance: 100,
    }))
    expect(sortGuessesByDistance([...details].reverse()).map((g) => g.number)).toEqual([1, 2])
  })
})

describe('saved rounds', () => {
  it('round-trips active and completed games', () => {
    expect(parseRound(JSON.stringify({ ...round, guesses: ['ESP'] }))).toEqual({
      ...round,
      guesses: ['ESP'],
    })
    expect(parseRound(JSON.stringify({ ...round, guesses: ['FRA'] }))).toEqual({
      ...round,
      guesses: ['FRA'],
    })
  })
  it.each([
    null,
    '{}',
    'broken json',
    'null',
    '[]',
    JSON.stringify({ ...round, answer: 'XXX' }),
    JSON.stringify({ ...round, guesses: ['XXX'] }),
    JSON.stringify({ ...round, guesses: ['DEU', 'DEU'] }),
    JSON.stringify({ ...round, guesses: ['FRA', 'DEU'] }),
    JSON.stringify({ ...round, version: 2 }),
  ])('rejects corrupt or impossible state: %s', (value) => {
    expect(parseRound(value)).toBeNull()
  })
})

describe('country metadata and aliases', () => {
  it('has symmetric land borders containing only valid, distinct playable identities', () => {
    for (const country of countries) {
      expect(country.borders).not.toContain(country.id)
      expect(new Set(country.borders).size).toBe(country.borders.length)
      for (const neighbor of country.borders) {
        expect(countryById.get(neighbor)?.borders).toContain(country.id)
      }
    }
  })
  it('handles overseas land borders and islands without treating sea crossings as adjacency', () => {
    const adjacent = (a: string, b: string) => areAdjacent(countryById.get(a)!, countryById.get(b)!)
    expect(adjacent('FRA', 'BRA')).toBe(true)
    expect(adjacent('FRA', 'SUR')).toBe(true)
    expect(adjacent('FRA', 'NLD')).toBe(true)
    expect(adjacent('GBR', 'ESP')).toBe(true)
    expect(adjacent('CAN', 'DNK')).toBe(true)
    expect(adjacent('ITA', 'VAT')).toBe(true)
    expect(adjacent('IND', 'LKA')).toBe(false)
    expect(adjacent('GBR', 'FRA')).toBe(false)
    expect(adjacent('JPN', 'KOR')).toBe(false)
    expect(adjacent('FRA', 'FRA')).toBe(false)
  })
  it('has 195 unique alpha-3 and numeric identities with valid coordinates', () => {
    expect(countries).toHaveLength(195)
    expect(countryById.size).toBe(195)
    expect(countryByNumeric.size).toBe(195)
    for (const c of countries) {
      expect(c.id).toMatch(/^[A-Z]{3}$/)
      expect(c.numeric).toMatch(/^\d{3}$/)
      expect(Math.abs(c.lat)).toBeLessThanOrEqual(90)
      expect(Math.abs(c.lng)).toBeLessThanOrEqual(180)
    }
  })
  it.each([
    ['uk', 'GBR'],
    ['USA', 'USA'],
    ['  Côte d’Ivoire ', 'CIV'],
    ['ivory coast', 'CIV'],
    ['Türkiye', 'TUR'],
    ['UAE', 'ARE'],
    ['Swaziland', 'SWZ'],
    ['Vatican', 'VAT'],
    ['Cape Verde', 'CPV'],
  ])('resolves %s to %s', (query, id) => {
    expect(exactCountry(query)?.id).toBe(id)
    expect(searchCountries(query)[0]?.id).toBe(id)
  })
  it('returns no matches for empty or unknown input', () => {
    expect(searchCountries('  ')).toEqual([])
    expect(searchCountries('Atlantis')).toEqual([])
  })
})
