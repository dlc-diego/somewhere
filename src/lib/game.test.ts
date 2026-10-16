import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  addGuess,
  guessDetails,
  hasWon,
  hasEnded,
  loadRound,
  newRound,
  parseRound,
  revealAnswer,
  storageKeyFor,
  MODE_KEY,
  sortGuessesByDistance,
  type Round,
} from './game'
import {
  countries,
  areAdjacent,
  countryById,
  countryByNumeric,
  exactCountry,
  exactLocation,
  searchLocations,
  searchCountries,
} from './countries'

const round: Round = { version: 2, mode: 'countries', revealed: false, answer: 'FRA', guesses: [] }
afterEach(() => vi.unstubAllGlobals())

describe('capital rounds and giving up', () => {
  const capitalRound: Round = { ...round, mode: 'capitals' }
  it('measures between capitals, not country centers, and ranks by city distance', () => {
    const capitals = guessDetails({ ...capitalRound, guesses: ['DEU', 'GBR'] })
    const countryGuesses = guessDetails({ ...round, guesses: ['DEU', 'GBR'] })
    expect(capitals[1].location.name).toBe('London')
    expect(capitals[1].distance).toBeGreaterThan(330)
    expect(capitals[1].distance).toBeLessThan(355)
    expect(countryGuesses[1].distance).toBeGreaterThan(900)
    expect(sortGuessesByDistance(capitals)[0].country.id).toBe('GBR')
    expect(sortGuessesByDistance(countryGuesses)[0].country.id).toBe('DEU')
  })
  it('uses shared-country borders for adjacent capitals and keeps duplicate/win rules', () => {
    const neighbors = guessDetails({ ...capitalRound, answer: 'RUS', guesses: ['CHN'] })
    expect(neighbors[0]).toMatchObject({ adjacent: true, temperature: 'adjacent' })
    expect(neighbors[0].distance).toBeGreaterThan(3000)
    const first = addGuess(capitalRound, 'GBR').round
    expect(addGuess(first, 'GBR').error).toMatch(/capital/)
    const completed = addGuess(first, 'FRA').round
    expect(hasWon(completed)).toBe(true)
    expect(guessDetails(completed).at(-1)?.location.name).toBe('Paris')
    expect(newRound('FRA', 'capitals')).toMatchObject({
      mode: 'capitals',
      revealed: false,
      guesses: [],
    })
  })
  it.each(['countries', 'capitals'] as const)(
    'reveals %s without adding a guess, winning, or permitting more guesses',
    (mode) => {
      const active: Round = { ...round, mode, guesses: ['GBR'] }
      const revealed = revealAnswer(active)
      expect(revealed).toEqual({ ...active, revealed: true })
      expect(active.revealed).toBe(false)
      expect(hasWon(revealed)).toBe(false)
      expect(hasEnded(revealed)).toBe(true)
      expect(addGuess(revealed, 'FRA').round).toBe(revealed)
      expect(addGuess(revealed, 'FRA').error).toMatch(/complete/)
      expect(parseRound(JSON.stringify(revealed))).toEqual(revealed)
    },
  )
  it('allows giving up before any guesses and preserves an already won round', () => {
    expect(revealAnswer(capitalRound)).toMatchObject({ guesses: [], revealed: true })
    const won = addGuess(capitalRound, 'FRA').round
    expect(revealAnswer(won)).toBe(won)
    expect(hasWon(won)).toBe(true)
  })
})
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
    const r: Round = { ...round, answer: 'RUS', guesses: ['CHN', 'JPN', 'RUS'] }
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
  it('migrates existing country saves without changing answers or guesses', () => {
    expect(parseRound(JSON.stringify({ version: 1, answer: 'FRA', guesses: ['DEU'] }))).toEqual({
      ...round,
      guesses: ['DEU'],
    })
  })
  it('keeps separate mode saves and restores the last selected mode', () => {
    const capital: Round = { ...round, mode: 'capitals', revealed: true, guesses: ['GBR'] }
    const data = new Map([
      [storageKeyFor('countries'), JSON.stringify({ version: 1, answer: 'FRA', guesses: ['DEU'] })],
      [storageKeyFor('capitals'), JSON.stringify(capital)],
      [MODE_KEY, 'capitals'],
    ])
    vi.stubGlobal('localStorage', { getItem: (key: string) => data.get(key) || null })
    expect(loadRound().round).toEqual(capital)
    expect(loadRound('countries').round).toEqual({ ...round, guesses: ['DEU'] })
    expect(parseRound(JSON.stringify(capital), 'countries')).toBeNull()
    expect(parseRound(JSON.stringify({ ...round, mode: 'other' }))).toBeNull()
    expect(parseRound(JSON.stringify({ ...round, revealed: true, guesses: ['FRA'] }))).toBeNull()
  })
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
    JSON.stringify({ ...round, version: 3 }),
  ])('rejects corrupt or impossible state: %s', (value) => {
    expect(parseRound(value)).toBeNull()
  })
})

describe('country metadata and aliases', () => {
  it('provides one named capital point with finite, valid coordinates per playable country', () => {
    for (const country of countries) {
      expect(country.capital.name.length).toBeGreaterThan(0)
      expect(Number.isFinite(country.capital.lat)).toBe(true)
      expect(Number.isFinite(country.capital.lng)).toBe(true)
      expect(Math.abs(country.capital.lat)).toBeLessThanOrEqual(90)
      expect(Math.abs(country.capital.lng)).toBeLessThanOrEqual(180)
      expect(exactLocation(country.capital.name, 'capitals')?.id).toBe(country.id)
    }
  })
  it.each([
    ['paris', 'FRA'],
    ['Washington D.C.', 'USA'],
    ['Kiev', 'UKR'],
    ['Nur-Sultan', 'KAZ'],
    ['Ulan Bator', 'MNG'],
    ['Kotte', 'LKA'],
  ])('matches capital alias %s to %s', (query, id) => {
    expect(exactLocation(query, 'capitals')?.id).toBe(id)
    expect(searchLocations(query, 'capitals')[0]?.id).toBe(id)
  })
  it('searches cities in capital mode and does not treat other co-capitals as aliases', () => {
    expect(searchLocations('France', 'capitals')).toEqual([])
    expect(searchLocations('Cape Town', 'capitals')).toEqual([])
    expect(exactLocation('Pretoria', 'capitals')?.id).toBe('ZAF')
  })
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
      expect(Number.isFinite(c.area)).toBe(true)
      expect(c.area).toBeGreaterThan(0)
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
