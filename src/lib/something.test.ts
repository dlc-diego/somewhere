import { describe, expect, it } from 'vitest'
import { triviaQuestions } from '../data/trivia'
import { mysteries } from '../data/mysteries'
import {
  answerTrivia,
  guessMystery,
  isPerfectRound,
  isTriviaCorrect,
  loadSomething,
  mysteryEnded,
  mysterySolved,
  newMysterySession,
  newTriviaSession,
  nextMysteryClue,
  nextTriviaQuestion,
  normalizeAnswer,
  parseMysterySession,
  parseTriviaSession,
  presentedChoices,
  questionById,
  revealMystery,
  triviaCelebrations,
  triviaScore,
  triviaStreak,
  MYSTERY_KEY,
  SOMETHING_MODE_KEY,
  TRIVIA_KEY,
  type MysteryRound,
  type TriviaRound,
} from './something'
import { fireSettings } from './celebrations'

function knownTrivia(): TriviaRound {
  return {
    version: 1,
    ids: triviaQuestions.slice(0, 10).map((q) => q.id),
    orders: Array.from({ length: 10 }, () => [2, 0, 3, 1]),
    responses: [],
    index: 0,
  }
}
const knownMystery = (): MysteryRound => ({
  version: 1,
  id: 'refrigerator',
  guesses: [],
  cluesShown: 1,
  revealed: false,
})
const session = <R>(round: R) => ({ version: 1 as const, round, seen: [] })

describe('Something content', () => {
  it('has 400 distinct, complete questions with four unique choices and one answer', () => {
    expect(triviaQuestions).toHaveLength(400)
    expect(new Set(triviaQuestions.map((q) => q.id)).size).toBe(400)
    expect(new Set(triviaQuestions.map((q) => normalizeAnswer(q.question))).size).toBe(400)
    expect(new Set(triviaQuestions.map((q) => q.category)).size).toBe(10)
    for (const category of new Set(triviaQuestions.map((q) => q.category)))
      expect(triviaQuestions.filter((q) => q.category === category)).toHaveLength(40)
    for (const q of triviaQuestions) {
      expect(q.question.length).toBeGreaterThan(15)
      expect(q.choices).toHaveLength(4)
      expect(new Set(q.choices.map(normalizeAnswer)).size).toBe(4)
      expect(q.choices.filter((choice) => choice === q.answer)).toHaveLength(1)
      expect(q.explanation.length).toBeGreaterThan(25)
    }
  })
  it('has 80 distinct mysteries with five progressive clues and useful answers', () => {
    expect(mysteries).toHaveLength(80)
    expect(new Set(mysteries.map((m) => m.id)).size).toBe(80)
    expect(new Set(mysteries.map((m) => normalizeAnswer(m.answer))).size).toBe(80)
    for (const m of mysteries) {
      expect(m.clues).toHaveLength(5)
      expect(new Set(m.clues).size).toBe(5)
      expect(m.clues.every((clue) => clue.length > 15)).toBe(true)
      expect(normalizeAnswer(m.answer)).not.toBe('')
      expect(m.aliases.every((alias) => normalizeAnswer(alias).length > 0)).toBe(true)
      expect(m.explanation.length).toBeGreaterThan(25)
    }
  })
  it('accepts every mystery answer and alias without collisions between different mysteries', () => {
    const owners = new Map<string, string>()
    for (const m of mysteries) {
      for (const answer of [m.answer, ...m.aliases]) {
        const normalized = normalizeAnswer(answer)
        expect(owners.get(normalized) || m.id).toBe(m.id)
        owners.set(normalized, m.id)
        const round: MysteryRound = {
          version: 1,
          id: m.id,
          cluesShown: 1,
          guesses: [],
          revealed: false,
        }
        const solved = guessMystery(round, `The ${answer.toUpperCase()}!`)
        expect(solved.error).toBeUndefined()
        expect(mysterySolved(solved.round)).toBe(true)
        expect(parseMysterySession(JSON.stringify(session(solved.round)))).toEqual(
          session(solved.round),
        )
      }
    }
  })
})

describe('General Trivia', () => {
  it('shuffles ten distinct questions and choices, prioritizes unseen items and avoids the previous round', () => {
    const first = newTriviaSession()
    const next = newTriviaSession(first)
    expect(first.round.ids).toHaveLength(10)
    expect(new Set(first.round.ids).size).toBe(10)
    expect(next.round.ids.some((id) => first.round.ids.includes(id))).toBe(false)
    for (const order of first.round.orders) expect([...order].sort()).toEqual([0, 1, 2, 3])
    const unseen = triviaQuestions[50].id
    const prior = {
      ...first,
      seen: triviaQuestions.filter((q) => q.id !== unseen).map((q) => q.id),
      round: { ...first.round, ids: triviaQuestions.slice(0, 10).map((q) => q.id) },
    }
    expect(newTriviaSession(prior).round.ids).toContain(unseen)
    expect(parseTriviaSession(JSON.stringify(next))).toEqual(next)
  })
  it('locks answers, requires an answer before continuing, and validates choice indexes', () => {
    const first = knownTrivia()
    expect(nextTriviaQuestion(first)).toBe(first)
    for (const bad of [-1, 4, 0.5, NaN, Infinity]) expect(answerTrivia(first, bad)).toBe(first)
    const answered = answerTrivia(first, 1)
    expect(isTriviaCorrect(answered, 0)).toBe(true)
    expect(triviaScore(answered)).toBe(1)
    expect(answerTrivia(answered, 0)).toBe(answered)
    expect(presentedChoices(answered)[1]).toBe(questionById.get(answered.ids[0])!.answer)
    expect(nextTriviaQuestion(answered).index).toBe(1)
  })
  it('starts fire at exactly three correct answers, escalates each continuation, and resets after a wrong answer', () => {
    let round = knownTrivia()
    for (let count = 1; count <= 5; count++) {
      round = answerTrivia(round, 1)
      expect(triviaStreak(round)).toBe(count)
      expect(triviaCelebrations(round)).toEqual(
        count < 3 ? [{ effect: 'normal' }] : [{ effect: 'fire-streak', intensity: count }],
      )
      round = nextTriviaQuestion(round)
    }
    round = answerTrivia(round, 0)
    expect(triviaStreak(round)).toBe(0)
    expect(triviaCelebrations(round)).toEqual([])
    round = answerTrivia(nextTriviaQuestion(round), 1)
    expect(triviaStreak(round)).toBe(1)
    expect(triviaScore(round)).toBe(6)
    expect(triviaCelebrations(round)).toEqual([{ effect: 'normal' }])
  })
  it('adds a separate perfect-round effect only after ten correct answers', () => {
    let round = knownTrivia()
    for (let count = 1; count <= 10; count++) {
      round = answerTrivia(round, 1)
      expect(isPerfectRound(round)).toBe(count === 10)
      if (count < 10)
        expect(triviaCelebrations(round).some((effect) => effect.effect === 'perfect-round')).toBe(
          false,
        )
      if (count < 10) round = nextTriviaQuestion(round)
    }
    expect(triviaCelebrations(round)).toEqual([
      { effect: 'fire-streak', intensity: 10 },
      { effect: 'perfect-round' },
    ])
    const summary = nextTriviaQuestion(round)
    expect(summary.index).toBe(10)
    expect(answerTrivia(summary, 0)).toBe(summary)
    expect(nextTriviaQuestion(summary)).toBe(summary)
    expect(parseTriviaSession(JSON.stringify(session(summary)))).toEqual(session(summary))
    const imperfect = { ...round, responses: [0, ...round.responses.slice(1)] }
    expect(isPerfectRound(imperfect)).toBe(false)
    expect(triviaScore(imperfect)).toBe(9)
    expect(triviaCelebrations(imperfect)).toEqual([{ effect: 'fire-streak', intensity: 9 }])
  })
  it('bounds fire particle load while increasing size, count and speed at every supported streak', () => {
    for (const mobile of [true, false]) {
      for (let streak = 3; streak < 10; streak++) {
        const a = fireSettings(streak, mobile)
        const b = fireSettings(streak + 1, mobile)
        expect(b.count).toBeGreaterThan(a.count)
        expect(b.scale).toBeGreaterThan(a.scale)
        expect(b.speed).toBeGreaterThan(a.speed)
      }
      expect(fireSettings(999, mobile)).toEqual(fireSettings(10, mobile))
      expect(fireSettings(NaN, mobile)).toEqual(fireSettings(3, mobile))
    }
    expect(fireSettings(10, true).count).toBeLessThanOrEqual(56)
    expect(fireSettings(10, false).count).toBeLessThanOrEqual(84)
  })
  it('rejects corrupt question sets, duplicate orders, invalid responses and impossible progress', () => {
    for (const patch of [
      { ids: ['unknown', ...knownTrivia().ids.slice(1)] },
      { ids: Array(10).fill('animal-01') },
      { orders: Array.from({ length: 10 }, () => [0, 1, 2, 2]) },
      { orders: Array.from({ length: 10 }, () => ['0', '1', '2', '3']) },
      { responses: [4] },
      { responses: [0, 1], index: 0 },
      { index: 1 },
      { index: 11 },
      { index: -1 },
    ])
      expect(parseTriviaSession(JSON.stringify(session({ ...knownTrivia(), ...patch })))).toBeNull()
    expect(parseTriviaSession('{')).toBeNull()
    expect(
      parseTriviaSession(JSON.stringify({ ...session(knownTrivia()), seen: ['unknown'] })),
    ).toBeNull()
  })
})

describe('What am I', () => {
  it('normalizes capitalization, accents, punctuation and leading articles and accepts aliases', () => {
    expect(normalizeAnswer('  THE Réfrigerator! ')).toBe('refrigerator')
    for (const answer of ['FRIDGE', 'the refrigerator', 'a Fridge!', 'réfrigerator']) {
      const result = guessMystery(knownMystery(), answer)
      expect(result.error).toBeUndefined()
      expect(mysterySolved(result.round)).toBe(true)
      expect(mysteryEnded(result.round)).toBe(true)
    }
  })
  it('keeps wrong guesses and clues independent, rejects duplicates, and wins only on an accepted answer', () => {
    let round = knownMystery()
    expect(guessMystery(round, '?!').error).toBeTruthy()
    expect(guessMystery(round, 'x'.repeat(101)).error).toBeTruthy()
    round = guessMystery(round, 'Oven').round
    expect(mysterySolved(round)).toBe(false)
    expect(guessMystery(round, ' the OVEN! ').error).toContain('already tried')
    const hinted = nextMysteryClue(round)
    expect(hinted.cluesShown).toBe(2)
    expect(hinted.guesses).toEqual(['Oven'])
    round = guessMystery(hinted, 'fridge').round
    expect(mysterySolved(round)).toBe(true)
    expect(nextMysteryClue(round)).toBe(round)
    expect(guessMystery(round, 'Oven').error).toContain('complete')
  })
  it('reveals all available hints without adding guesses and giving up does not count as a win', () => {
    let round = knownMystery()
    for (let i = 0; i < 10; i++) round = nextMysteryClue(round)
    expect(round.cluesShown).toBe(5)
    expect(round.guesses).toEqual([])
    const revealed = revealMystery(round)
    expect(mysterySolved(revealed)).toBe(false)
    expect(mysteryEnded(revealed)).toBe(true)
    expect(revealed.guesses).toEqual([])
    expect(revealMystery(revealed)).toBe(revealed)
    expect(nextMysteryClue(revealed)).toBe(revealed)
  })
  it('chooses fresh mysteries, restores hints and guesses, and rejects impossible saved wins', () => {
    const first = newMysterySession()
    const next = newMysterySession(first)
    expect(next.round.id).not.toBe(first.round.id)
    expect(next.seen).toContain(first.round.id)
    const valid = session(guessMystery(nextMysteryClue(knownMystery()), 'oven').round)
    expect(parseMysterySession(JSON.stringify(valid))).toEqual(valid)
    for (const patch of [
      { id: 'unknown' },
      { cluesShown: 0 },
      { cluesShown: 6 },
      { guesses: ['oven', 'OVEN!'] },
      { guesses: ['fridge', 'oven'] },
      { guesses: ['fridge'], revealed: true },
      { guesses: [4] },
      { guesses: ['?!'] },
    ])
      expect(
        parseMysterySession(JSON.stringify(session({ ...knownMystery(), ...patch }))),
      ).toBeNull()
    expect(parseMysterySession('{')).toBeNull()
  })
  it('keeps separate saved rounds and recovers a damaged round without erasing the other game', () => {
    const trivia = session(knownTrivia())
    const mystery = session(guessMystery(knownMystery(), 'oven').round)
    const data = new Map([
      [TRIVIA_KEY, JSON.stringify(trivia)],
      [MYSTERY_KEY, JSON.stringify(mystery)],
      [SOMETHING_MODE_KEY, 'mystery'],
    ])
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: { getItem: (key: string) => data.get(key) || null },
    })
    try {
      expect(loadSomething()).toMatchObject({ mode: 'mystery', trivia, mystery, warning: '' })
      data.set(TRIVIA_KEY, '{')
      expect(loadSomething().mystery).toEqual(mystery)
      expect(loadSomething().warning).toContain('could not be read')
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: {
          getItem: () => {
            throw new Error('blocked')
          },
        },
      })
      expect(loadSomething().warning).toContain('storage is unavailable')
    } finally {
      if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor)
      else Reflect.deleteProperty(globalThis, 'localStorage')
    }
  })
})
