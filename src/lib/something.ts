import { triviaQuestions, type TriviaQuestion } from '../data/trivia'
import { mysteries } from '../data/mysteries'
import { createMysteryGame, type Session } from './mystery'
import { validTrackingId } from './playerData'
export type { Session, MysteryRound } from './mystery'
export { normalizeAnswer } from './mystery'
import type { CelebrationRequest } from './celebrations'

export type TriviaPool = 'standard' | 'hard'
export type TriviaSession = Session<TriviaRound> & {
  cycles?: Partial<Record<TriviaPool, string[]>>
}
export const TRIVIA_DIFFICULTY_KEY = 'something.difficulty.v1'
export type SomethingMode = 'trivia' | 'mystery'
export interface TriviaRound {
  difficulty?: TriviaPool
  version: 1
  ids: string[]
  orders: number[][]
  responses: number[]
  index: number
  trackingId?: string
}
export const TRIVIA_LENGTH = 10
export const SOMETHING_MODE_KEY = 'something.mode.v1'
export const TRIVIA_KEY = 'something.trivia.v1'
export const MYSTERY_KEY = 'something.mystery.v1'
export const questionById = new Map(triviaQuestions.map((q) => [q.id, q]))
export const {
  byId: mysteryById,
  newSession: newMysterySession,
  solved: mysterySolved,
  ended: mysteryEnded,
  guess: guessMystery,
  nextClue: nextMysteryClue,
  reveal: revealMystery,
  parseSession: parseMysterySession,
} = createMysteryGame(mysteries)

function shuffle<T>(items: readonly T[]): T[] {
  const result = [...items]
  const sample = new Uint32Array(1)
  for (let i = result.length - 1; i > 0; i--) {
    const ceiling = Math.floor(2 ** 32 / (i + 1)) * (i + 1)
    do {
      crypto.getRandomValues(sample)
    } while (sample[0] >= ceiling)
    const j = sample[0] % (i + 1)
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}
export function newTriviaSession(
  previous?: TriviaSession,
  difficulty: TriviaPool = previous?.round.difficulty || 'standard',
): TriviaSession {
  const previousPool = previous?.round.difficulty || 'standard'
  const cycles = { ...previous?.cycles }
  if (previous)
    cycles[previousPool] = [
      ...new Set([...(cycles[previousPool] || []), ...previous.seen, ...previous.round.ids]),
    ].filter((id) => questionById.has(id))
  let seen = [...(cycles[difficulty] || [])]
  const questions = triviaQuestions.filter((q) => difficulty !== 'hard' || q.difficulty === 'hard')
  const ids = [...new Set(questions.map((q) => q.category))].map((category) => {
    const pool = questions.filter((q) => q.category === category).map((q) => q.id)
    let fresh = pool.filter((id) => !seen.includes(id))
    if (!fresh.length) {
      // Each category begins a fresh bag only after its eligible pool is exhausted.
      seen = seen.filter((id) => !pool.includes(id))
      fresh = pool
    }
    const withoutPrevious = fresh.filter((id) => !previous?.round.ids.includes(id))
    return shuffle(withoutPrevious.length ? withoutPrevious : fresh)[0]
  })
  cycles[difficulty] = seen
  return {
    version: 1,
    seen,
    cycles,
    round: {
      version: 1,
      difficulty,
      ids: shuffle(ids),
      orders: Array.from({ length: TRIVIA_LENGTH }, () => shuffle([0, 1, 2, 3])),
      responses: [],
      index: 0,
    },
  }
}

export function presentedChoices(round: TriviaRound, index = round.index): string[] {
  return round.orders[index].map((i) => questionById.get(round.ids[index])!.choices[i])
}
export function isTriviaCorrect(round: TriviaRound, index: number): boolean {
  return (
    round.responses[index] !== undefined &&
    presentedChoices(round, index)[round.responses[index]] ===
      questionById.get(round.ids[index])!.answer
  )
}
export function triviaScore(round: TriviaRound): number {
  return round.responses.filter((_, index) => isTriviaCorrect(round, index)).length
}
export function triviaStreak(round: TriviaRound): number {
  let count = 0
  for (let i = round.responses.length - 1; i >= 0 && isTriviaCorrect(round, i); i--) count++
  return count
}
export const isPerfectRound = (round: TriviaRound) =>
  round.responses.length === TRIVIA_LENGTH && triviaScore(round) === TRIVIA_LENGTH
export function answerTrivia(round: TriviaRound, choice: number): TriviaRound {
  if (
    round.index >= TRIVIA_LENGTH ||
    round.responses.length !== round.index ||
    !Number.isInteger(choice) ||
    choice < 0 ||
    choice > 3
  )
    return round
  return { ...round, responses: [...round.responses, choice] }
}
export function nextTriviaQuestion(round: TriviaRound): TriviaRound {
  return round.index < TRIVIA_LENGTH && round.responses.length === round.index + 1
    ? { ...round, index: round.index + 1 }
    : round
}
export function triviaCelebrations(round: TriviaRound): CelebrationRequest[] {
  if (!round.responses.length || !isTriviaCorrect(round, round.responses.length - 1)) return []
  const streak = triviaStreak(round)
  return [
    streak >= 3 ? { effect: 'fire-streak', intensity: streak } : { effect: 'normal' },
    ...(isPerfectRound(round) ? [{ effect: 'perfect-round' as const }] : []),
  ]
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function validSeen(value: unknown, pool: Map<string, TriviaQuestion>): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= pool.size &&
    value.every((id) => typeof id === 'string' && pool.has(id)) &&
    new Set(value).size === value.length
  )
}
export function parseTriviaSession(raw: string | null): TriviaSession | null {
  try {
    const session: unknown = JSON.parse(raw || 'null')
    if (
      !record(session) ||
      session.version !== 1 ||
      !record(session.round) ||
      !validSeen(session.seen, questionById)
    )
      return null
    const r = session.round
    if (session.cycles !== undefined) {
      if (
        !record(session.cycles) ||
        Object.keys(session.cycles).some((key) => key !== 'standard' && key !== 'hard')
      )
        return null
      for (const [pool, seen] of Object.entries(session.cycles))
        if (
          !validSeen(seen, questionById) ||
          (pool === 'hard' && seen.some((id) => questionById.get(id)!.difficulty !== 'hard'))
        )
          return null
    }
    if (r.difficulty !== undefined && r.difficulty !== 'standard' && r.difficulty !== 'hard')
      return null
    if (
      r.difficulty === 'hard' &&
      session.seen.some((id: string) => questionById.get(id)!.difficulty !== 'hard')
    )
      return null
    if (r.trackingId !== undefined && !validTrackingId(r.trackingId)) return null
    if (
      r.version !== 1 ||
      !Array.isArray(r.ids) ||
      r.ids.length !== TRIVIA_LENGTH ||
      r.ids.some((id) => typeof id !== 'string' || !questionById.has(id)) ||
      new Set(r.ids).size !== TRIVIA_LENGTH ||
      !Array.isArray(r.orders) ||
      r.orders.length !== TRIVIA_LENGTH ||
      r.orders.some(
        (order) =>
          !Array.isArray(order) ||
          order.length !== 4 ||
          [...order].sort().join(',') !== '0,1,2,3' ||
          order.some((i) => !Number.isInteger(i)),
      ) ||
      !Number.isInteger(r.index) ||
      (r.index as number) < 0 ||
      (r.index as number) > TRIVIA_LENGTH ||
      !Array.isArray(r.responses) ||
      r.responses.some((choice) => !Number.isInteger(choice) || choice < 0 || choice > 3) ||
      r.responses.length > TRIVIA_LENGTH ||
      (r.responses.length !== r.index && r.responses.length !== (r.index as number) + 1)
    )
      return null
    if (
      r.difficulty === 'hard' &&
      (r.ids as string[]).some((id) => questionById.get(id)!.difficulty !== 'hard')
    )
      return null
    return session as unknown as TriviaSession
  } catch {
    return null
  }
}
export function loadSomething() {
  try {
    const rawTrivia = localStorage.getItem(TRIVIA_KEY)
    const rawMystery = localStorage.getItem(MYSTERY_KEY)
    const trivia = parseTriviaSession(rawTrivia)
    const difficulty: TriviaPool =
      localStorage.getItem(TRIVIA_DIFFICULTY_KEY) === 'hard' ? 'hard' : 'standard'
    const mystery = parseMysterySession(rawMystery)
    return {
      mode: (localStorage.getItem(SOMETHING_MODE_KEY) === 'mystery'
        ? 'mystery'
        : 'trivia') as SomethingMode,
      difficulty,
      trivia: trivia || newTriviaSession(undefined, difficulty),
      mystery: mystery || newMysterySession(),
      warning:
        (rawTrivia && !trivia) || (rawMystery && !mystery)
          ? 'A saved Something round could not be read. A fresh round is ready for that game.'
          : '',
    }
  } catch {
    return {
      mode: 'trivia' as SomethingMode,
      difficulty: 'standard' as TriviaPool,
      trivia: newTriviaSession(),
      mystery: newMysterySession(),
      warning: 'Browser storage is unavailable. These rounds may not survive a refresh.',
    }
  }
}
