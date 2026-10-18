import { triviaQuestions, type TriviaQuestion } from '../data/trivia'
import { mysteries, type Mystery } from '../data/mysteries'
import type { CelebrationRequest } from './celebrations'

export type SomethingMode = 'trivia' | 'mystery'
export interface TriviaRound {
  version: 1
  ids: string[]
  orders: number[][]
  responses: number[]
  index: number
}
export interface MysteryRound {
  version: 1
  id: string
  cluesShown: number
  guesses: string[]
  revealed: boolean
}
export interface Session<R> {
  version: 1
  round: R
  seen: string[]
}
export const TRIVIA_LENGTH = 10
export const SOMETHING_MODE_KEY = 'something.mode.v1'
export const TRIVIA_KEY = 'something.trivia.v1'
export const MYSTERY_KEY = 'something.mystery.v1'
export const questionById = new Map(triviaQuestions.map((q) => [q.id, q]))
export const mysteryById = new Map(mysteries.map((m) => [m.id, m]))

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
function choose(ids: string[], seen: string[], previous: string[], count: number) {
  const candidates = ids.filter((id) => !previous.includes(id))
  return [
    ...shuffle(candidates.filter((id) => !seen.includes(id))),
    ...shuffle(candidates.filter((id) => seen.includes(id))),
  ].slice(0, count)
}
export function newTriviaSession(previous?: Session<TriviaRound>): Session<TriviaRound> {
  const seen = [...new Set([...(previous?.seen || []), ...(previous?.round.ids || [])])].filter(
    (id) => questionById.has(id),
  )
  return {
    version: 1,
    seen,
    round: {
      version: 1,
      ids: choose([...questionById.keys()], seen, previous?.round.ids || [], TRIVIA_LENGTH),
      orders: Array.from({ length: TRIVIA_LENGTH }, () => shuffle([0, 1, 2, 3])),
      responses: [],
      index: 0,
    },
  }
}
export function newMysterySession(previous?: Session<MysteryRound>): Session<MysteryRound> {
  const seen = [
    ...new Set([...(previous?.seen || []), ...(previous ? [previous.round.id] : [])]),
  ].filter((id) => mysteryById.has(id))
  return {
    version: 1,
    seen,
    round: {
      version: 1,
      id: choose([...mysteryById.keys()], seen, previous ? [previous.round.id] : [], 1)[0],
      cluesShown: 1,
      guesses: [],
      revealed: false,
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

export function normalizeAnswer(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/^(a|an|the)\s+/, '')
    .replace(/[^\p{L}\p{N}]/gu, '')
}
export function mysterySolved(round: MysteryRound): boolean {
  if (round.revealed) return false
  const item = mysteryById.get(round.id)!
  const answers = [item.answer, ...item.aliases].map(normalizeAnswer)
  return round.guesses.some((guess) => answers.includes(normalizeAnswer(guess)))
}
export const mysteryEnded = (round: MysteryRound) => round.revealed || mysterySolved(round)
export function guessMystery(
  round: MysteryRound,
  raw: string,
): { round: MysteryRound; error?: string } {
  if (mysteryEnded(round)) return { round, error: 'This mystery is complete. Try another mystery.' }
  const guess = raw.trim()
  if (!normalizeAnswer(guess) || guess.length > 100)
    return { round, error: 'Enter an answer of up to 100 characters.' }
  if (round.guesses.some((previous) => normalizeAnswer(previous) === normalizeAnswer(guess)))
    return { round, error: 'You already tried that answer. Try something new.' }
  if (round.guesses.length >= 200)
    return {
      round,
      error: 'That is a lot of exploring! Reveal the answer to begin a fresh mystery.',
    }
  return { round: { ...round, guesses: [...round.guesses, guess] } }
}
export function nextMysteryClue(round: MysteryRound): MysteryRound {
  return mysteryEnded(round) || round.cluesShown >= mysteryById.get(round.id)!.clues.length
    ? round
    : { ...round, cluesShown: round.cluesShown + 1 }
}
export const revealMystery = (round: MysteryRound): MysteryRound =>
  mysteryEnded(round) ? round : { ...round, revealed: true }

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function validSeen(
  value: unknown,
  pool: Map<string, TriviaQuestion> | Map<string, Mystery>,
): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= pool.size &&
    value.every((id) => typeof id === 'string' && pool.has(id)) &&
    new Set(value).size === value.length
  )
}
export function parseTriviaSession(raw: string | null): Session<TriviaRound> | null {
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
    return session as unknown as Session<TriviaRound>
  } catch {
    return null
  }
}
export function parseMysterySession(raw: string | null): Session<MysteryRound> | null {
  try {
    const session: unknown = JSON.parse(raw || 'null')
    if (
      !record(session) ||
      session.version !== 1 ||
      !record(session.round) ||
      !validSeen(session.seen, mysteryById)
    )
      return null
    const r = session.round
    if (
      r.version !== 1 ||
      typeof r.id !== 'string' ||
      !mysteryById.has(r.id) ||
      !Number.isInteger(r.cluesShown) ||
      (r.cluesShown as number) < 1 ||
      (r.cluesShown as number) > mysteryById.get(r.id)!.clues.length ||
      typeof r.revealed !== 'boolean' ||
      !Array.isArray(r.guesses) ||
      r.guesses.length > 200 ||
      r.guesses.some(
        (guess) =>
          typeof guess !== 'string' ||
          guess !== guess.trim() ||
          guess.length > 100 ||
          !normalizeAnswer(guess),
      )
    )
      return null
    const round = r as unknown as MysteryRound
    if (new Set(round.guesses.map(normalizeAnswer)).size !== round.guesses.length) return null
    const accepted = [mysteryById.get(round.id)!.answer, ...mysteryById.get(round.id)!.aliases].map(
      normalizeAnswer,
    )
    if (
      round.guesses.slice(0, -1).some((guess) => accepted.includes(normalizeAnswer(guess))) ||
      (round.revealed && round.guesses.some((guess) => accepted.includes(normalizeAnswer(guess))))
    )
      return null
    return session as unknown as Session<MysteryRound>
  } catch {
    return null
  }
}
export function loadSomething() {
  try {
    const rawTrivia = localStorage.getItem(TRIVIA_KEY)
    const rawMystery = localStorage.getItem(MYSTERY_KEY)
    const trivia = parseTriviaSession(rawTrivia)
    const mystery = parseMysterySession(rawMystery)
    return {
      mode: (localStorage.getItem(SOMETHING_MODE_KEY) === 'mystery'
        ? 'mystery'
        : 'trivia') as SomethingMode,
      trivia: trivia || newTriviaSession(),
      mystery: mystery || newMysterySession(),
      warning:
        (rawTrivia && !trivia) || (rawMystery && !mystery)
          ? 'A saved Something round could not be read. A fresh round is ready for that game.'
          : '',
    }
  } catch {
    return {
      mode: 'trivia' as SomethingMode,
      trivia: newTriviaSession(),
      mystery: newMysterySession(),
      warning: 'Browser storage is unavailable. These rounds may not survive a refresh.',
    }
  }
}
