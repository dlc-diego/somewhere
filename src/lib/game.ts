import { canCrossBorder, randomBorderJourney, shortestBorderRoute } from './journey'
import { areAdjacent, countries, countryById, locationFor, type GameMode } from './countries'
import { distanceKm, temperatureFor } from './geo'
import { validTrackingId } from './playerData'

export interface Round {
  version: 2
  mode: GameMode
  revealed: boolean
  answer: string
  guesses: string[]
  hintUsed?: boolean
  start?: string
  trackingId?: string
}
export const STORAGE_KEY = 'somewhere.round.v1'
export const MODE_KEY = 'somewhere.mode.v1'
export const storageKeyFor = (mode: GameMode) =>
  mode === 'countries' ? STORAGE_KEY : `somewhere.${mode}.v1`

export function newRound(previousAnswer?: string, mode: GameMode = 'countries'): Round {
  if (mode === 'journey') {
    const { start, destination } = randomBorderJourney(previousAnswer)
    return { version: 2, mode, revealed: false, answer: destination, start, guesses: [] }
  }
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
    ...(mode === 'flags' || mode === 'shapes' ? { hintUsed: false } : {}),
  }
}

export function hasWon(round: Round): boolean {
  return !round.revealed && round.guesses.includes(round.answer)
}

export const hasEnded = (round: Round) => round.revealed || hasWon(round)
export function revealAnswer(round: Round): Round {
  return hasEnded(round) ? round : { ...round, revealed: true }
}

export function revealContinentHint(round: Round): Round {
  return (round.mode !== 'flags' && round.mode !== 'shapes') || hasEnded(round) || round.hintUsed
    ? round
    : { ...round, hintUsed: true }
}

export function addGuess(round: Round, id: string): { round: Round; error?: string } {
  if (hasEnded(round))
    return { round, error: 'This round is complete. Start a new round to keep exploring.' }
  const item = round.mode === 'capitals' ? 'capital' : 'country'
  if (!countryById.has(id)) return { round, error: `Choose a ${item} from the suggestions.` }
  if (round.mode === 'journey') {
    const current = countryById.get(round.guesses.at(-1) || round.start!)!
    if (current.id === id)
      return { round, error: `You are already in ${current.name}. Choose a neighboring country.` }
    if (!canCrossBorder(current.id, id))
      return {
        round,
        error: `${countryById.get(id)!.name} does not share a continuous mainland border with ${current.name}. Try another crossing.`,
      }
    if (round.guesses.length >= 1000)
      return {
        round,
        error:
          'This journey has reached its crossing limit. Reveal the route to begin a fresh journey.',
      }
    return { round: { ...round, guesses: [...round.guesses, id] } }
  }
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
      (mode !== 'countries' &&
        mode !== 'capitals' &&
        mode !== 'flags' &&
        mode !== 'shapes' &&
        mode !== 'journey') ||
      (expectedMode !== undefined && mode !== expectedMode) ||
      typeof revealed !== 'boolean' ||
      typeof answer !== 'string' ||
      !countryById.has(answer) ||
      !Array.isArray(guesses)
    )
      return null
    if (raw.hintUsed !== undefined && typeof raw.hintUsed !== 'boolean') return null
    if (raw.trackingId !== undefined && !validTrackingId(raw.trackingId)) return null
    if (
      guesses.length > (mode === 'journey' ? 1000 : countries.length) ||
      guesses.some((g) => typeof g !== 'string' || !countryById.has(g))
    )
      return null
    if (mode !== 'journey' && new Set(guesses).size !== guesses.length) return null
    if (mode === 'journey') {
      if (
        typeof raw.start !== 'string' ||
        raw.start === answer ||
        !shortestBorderRoute(raw.start, answer)
      )
        return null
      let current = raw.start
      for (const id of guesses as string[]) {
        if (!canCrossBorder(current, id)) return null
        current = id
      }
    }
    if (guesses.slice(0, -1).includes(answer)) return null
    if (revealed && guesses.includes(answer)) return null
    return {
      version: 2,
      mode,
      revealed,
      answer,
      guesses,
      ...(raw.trackingId ? { trackingId: raw.trackingId as string } : {}),
      ...(mode === 'journey' ? { start: raw.start as string } : {}),
      ...(mode === 'flags' || mode === 'shapes' ? { hintUsed: raw.hintUsed === true } : {}),
    }
  } catch {
    return null
  }
}

export function loadRound(requestedMode?: GameMode): { round: Round; warning: string } {
  let mode = requestedMode || 'countries'
  try {
    if (!requestedMode) {
      const savedMode = localStorage.getItem(MODE_KEY)
      if (
        savedMode === 'capitals' ||
        savedMode === 'flags' ||
        savedMode === 'shapes' ||
        savedMode === 'journey'
      )
        mode = savedMode
    }
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
