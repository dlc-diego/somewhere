import { afterEach, describe, expect, it, vi } from 'vitest'
import { people } from '../data/people'
import { normalizeAnswer, type MysteryRound, type Session } from './mystery'
import {
  SOMEONE_KEY,
  personById,
  newWhoSession,
  personSolved,
  personEnded,
  guessPerson,
  nextPersonClue,
  revealPerson,
  parseWhoSession,
  loadSomeone,
} from './someone'

afterEach(() => vi.unstubAllGlobals())
const round = (id = 'person-einstein'): MysteryRound => ({
  version: 1,
  id,
  cluesShown: 1,
  guesses: [],
  revealed: false,
})
const session = (r = round()): Session<MysteryRound> => ({ version: 1, round: r, seen: [] })

describe('Who am I content and answers', () => {
  it('has exactly 80 distinct people, eight categories and five original clues per person', () => {
    expect(people).toHaveLength(80)
    expect(personById.size).toBe(80)
    expect(new Set(people.map((p) => normalizeAnswer(p.answer))).size).toBe(80)
    const categories = new Set(people.map((p) => p.category))
    expect(categories.size).toBe(8)
    for (const category of categories)
      expect(people.filter((p) => p.category === category)).toHaveLength(10)
    for (const person of people) {
      expect(person.id).toMatch(/^person-[a-z-]+$/)
      expect(person.clues).toHaveLength(5)
      expect(new Set(person.clues).size).toBe(5)
      expect(person.clues.every((clue) => clue.length > 15)).toBe(true)
      expect(person.explanation.length).toBeGreaterThan(35)
      expect(person.aliases.length).toBeGreaterThan(0)
    }
  })
  it('accepts every answer and alias without collisions between people', () => {
    const owners = new Map<string, string>()
    for (const person of people)
      for (const name of [person.answer, ...person.aliases]) {
        const normalized = normalizeAnswer(name)
        expect(normalized.length).toBeGreaterThan(0)
        expect(owners.get(normalized) || person.id).toBe(person.id)
        owners.set(normalized, person.id)
        const result = guessPerson(round(person.id), name)
        expect(result.error).toBeUndefined()
        expect(personSolved(result.round)).toBe(true)
        expect(parseWhoSession(JSON.stringify(session(result.round)))).toEqual(
          session(result.round),
        )
      }
    expect(personSolved(guessPerson(round('person-beyonce'), '  BEYONCE! ').round)).toBe(true)
    expect(personSolved(guessPerson(round('person-pele'), 'pele').round)).toBe(true)
    expect(personSolved(guessPerson(round('person-king'), 'MLK Jr.').round)).toBe(true)
  })
  it('prioritizes all 80 unseen people and never immediately repeats a person', () => {
    let current = newWhoSession()
    const ids = new Set([current.round.id])
    for (let i = 1; i < 80; i++) {
      const next = newWhoSession(current)
      expect(next.round.id).not.toBe(current.round.id)
      expect(ids.has(next.round.id)).toBe(false)
      ids.add(next.round.id)
      current = next
    }
    expect(ids.size).toBe(80)
    expect(newWhoSession(current).round.id).not.toBe(current.round.id)
  })
})

describe('Who am I rounds and persistence', () => {
  it('retains one person, reveals clues without guesses and rejects invalid or duplicate guesses', () => {
    let r = round()
    expect(guessPerson(r, '...').round).toBe(r)
    expect(guessPerson(r, 'x'.repeat(101)).error).toBeTruthy()
    r = guessPerson(r, 'Somebody Else').round
    expect(personEnded(r)).toBe(false)
    expect(guessPerson(r, '  SOMEBODY ELSE! ').error).toMatch(/already tried/)
    for (let i = 0; i < 5; i++) r = nextPersonClue(r)
    expect(r.cluesShown).toBe(5)
    expect(r.guesses).toEqual(['Somebody Else'])
    expect(r.id).toBe('person-einstein')
    const solved = guessPerson(r, 'Einstein').round
    expect(personEnded(solved)).toBe(true)
    expect(nextPersonClue(solved)).toBe(solved)
    expect(guessPerson(solved, 'Einstein').error).toMatch(/complete/)
    expect(revealPerson(solved)).toBe(solved)
  })
  it('reveals without a win, preserves valid states and rejects corrupt or other-mode saves', () => {
    const revealed = revealPerson(round())
    expect(personEnded(revealed)).toBe(true)
    expect(personSolved(revealed)).toBe(false)
    for (const r of [
      round(),
      guessPerson(round(), 'wrong').round,
      guessPerson(round(), 'Einstein').round,
      revealed,
    ])
      expect(parseWhoSession(JSON.stringify(session(r)))).toEqual(session(r))
    for (const patch of [
      { id: 'octopus' },
      { id: 'missing' },
      { cluesShown: 0 },
      { cluesShown: 6 },
      { guesses: ['wrong', 'WRONG!'] },
      { guesses: ['Einstein', 'wrong'] },
      { guesses: ['Einstein'], revealed: true },
    ])
      expect(parseWhoSession(JSON.stringify(session({ ...round(), ...patch })))).toBeNull()
    expect(parseWhoSession('{')).toBeNull()
    expect(parseWhoSession(null)).toBeNull()
  })
  it('restores only its own session and recovers from corrupt or blocked storage', () => {
    const saved = session(nextPersonClue(guessPerson(round(), 'wrong').round))
    const storage = new Map([
      [SOMEONE_KEY, JSON.stringify(saved)],
      ['something.mystery.v1', 'untouched'],
    ])
    vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null })
    expect(loadSomeone()).toEqual({ session: saved, warning: '' })
    storage.set(SOMEONE_KEY, '{')
    expect(loadSomeone().warning).toMatch(/fresh mystery/)
    expect(storage.get('something.mystery.v1')).toBe('untouched')
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
    })
    expect(loadSomeone().warning).toMatch(/unavailable/)
    expect(personById.has(loadSomeone().session.round.id)).toBe(true)
  })
})
