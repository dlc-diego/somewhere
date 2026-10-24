import { validCheckIn, type CheckIn } from './streak'
export const STAT_MODES = [
  'countries',
  'capitals',
  'flags',
  'shapes',
  'journey',
  'trivia',
  'mystery',
  'who',
  'identify',
  'adventure',
] as const
export type StatMode = (typeof STAT_MODES)[number]
export const STAT_LABELS: Record<StatMode, string> = {
  countries: 'Countries',
  capitals: 'Capitals',
  flags: 'Flags',
  shapes: 'Shapes',
  journey: 'Border Journey',
  trivia: 'General Trivia',
  mystery: 'What am I',
  who: 'Who am I',
  identify: 'Identify Me',
  adventure: 'Somehow',
}
const GUESS_MODES: readonly StatMode[] = [
  'countries',
  'capitals',
  'flags',
  'shapes',
  'mystery',
  'who',
  'identify',
]
export type Outcome = 'active' | 'won' | 'revealed' | 'lost' | 'completed' | 'abandoned'
export interface GameRecord {
  version: 1
  id: string
  mode: StatMode
  startedAt: number
  updatedAt: number
  outcome: Outcome
  guesses: number
  correct: number
  answered: number
  bestStreak: number
  stage: number
  cluesShown?: number
  hintUsed?: boolean
  shortestCrossings?: number
}
export interface PlayerData {
  version: 1
  games: Record<string, GameRecord>
  claims: Record<string, CheckIn>
  pendingGames: string[]
  pendingClaims: string[]
}
export const emptyPlayer = (): PlayerData => ({
  version: 1,
  games: {},
  claims: {},
  pendingGames: [],
  pendingClaims: [],
})
export const playerKey = (uid: string | null) => `somewhere.player.v1:${uid || 'guest'}`
export const validTrackingId = (id: unknown): id is string =>
  typeof id === 'string' &&
  /^[a-zA-Z0-9][a-zA-Z0-9_-]{7,99}$/.test(id) &&
  !['constructor', 'prototype'].includes(id)
export function trackRound<T extends { trackingId?: string }>(
  round: T,
): Omit<T, 'trackingId'> & { trackingId: string } {
  return {
    ...round,
    trackingId: validTrackingId(round.trackingId) ? round.trackingId : crypto.randomUUID(),
  }
}
export function parseGame(value: unknown): GameRecord | null {
  if (!value || typeof value !== 'object') return null
  const g = value as GameRecord
  if (
    g.version !== 1 ||
    !validTrackingId(g.id) ||
    !STAT_MODES.includes(g.mode) ||
    !['active', 'won', 'revealed', 'lost', 'completed', 'abandoned'].includes(g.outcome) ||
    !Number.isFinite(g.startedAt) ||
    g.startedAt < 946684800000 ||
    !Number.isFinite(g.updatedAt) ||
    g.updatedAt < g.startedAt ||
    ![g.guesses, g.correct, g.answered, g.bestStreak, g.stage].every(
      (v) => Number.isInteger(v) && v >= 0 && v <= 10000,
    ) ||
    g.correct > g.answered ||
    g.bestStreak > g.correct ||
    g.stage > 13
  )
    return null
  if (
    g.cluesShown !== undefined &&
    (!['mystery', 'who', 'identify'].includes(g.mode) ||
      !Number.isInteger(g.cluesShown) ||
      g.cluesShown < 1 ||
      g.cluesShown > (g.mode === 'identify' ? 2 : 5))
  )
    return null
  if (
    g.hintUsed !== undefined &&
    (!['flags', 'shapes'].includes(g.mode) || typeof g.hintUsed !== 'boolean')
  )
    return null
  if (
    g.shortestCrossings !== undefined &&
    (g.mode !== 'journey' ||
      !Number.isInteger(g.shortestCrossings) ||
      g.shortestCrossings < 1 ||
      g.shortestCrossings > 194 ||
      (g.outcome === 'won' && g.guesses < g.shortestCrossings))
  )
    return null
  return {
    version: 1,
    id: g.id,
    mode: g.mode,
    startedAt: g.startedAt,
    updatedAt: g.updatedAt,
    outcome: g.outcome,
    guesses: g.guesses,
    correct: g.correct,
    answered: g.answered,
    bestStreak: g.bestStreak,
    stage: g.stage,
    ...(g.cluesShown !== undefined ? { cluesShown: g.cluesShown } : {}),
    ...(g.hintUsed !== undefined ? { hintUsed: g.hintUsed } : {}),
    ...(g.shortestCrossings !== undefined ? { shortestCrossings: g.shortestCrossings } : {}),
  }
}
export function mergeGame(a: GameRecord | undefined, b: GameRecord): GameRecord {
  if (!a) return b
  if (a.mode !== b.mode) return a
  const rank: Record<Outcome, number> = {
    active: 0,
    abandoned: 1,
    lost: 2,
    revealed: 3,
    completed: 4,
    won: 5,
  }
  const preferred =
    rank[a.outcome] > rank[b.outcome]
      ? a
      : rank[a.outcome] < rank[b.outcome]
        ? b
        : a.updatedAt > b.updatedAt
          ? a
          : b
  return {
    ...preferred,
    startedAt: Math.min(a.startedAt, b.startedAt),
    updatedAt: Math.max(a.updatedAt, b.updatedAt),
    guesses: Math.max(a.guesses, b.guesses),
    correct: Math.max(a.correct, b.correct),
    answered: Math.max(a.answered, b.answered),
    bestStreak: Math.max(a.bestStreak, b.bestStreak),
    stage: Math.max(a.stage, b.stage),
    ...(a.cluesShown !== undefined || b.cluesShown !== undefined
      ? { cluesShown: Math.max(a.cluesShown || 0, b.cluesShown || 0) }
      : {}),
    ...(a.hintUsed !== undefined || b.hintUsed !== undefined
      ? { hintUsed: Boolean(a.hintUsed || b.hintUsed) }
      : {}),
    ...(a.shortestCrossings !== undefined || b.shortestCrossings !== undefined
      ? { shortestCrossings: a.shortestCrossings ?? b.shortestCrossings }
      : {}),
  }
}
export function parsePlayer(raw: string | null): PlayerData {
  try {
    const data = JSON.parse(raw || 'null') as PlayerData | null
    if (!data || data.version !== 1 || !data.games || !data.claims) return emptyPlayer()
    const games: Record<string, GameRecord> = {},
      claims: Record<string, CheckIn> = {}
    for (const [id, value] of Object.entries(data.games)) {
      const g = parseGame(value)
      if (g && id === g.id) games[id] = g
    }
    for (const [id, value] of Object.entries(data.claims))
      if (validCheckIn(value) && id === String(value.day)) claims[id] = value
    return {
      version: 1,
      games,
      claims,
      pendingGames: Array.isArray(data.pendingGames)
        ? data.pendingGames.filter((id) => typeof id === 'string' && Object.hasOwn(games, id))
        : [],
      pendingClaims: Array.isArray(data.pendingClaims)
        ? data.pendingClaims.filter((id) => typeof id === 'string' && Object.hasOwn(claims, id))
        : [],
    }
  } catch {
    return emptyPlayer()
  }
}
export function mergePlayers(local: PlayerData, incoming: PlayerData): PlayerData {
  const games = { ...local.games }
  for (const [id, g] of Object.entries(incoming.games)) games[id] = mergeGame(games[id], g)
  return {
    version: 1,
    games,
    claims: { ...incoming.claims, ...local.claims },
    pendingGames: [...new Set([...local.pendingGames, ...incoming.pendingGames])],
    pendingClaims: [...new Set([...local.pendingClaims, ...incoming.pendingClaims])],
  }
}
export function statistics(data: PlayerData) {
  return STAT_MODES.map((mode) => {
    const games = Object.values(data.games).filter((g) => g.mode === mode),
      won = games.filter((g) => g.outcome === 'won')
    const winningGuesses = won.reduce((n, g) => n + g.guesses, 0)
    const clueWins = won.filter((g) => g.cluesShown !== undefined)
    const hintedWins = won.filter((g) => g.hintUsed !== undefined)
    const journeyWins = won.filter((g) => g.shortestCrossings !== undefined)
    const extraCrossings = journeyWins.reduce(
      (sum, g) => sum + Math.max(0, g.guesses - g.shortestCrossings!),
      0,
    )
    return {
      mode,
      played: games.length,
      completed: games.filter((g) => g.outcome !== 'active').length,
      wins: won.length,
      guesses: winningGuesses,
      totalGuesses: games.reduce((n, g) => n + g.guesses, 0),
      averageGuesses: GUESS_MODES.includes(mode) && won.length ? winningGuesses / won.length : null,
      averageCrossings: mode === 'journey' && won.length ? winningGuesses / won.length : null,
      answered: games.reduce((n, g) => n + g.answered, 0),
      correct: games.reduce((n, g) => n + g.correct, 0),
      bestStreak: Math.max(0, ...games.map((g) => g.bestStreak)),
      furthest: Math.max(0, ...games.map((g) => g.stage)),
      perfect: games.filter((g) => g.mode === 'trivia' && g.answered === 10 && g.correct === 10)
        .length,
      trackedClueWins: clueWins.length,
      averageClues: clueWins.length
        ? clueWins.reduce((sum, g) => sum + g.cluesShown! - (mode === 'identify' ? 1 : 0), 0) /
          clueWins.length
        : null,
      firstClueWins: clueWins.filter((g) => g.cluesShown === 1).length,
      trackedHintWins: hintedWins.length,
      noHintWins: hintedWins.filter((g) => !g.hintUsed).length,
      trackedJourneyWins: journeyWins.length,
      optimalJourneys: journeyWins.filter((g) => g.guesses === g.shortestCrossings).length,
      extraCrossings,
      averageExtraCrossings: journeyWins.length ? extraCrossings / journeyWins.length : null,
    }
  })
}

export function totalStatistics(rows: ReturnType<typeof statistics>) {
  const guessing = rows.filter((r) => GUESS_MODES.includes(r.mode))
  const solved = guessing.reduce((n, r) => n + r.wins, 0)
  const trivia = rows.find((r) => r.mode === 'trivia')
  const answered = trivia?.answered || 0
  const correct = trivia?.correct || 0
  return {
    played: rows.reduce((n, r) => n + r.played, 0),
    completed: rows.reduce((n, r) => n + r.completed, 0),
    wins: rows.reduce((n, r) => n + r.wins, 0),
    totalGuesses: guessing.reduce((n, r) => n + r.totalGuesses, 0),
    averageGuesses: solved ? guessing.reduce((n, r) => n + r.guesses, 0) / solved : null,
    answered,
    correct,
    accuracy: answered ? correct / answered : null,
    perfect: rows.reduce((n, r) => n + r.perfect, 0),
  }
}
