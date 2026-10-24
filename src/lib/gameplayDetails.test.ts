import { describe, expect, it } from 'vitest'
import { triviaQuestions } from '../data/trivia'
import { hardQuestionIds } from '../data/triviaDifficulty'
import { mysteries } from '../data/mysteries'
import {
  newTriviaSession,
  parseTriviaSession,
  questionById,
  type TriviaSession,
  type TriviaPool,
} from './something'
import { createMysteryGame, type MysteryRound } from './mystery'
import { oneEditApart, spellingSlip } from './spelling'
import { guessAdventureMystery } from './adventure'
import { at } from '../../tests/helpers/adventure'
import { emptyPlayer, mergeGame, parseGame, statistics, type GameRecord } from './playerData'

const record = (patch: Partial<GameRecord> = {}): GameRecord => ({
  version: 1,
  id: 'batch2-round-1234',
  mode: 'who',
  startedAt: 1790000000000,
  updatedAt: 1790000010000,
  outcome: 'won',
  guesses: 2,
  correct: 0,
  answered: 0,
  bestStreak: 0,
  stage: 0,
  ...patch,
})

describe('balanced trivia selection and renewed decks', () => {
  it('assigns valid editorial difficulty to every question with ten hard questions per category', () => {
    expect(hardQuestionIds.size).toBe(100)
    for (const id of hardQuestionIds) expect(questionById.has(id)).toBe(true)
    for (const category of new Set(triviaQuestions.map((q) => q.category))) {
      expect(
        triviaQuestions.filter((q) => q.category === category && q.difficulty === 'hard'),
      ).toHaveLength(10)
      expect(
        triviaQuestions.filter((q) => q.category === category && q.difficulty === 'standard'),
      ).toHaveLength(30)
    }
  })
  it.each(['standard', 'hard'] as TriviaPool[])(
    'finishes two complete %s cycles without repeats inside a cycle',
    (pool) => {
      let session: TriviaSession | undefined
      const count = pool === 'hard' ? 100 : 400
      const seen = new Set<string>()
      for (let index = 0; index < (count / 10) * 2; index++) {
        const previous = session
        session = newTriviaSession(session, pool)
        expect(new Set(session.round.ids.map((id) => questionById.get(id)!.category)).size).toBe(10)
        expect(session.round.ids.some((id) => previous?.round.ids.includes(id))).toBe(false)
        if (pool === 'hard')
          expect(session.round.ids.every((id) => questionById.get(id)!.difficulty === 'hard')).toBe(
            true,
          )
        if (index === count / 10) seen.clear()
        for (const id of session.round.ids) {
          expect(seen.has(id)).toBe(false)
          seen.add(id)
        }
        expect(parseTriviaSession(JSON.stringify(session))).toEqual(session)
      }
      expect(seen.size).toBe(count)
    },
  )
  it('preserves the other pool cycle when switching difficulty and restores legacy saves unchanged', () => {
    const initial = newTriviaSession()
    const hard = newTriviaSession(initial, 'hard')
    const standard = newTriviaSession(hard, 'standard')
    expect(standard.seen).toEqual(expect.arrayContaining(initial.round.ids))
    expect(standard.round.ids.some((id) => initial.round.ids.includes(id))).toBe(false)
    const legacy = {
      version: 1,
      seen: [],
      round: {
        version: 1,
        ids: triviaQuestions.slice(0, 10).map((q) => q.id),
        orders: Array.from({ length: 10 }, () => [0, 1, 2, 3]),
        responses: [0],
        index: 0,
      },
    }
    expect(parseTriviaSession(JSON.stringify(legacy))).toEqual(legacy)
    expect(
      parseTriviaSession(JSON.stringify({ ...hard, cycles: { hard: ['animal-01'] } })),
    ).toBeNull()
    expect(
      parseTriviaSession(
        JSON.stringify({ ...hard, round: { ...hard.round, difficulty: 'invalid' } }),
      ),
    ).toBeNull()
  })
})

describe('conservative spelling assistance', () => {
  it('recognizes a single edit/transposition but never treats it as a correct answer', () => {
    for (const [a, b] of [
      ['einsten', 'einstein'],
      ['frigde', 'fridge'],
      ['refridgerator', 'refrigerator'],
      ['volcamo', 'volcano'],
    ])
      expect(oneEditApart(a, b)).toBe(true)
    expect(oneEditApart('einstenx', 'einstein')).toBe(false)
    expect(oneEditApart('fridge', 'fridge')).toBe(false)
    const game = createMysteryGame(mysteries)
    const round: MysteryRound = {
      version: 1,
      id: 'refrigerator',
      guesses: [],
      cluesShown: 1,
      revealed: false,
    }
    const result = game.guess(round, 'frigde')
    expect(result.error).toContain('no guess was used')
    expect(result.round).toBe(round)
    const other = { ...round, id: mysteries.find((m) => m.id !== 'refrigerator')!.id }
    expect(game.guess(other, 'frigde').error).toBe(result.error)
    expect(game.solved(game.guess(round, 'fridge').round)).toBe(true)
  })
  it('does not intervene on short names, ambiguous near matches, or exact answers elsewhere', () => {
    const catalog = new Map([
      ['marian', new Set(['a'])],
      ['marion', new Set(['b'])],
      ['einstein', new Set(['c'])],
    ])
    expect(spellingSlip('marien', catalog)).toBe(false)
    expect(spellingSlip('mari', catalog)).toBe(false)
    expect(spellingSlip('marian', catalog)).toBe(false)
  })
  it('preserves Somehow hearts, guesses, stock and progress when a likely misspelling is submitted', () => {
    const source = at('who')
    const run = {
      ...source,
      seenWho: [...new Set([...source.seenWho, 'person-einstein'])],
      encounter: {
        ...source.encounter!,
        mystery: { ...source.encounter!.mystery!, id: 'person-einstein' },
      },
    }
    const snapshot = structuredClone(run)
    const result = guessAdventureMystery(run, 'Einsten')
    expect(result.error).toContain('no guess was used')
    expect(result.run).toBe(run)
    expect(run).toEqual(snapshot)
    expect(guessAdventureMystery(run, 'Einstein').run.encounter!.result).toBe('cleared')
  })
})

describe('optional clue, hint and route statistics', () => {
  it('preserves legacy records and merges new details monotonically', () => {
    const old = record()
    expect(parseGame(old)).toEqual(old)
    const next = record({ cluesShown: 3 })
    expect(parseGame(next)).toEqual(next)
    expect(mergeGame(next, old).cluesShown).toBe(3)
    expect(
      mergeGame(
        record({ mode: 'flags', hintUsed: true }),
        record({ mode: 'flags', hintUsed: false }),
      ).hintUsed,
    ).toBe(true)
    expect(
      mergeGame(
        record({ mode: 'journey', shortestCrossings: 5, guesses: 5 }),
        record({ mode: 'journey', guesses: 7 }),
      ).shortestCrossings,
    ).toBe(5)
    for (const patch of [
      { cluesShown: 0 },
      { cluesShown: 6 },
      { mode: 'identify', cluesShown: 3 },
      { mode: 'countries', hintUsed: true },
      { mode: 'journey', shortestCrossings: 5, guesses: 4 },
    ])
      expect(parseGame(record(patch as Partial<GameRecord>))).toBeNull()
  })
  it('excludes unknown old details and reveals from solve averages, while retaining all wins', () => {
    const data = emptyPlayer()
    const games = [
      record(),
      record({ cluesShown: 1 }),
      record({ cluesShown: 5 }),
      record({ cluesShown: 4, outcome: 'revealed' }),
      record({ mode: 'flags', hintUsed: false }),
      record({ mode: 'flags', hintUsed: true }),
      record({ mode: 'journey', shortestCrossings: 5, guesses: 5 }),
      record({ mode: 'journey', shortestCrossings: 5, guesses: 8 }),
      record({ mode: 'identify', cluesShown: 1 }),
      record({ mode: 'identify', cluesShown: 2 }),
    ]
    games.forEach((g, i) => {
      const id = 'insight-round-' + i
      data.games[id] = { ...g, id }
    })
    const rows = statistics(data)
    expect(rows.find((r) => r.mode === 'who')).toMatchObject({
      wins: 3,
      trackedClueWins: 2,
      averageClues: 3,
      firstClueWins: 1,
    })
    expect(rows.find((r) => r.mode === 'flags')).toMatchObject({
      trackedHintWins: 2,
      noHintWins: 1,
    })
    expect(rows.find((r) => r.mode === 'journey')).toMatchObject({
      wins: 2,
      trackedJourneyWins: 2,
      optimalJourneys: 1,
      extraCrossings: 3,
      averageExtraCrossings: 1.5,
    })
    expect(rows.find((r) => r.mode === 'identify')).toMatchObject({
      averageClues: 0.5,
      firstClueWins: 1,
    })
  })
})
