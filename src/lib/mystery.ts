import type { Mystery } from '../data/mysteries'
import { validTrackingId } from './playerData'

export interface MysteryRound {
  version: 1
  id: string
  cluesShown: number
  guesses: string[]
  revealed: boolean
  trackingId?: string
}
export interface Session<R> {
  version: 1
  round: R
  seen: string[]
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
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function validSeen(value: unknown, pool: Map<string, Mystery>): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= pool.size &&
    value.every((id) => typeof id === 'string' && pool.has(id)) &&
    new Set(value).size === value.length
  )
}

export function createMysteryGame(items: readonly Mystery[]) {
  const mysteryById = new Map(items.map((item) => [item.id, item]))
  function newMysterySession(previous?: Session<MysteryRound>): Session<MysteryRound> {
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
  function mysterySolved(round: MysteryRound): boolean {
    if (round.revealed) return false
    const item = mysteryById.get(round.id)!
    const answers = [item.answer, ...item.aliases].map(normalizeAnswer)
    return round.guesses.some((guess) => answers.includes(normalizeAnswer(guess)))
  }
  const mysteryEnded = (round: MysteryRound) => round.revealed || mysterySolved(round)
  function guessMystery(round: MysteryRound, raw: string): { round: MysteryRound; error?: string } {
    if (mysteryEnded(round))
      return { round, error: 'This mystery is complete. Try another mystery.' }
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
  function nextMysteryClue(round: MysteryRound): MysteryRound {
    return mysteryEnded(round) || round.cluesShown >= mysteryById.get(round.id)!.clues.length
      ? round
      : { ...round, cluesShown: round.cluesShown + 1 }
  }
  const revealMystery = (round: MysteryRound): MysteryRound =>
    mysteryEnded(round) ? round : { ...round, revealed: true }
  function parseMysterySession(raw: string | null): Session<MysteryRound> | null {
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
      if (r.trackingId !== undefined && !validTrackingId(r.trackingId)) return null
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
      const accepted = [
        mysteryById.get(round.id)!.answer,
        ...mysteryById.get(round.id)!.aliases,
      ].map(normalizeAnswer)
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
  return {
    byId: mysteryById,
    newSession: newMysterySession,
    solved: mysterySolved,
    ended: mysteryEnded,
    guess: guessMystery,
    nextClue: nextMysteryClue,
    reveal: revealMystery,
    parseSession: parseMysterySession,
  }
}
