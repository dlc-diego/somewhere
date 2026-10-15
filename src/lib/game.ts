import { areAdjacent, countries, countryById } from './countries'
import { distanceKm, temperatureFor } from './geo'

export interface Round {
  version: 1
  answer: string
  guesses: string[]
}
export const STORAGE_KEY = 'somewhere.round.v1'

export function newRound(previousAnswer?: string): Round {
  const pool = countries.filter((c) => c.id !== previousAnswer)
  // Rejection sampling keeps selection uniform without modulo bias.
  const sample = new Uint32Array(1)
  const ceiling = Math.floor(2 ** 32 / pool.length) * pool.length
  do {
    crypto.getRandomValues(sample)
  } while (sample[0] >= ceiling)
  return { version: 1, answer: pool[sample[0] % pool.length].id, guesses: [] }
}

export function hasWon(round: Round): boolean {
  return round.guesses.includes(round.answer)
}

export function addGuess(round: Round, id: string): { round: Round; error?: string } {
  if (hasWon(round)) return { round, error: 'You found it! Start a new round to keep exploring.' }
  if (!countryById.has(id)) return { round, error: 'Choose a country from the suggestions.' }
  if (round.guesses.includes(id))
    return { round, error: 'You have already guessed that country. Try somewhere new.' }
  return { round: { ...round, guesses: [...round.guesses, id] } }
}

export function guessDetails(round: Round) {
  const answer = countryById.get(round.answer)!
  return round.guesses.map((id, i) => {
    const country = countryById.get(id)!
    const distance = distanceKm(country, answer)
    const adjacent = areAdjacent(country, answer)
    return {
      country,
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

export function parseRound(value: string | null): Round | null {
  if (!value) return null
  try {
    const r: unknown = JSON.parse(value)
    if (!r || typeof r !== 'object') return null
    const { version, answer, guesses } = r as Record<string, unknown>
    if (
      version !== 1 ||
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
    return { version: 1, answer, guesses }
  } catch {
    return null
  }
}

export function loadRound(): { round: Round; warning: string } {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    const restored = parseRound(saved)
    return {
      round: restored || newRound(),
      warning:
        saved && !restored ? 'Your saved round could not be read. A fresh round is ready.' : '',
    }
  } catch {
    return {
      round: newRound(),
      warning:
        'Browser storage is unavailable. You can play, but this round may not survive a refresh.',
    }
  }
}
