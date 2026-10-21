import { describe, expect, it, vi } from 'vitest'
import { areAdjacent, countries, countryById, locationFor } from './countries'
import {
  addGuess,
  hasWon,
  guessDetails,
  hasEnded,
  newRound,
  parseRound,
  revealAnswer,
  storageKeyFor,
  loadRound,
  MODE_KEY,
  type Round,
} from './game'
import exclusions from '../data/journey-border-exclusions.json'
import {
  canCrossBorder,
  landConnectionFor,
  randomBorderJourney,
  shortestBorderRoute,
} from './journey'

const journey = (): Round => ({
  version: 2,
  mode: 'journey',
  start: 'PRT',
  answer: 'ITA',
  revealed: false,
  guesses: [],
})

describe('border journeys', () => {
  it('finds shortest undirected routes and excludes unreachable or invalid locations', () => {
    expect(shortestBorderRoute('PRT', 'ITA')).toEqual(['PRT', 'ESP', 'FRA', 'ITA'])
    expect(shortestBorderRoute('ITA', 'PRT')).toEqual(['ITA', 'FRA', 'ESP', 'PRT'])
    expect(shortestBorderRoute('PRT', 'PRT')).toEqual(['PRT'])
    expect(shortestBorderRoute('PRT', 'JPN')).toBeNull()
    expect(shortestBorderRoute('XXX', 'ITA')).toBeNull()
    expect(shortestBorderRoute('FRA', 'BRA')).toBeNull()
  })
  it('rejects every reviewed overseas, detached-exclave and island crossing in both directions', () => {
    for (const {
      countries: [a, b],
    } of exclusions) {
      expect(countryById.has(a)).toBe(true)
      expect(countryById.has(b)).toBe(true)
      expect(areAdjacent(countryById.get(a)!, countryById.get(b)!)).toBe(true)
      expect(canCrossBorder(a, b)).toBe(false)
      expect(canCrossBorder(b, a)).toBe(false)
      const round: Round = {
        version: 2,
        mode: 'journey',
        start: a,
        answer: b,
        guesses: [],
        revealed: false,
      }
      expect(addGuess(round, b).error).toContain('continuous mainland border')
      expect(parseRound(JSON.stringify({ ...round, guesses: [b] }), 'journey')).toBeNull()
    }
    expect(canCrossBorder('XXX', 'FRA')).toBe(false)
    expect(canCrossBorder('FRA', 'FRA')).toBe(false)
    // Political adjacency in the mystery modes keeps its existing meaning.
    expect(areAdjacent(countryById.get('CAN')!, countryById.get('DNK')!)).toBe(true)
  })
  it('keeps the Americas disconnected from Africa–Eurasia, including indirect routes', () => {
    const americas = countries.filter((country) => country.continent.endsWith('America'))
    for (const start of americas) {
      for (const destination of ['DNK', 'FRA', 'ESP', 'RUS', 'CHN', 'MAR', 'GBR']) {
        expect(shortestBorderRoute(start.id, destination)).toBeNull()
        expect(shortestBorderRoute(destination, start.id)).toBeNull()
      }
    }
    expect(shortestBorderRoute('USA', 'BRA')).not.toBeNull()
    expect(shortestBorderRoute('PRT', 'CHN')).not.toBeNull()
    expect(shortestBorderRoute('EGY', 'ISR')).toEqual(['EGY', 'ISR'])
    expect(shortestBorderRoute('RUS', 'POL')!.length).toBeGreaterThan(2)
    expect(shortestBorderRoute('AZE', 'TUR')!.length).toBeGreaterThan(2)
    expect(shortestBorderRoute('MYS', 'PNG')).toBeNull()
    expect(shortestBorderRoute('MYS', 'TLS')).toBeNull()
    expect(shortestBorderRoute('MYS', 'BRN')).toBeNull()
    expect(landConnectionFor('CAN')).toBe('Americas')
    expect(landConnectionFor('BRA')).toBe('Americas')
    expect(landConnectionFor('FRA')).toBe('Africa–Eurasia')
  })
  it('keeps the globe and route on peninsular Malaysia without changing other modes', () => {
    const malaysia = countryById.get('MYS')!
    const point = locationFor(malaysia, 'journey')
    expect(point).toMatchObject({ name: 'Malaysia', lat: 4.2, lng: 102.1 })
    expect(locationFor(malaysia, 'countries')).toBe(malaysia)
    const round: Round = {
      version: 2,
      mode: 'journey',
      start: 'THA',
      answer: 'MYS',
      guesses: ['MYS'],
      revealed: false,
    }
    expect(guessDetails(round)[0].location).toEqual(point)
    expect(canCrossBorder('THA', 'MYS')).toBe(true)
  })
  it('generates connected, nontrivial journeys, excluding the previous destination', () => {
    for (let index = 0; index < 100; index++) {
      const round = newRound('ITA', 'journey')
      const route = shortestBorderRoute(round.start!, round.answer)!
      expect(route.length).toBeGreaterThanOrEqual(4)
      expect(route.length).toBeLessThanOrEqual(7)
      expect(round.answer).not.toBe('ITA')
      expect(round.guesses).toEqual([])
      expect(parseRound(JSON.stringify(round), 'journey')).toEqual(round)
      for (let step = 1; step < route.length; step++)
        expect(canCrossBorder(route[step - 1], route[step])).toBe(true)
      expect(landConnectionFor(round.start!)).toBe(landConnectionFor(round.answer))
    }
  })
  it('gives both land networks half of region selections regardless of route-pool size', () => {
    const random = vi.spyOn(crypto, 'getRandomValues')
    try {
      // Include equally many even and odd region draws from both halves of the Uint32 range.
      // A pooled-route sampler fails this check because Americas pairs are rare.
      const counts = { Americas: 0, 'Africa–Eurasia': 0 }
      for (let index = 0; index < 100; index++) {
        const regionDraw = index + (index % 2 ? 2 ** 31 : 0)
        random
          .mockImplementationOnce((values) => {
            ;(values as Uint32Array)[0] = regionDraw
            return values
          })
          .mockImplementationOnce((values) => {
            ;(values as Uint32Array)[0] = index
            return values
          })
        const route = randomBorderJourney(index % 2 ? 'FRA' : 'BRA')
        const connection = landConnectionFor(route.start) as keyof typeof counts
        counts[connection]++
        expect(landConnectionFor(route.destination)).toBe(connection)
        expect(route.destination).not.toBe(index % 2 ? 'FRA' : 'BRA')
        const path = shortestBorderRoute(route.start, route.destination)!
        expect(path.length).toBeGreaterThanOrEqual(4)
        expect(path.length).toBeLessThanOrEqual(7)
      }
      expect(counts).toEqual({ Americas: 50, 'Africa–Eurasia': 50 })
      expect(random).toHaveBeenCalledTimes(200)
    } finally {
      random.mockRestore()
    }
  })
  it('rejects invalid crossings, permits backtracking and wins only on arrival', () => {
    let round = journey()
    for (const id of ['ITA', 'JPN', 'XXX', 'PRT']) {
      const result = addGuess(round, id)
      expect(result.error).toBeTruthy()
      expect(result.round).toBe(round)
    }
    for (const id of ['ESP', 'PRT', 'ESP', 'FRA']) {
      const result = addGuess(round, id)
      expect(result.error).toBeUndefined()
      round = result.round
      expect(hasWon(round)).toBe(false)
    }
    expect(parseRound(JSON.stringify(round), 'journey')).toEqual(round)
    round = addGuess(round, 'ITA').round
    expect(hasWon(round)).toBe(true)
    expect(hasEnded(round)).toBe(true)
    expect(addGuess(round, 'FRA').round).toBe(round)
    expect(addGuess(round, 'FRA').error).toContain('complete')
  })
  it('reveals a remaining route without adding steps or claiming a win', () => {
    const round = addGuess(journey(), 'ESP').round
    const revealed = revealAnswer(round)
    expect(revealed.guesses).toEqual(['ESP'])
    expect(hasWon(revealed)).toBe(false)
    expect(hasEnded(revealed)).toBe(true)
    expect(shortestBorderRoute(revealed.guesses.at(-1)!, revealed.answer)).toEqual([
      'ESP',
      'FRA',
      'ITA',
    ])
    expect(parseRound(JSON.stringify(revealed), 'journey')).toEqual(revealed)
    expect(revealAnswer(revealed)).toBe(revealed)
    expect(revealAnswer(journey()).guesses).toEqual([])
  })
  it('rejects corrupt paths, disconnected endpoints and movement after winning', () => {
    for (const patch of [
      { start: undefined },
      { start: 'XXX' },
      { start: 'ITA' },
      { start: 'JPN' },
      { guesses: ['FRA'] },
      { guesses: ['ESP', 'FRA', 'ITA', 'FRA', 'ITA'] },
      { guesses: ['ESP', 'FRA', 'ITA'], revealed: true },
    ])
      expect(parseRound(JSON.stringify({ ...journey(), ...patch }), 'journey')).toBeNull()
    expect(parseRound(JSON.stringify(journey()), 'countries')).toBeNull()
    const tooLong = {
      ...journey(),
      guesses: Array.from({ length: 1001 }, (_, i) => (i % 2 === 0 ? 'ESP' : 'PRT')),
    }
    expect(parseRound(JSON.stringify(tooLong), 'journey')).toBeNull()
    const atLimit = { ...tooLong, guesses: tooLong.guesses.slice(0, 1000) }
    expect(addGuess(atLimit, 'ESP').error).toContain('limit')
  })
  it('restores a journey separately from other modes', () => {
    const store = new Map([
      [MODE_KEY, 'journey'],
      [storageKeyFor('journey'), JSON.stringify(journey())],
    ])
    const original = globalThis.localStorage
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: { getItem: (key: string) => store.get(key) || null },
    })
    try {
      expect(loadRound().round).toEqual(journey())
      expect(loadRound('countries').round.mode).toBe('countries')
      store.set(storageKeyFor('journey'), JSON.stringify({ ...journey(), start: 'JPN' }))
      expect(loadRound().warning).toContain('could not be read')
      expect(loadRound().round.mode).toBe('journey')
    } finally {
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: original })
    }
  })
})
