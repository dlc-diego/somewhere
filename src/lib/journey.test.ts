import { describe, expect, it } from 'vitest'
import { areAdjacent, countryById } from './countries'
import {
  addGuess,
  hasWon,
  hasEnded,
  newRound,
  parseRound,
  revealAnswer,
  storageKeyFor,
  loadRound,
  MODE_KEY,
  type Round,
} from './game'
import { shortestBorderRoute } from './journey'

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
    expect(shortestBorderRoute('FRA', 'BRA')).toEqual(['FRA', 'BRA'])
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
        expect(areAdjacent(countryById.get(route[step - 1])!, countryById.get(route[step])!)).toBe(
          true,
        )
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
