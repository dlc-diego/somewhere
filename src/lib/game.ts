import { areAdjacent, countries, countryById, locationFor, type GameMode } from './countries'
import { distanceKm, temperatureFor } from './geo'

export interface Round {
  version: 2
  mode: GameMode
  revealed: boolean
  answer: string
  guesses: string[]
}
export const STORAGE_KEY = 'somewhere.round.v1'
export const MODE_KEY = 'somewhere.mode.v1'
export const storageKeyFor = (mode: GameMode) =>
  mode === 'capitals' ? 'somewhere.capitals.v1' : STORAGE_KEY

export function newRound(previousAnswer?: string, mode: GameMode = 'countries'): Round {
  const pool = countries.filter((c) => c.id !== previousAnswer)
  // Rejection sampling keeps selection uniform without modulo bias.
  const sample = new Uint32Array(1)
  const ceiling = Math.floor(2 ** 32 / pool.length) * pool.length
  do {
    crypto.getRandomValues(sample)
  } while (sample[0] >= ceiling)
  return {
    version: 2,
    mode,
    revealed: false,
    answer: pool[sample[0] % pool.length].id,
    guesses: [],
  }
}

export function hasWon(round: Round): boolean {
  return !round.revealed && round.guesses.includes(round.answer)
}

export const hasEnded = (round: Round) => round.revealed || hasWon(round)
export function revealAnswer(round: Round): Round {
  return hasEnded(round) ? round : { ...round, revealed: true }
}

export function addGuess(round: Round, id: string): { round: Round; error?: string } {
  if (hasEnded(round))
    return { round, error: 'This round is complete. Start a new round to keep exploring.' }
  const item = round.mode === 'capitals' ? 'capital' : 'country'
  if (!countryById.has(id)) return { round, error: `Choose a ${item} from the suggestions.` }
  if (round.guesses.includes(id))
    return { round, error: `You have already guessed that ${item}. Try somewhere new.` }
  return { round: { ...round, guesses: [...round.guesses, id] } }
}

export function guessDetails(round: Round) {
  const answer = countryById.get(round.answer)!
  return round.guesses.map((id, i) => {
    const country = countryById.get(id)!
    const location = locationFor(country, round.mode)
    const distance = distanceKm(location, locationFor(answer, round.mode))
    const adjacent = areAdjacent(country, answer)
    return {
      country,
      location,
      distance,
      adjacent,
      temperature: temperatureFor(distance, id === answer.id, adjacent),
      number: i + 1,
    }
  })
}
export type Guess = ReturnType<typeof guessDetails>[number]

export function sortGuessesByDistance(guesses: Guess[]): Guess[] {
  return [...guesses].sort((a, b) => a.distance - b.distance || a.number - b.number)
}

export function parseRound(value: string | null, expectedMode?: GameMode): Round | null {
  if (!value) return null
  try {
    const r: unknown = JSON.parse(value)
    if (!r || typeof r !== 'object') return null
    const raw = r as Record<string, unknown>
    const { version, answer, guesses } = raw
    const mode = version === 1 ? 'countries' : raw.mode
    const revealed = version === 1 ? false : raw.revealed
    if (
      (version !== 1 && version !== 2) ||
      (mode !== 'countries' && mode !== 'capitals') ||
      (expectedMode !== undefined && mode !== expectedMode) ||
      typeof revealed !== 'boolean' ||
      typeof answer !== 'string' ||
      !countryById.has(answer) ||
      !Array.isArray(guesses)
    )
      return null
    if (
      guesses.length > countries.length ||
      guesses.some((g) => typeof g !== 'string' || !countryById.has(g))
    )
      return null
    if (new Set(guesses).size !== guesses.length) return null
    if (guesses.includes(answer) && guesses.at(-1) !== answer) return null
    if (revealed && guesses.includes(answer)) return null
    return { version: 2, mode, revealed, answer, guesses }
  } catch {
    return null
  }
}

export function loadRound(requestedMode?: GameMode): { round: Round; warning: string } {
  let mode = requestedMode || 'countries'
  try {
    if (!requestedMode && localStorage.getItem(MODE_KEY) === 'capitals') mode = 'capitals'
    const saved = localStorage.getItem(storageKeyFor(mode))
    const restored = parseRound(saved, mode)
    return {
      round: restored || newRound(undefined, mode),
      warning:
        saved && !restored ? 'Your saved round could not be read. A fresh round is ready.' : '',
    }
  } catch {
    return {
      round: newRound(undefined, mode),
      warning:
        'Browser storage is unavailable. You can play, but this round may not survive a refresh.',
    }
  }
}
