import pools from '../data/daily-pools.v1.json' with { type: 'json' }
import { type Country } from './countries'
import { addGuess, hasWon, parseRound, type Round } from './game'
import { questionById, mysteryById } from './something'
import { people } from '../data/people'
import { mysteries } from '../data/mysteries'
import { createMysteryGame } from './mystery'
import { streakDay } from './streak'

export const DAILY_VERSION = 1
export const DAILY_LENGTH = 5
export type DailyKind = 'trivia' | 'flags' | 'shapes' | 'countries' | 'capitals' | 'who' | 'mystery'
export const DAILY_LABELS: Record<DailyKind, string> = {
  trivia: 'General Trivia',
  flags: 'Flags',
  shapes: 'Shapes',
  countries: 'Countries',
  capitals: 'Capitals',
  who: 'Who am I',
  mystery: 'What am I',
}
export interface DailyTrial {
  kind: DailyKind
  id: string
  guesses: string[]
  choice: number | null
  cluesShown: number
  hintUsed: boolean
  revealed: boolean
}
export interface DailySession {
  version: 1
  day: number
  started: boolean
  index: number
  trials: DailyTrial[]
}
export interface DailySummary {
  version: 1
  day: number
  challengeVersion: 1
  status: 'started' | 'finished'
  attempted: number
  solved: number
  score: number
}
const textGames = { who: createMysteryGame(people), mystery: createMysteryGame(mysteries) }
export const dailyStorageKey = (uid: string | null) => 'somewhere.daily.v1:' + (uid || 'guest')
export const dailyTrackingId = (day: number) => 'daily-v1-' + day

function randomFor(seed: string) {
  let state = 2166136261
  for (const char of seed) state = Math.imul(state ^ char.charCodeAt(0), 16777619)
  return () => {
    state += 0x6d2b79f5
    let n = Math.imul(state ^ (state >>> 15), 1 | state)
    n ^= n + Math.imul(n ^ (n >>> 7), 61 | n)
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296
  }
}
export function newDailySession(day = streakDay()): DailySession {
  const random = randomFor('daily-v1-' + day)
  const pick = (ids: readonly string[]) => ids[Math.floor(random() * ids.length)]
  const specs: [DailyKind, string][] = [
    ['trivia', pick(pools.trivia)],
    [random() < 0.5 ? 'flags' : 'shapes', pick(pools.countries)],
    [random() < 0.5 ? 'countries' : 'capitals', pick(pools.countries)],
    ['who', pick(pools.who)],
    ['mystery', pick(pools.mystery)],
  ]
  if (specs[2][1] === specs[1][1])
    specs[2][1] = pick(pools.countries.filter((id) => id !== specs[1][1]))
  return {
    version: 1,
    day,
    started: false,
    index: 0,
    trials: specs.map(([kind, id]) => ({
      kind,
      id,
      guesses: [],
      choice: null,
      cluesShown: 1,
      hintUsed: false,
      revealed: false,
    })),
  }
}
export function dailyChoices(trial: DailyTrial, day: number): string[] {
  if (trial.kind !== 'trivia') return []
  const choices = [...questionById.get(trial.id)!.choices]
  const random = randomFor('daily-v1-choices-' + day)
  for (let i = choices.length - 1; i > 0; i--) {
    const at = Math.floor(random() * (i + 1))
    ;[choices[i], choices[at]] = [choices[at], choices[i]]
  }
  return choices
}
export function dailyTextItem(trial: DailyTrial) {
  return trial.kind === 'who' ? textGames.who.byId.get(trial.id)! : mysteryById.get(trial.id)!
}
export function dailyGeoRound(trial: DailyTrial): Round | null {
  if (!['flags', 'shapes', 'countries', 'capitals'].includes(trial.kind)) return null
  return {
    version: 2,
    mode: trial.kind as Round['mode'],
    answer: trial.id,
    guesses: trial.guesses,
    revealed: trial.revealed,
    hintUsed: trial.hintUsed,
  }
}
export const dailyLimit = (trial: DailyTrial) =>
  trial.kind === 'trivia' ? 1 : trial.kind === 'who' || trial.kind === 'mystery' ? 3 : 5
function textRound(trial: DailyTrial) {
  return {
    version: 1 as const,
    id: trial.id,
    guesses: trial.guesses,
    cluesShown: trial.cluesShown,
    revealed: trial.revealed,
  }
}
export function dailyCorrect(trial: DailyTrial, day: number) {
  if (trial.revealed) return false
  if (trial.kind === 'trivia')
    return (
      trial.choice !== null &&
      dailyChoices(trial, day)[trial.choice] === questionById.get(trial.id)!.answer
    )
  if (trial.kind === 'who' || trial.kind === 'mystery')
    return textGames[trial.kind].solved(textRound(trial))
  return trial.guesses.includes(trial.id)
}
export const dailyEnded = (trial: DailyTrial, day: number) =>
  trial.revealed || trial.choice !== null || dailyCorrect(trial, day)
export function dailyTrialPoints(trial: DailyTrial, day: number) {
  if (!dailyCorrect(trial, day)) return 0
  const wrong = trial.kind === 'trivia' ? 0 : Math.max(0, trial.guesses.length - 1)
  const hints = trial.cluesShown - 1 + Number(trial.hintUsed)
  return Math.max(0, 100 - wrong * 2 - hints)
}
export function dailySummary(session: DailySession): DailySummary {
  const ended = session.trials.filter((t) => dailyEnded(t, session.day))
  return {
    version: 1,
    day: session.day,
    challengeVersion: 1,
    status: ended.length === 5 ? 'finished' : 'started',
    attempted: ended.length,
    solved: ended.filter((t) => dailyCorrect(t, session.day)).length,
    score: ended.reduce((sum, t) => sum + dailyTrialPoints(t, session.day), 0),
  }
}
export function dailyStats(session: DailySession) {
  const summary = dailySummary(session)
  let streak = 0,
    best = 0
  for (const trial of session.trials) {
    if (!dailyEnded(trial, session.day)) break
    streak = dailyCorrect(trial, session.day) ? streak + 1 : 0
    best = Math.max(best, streak)
  }
  return {
    outcome:
      summary.status === 'finished'
        ? summary.solved === 5
          ? ('won' as const)
          : ('completed' as const)
        : ('active' as const),
    answered: summary.attempted,
    correct: summary.solved,
    bestStreak: best,
    guesses: session.trials.reduce(
      (sum, t) => sum + t.guesses.length + Number(t.choice !== null),
      0,
    ),
  }
}
type Change = { session: DailySession; error?: string }
function updateTrial(
  session: DailySession,
  change: (trial: DailyTrial) => { trial: DailyTrial; error?: string },
): Change {
  const trial = session.trials[session.index]
  if (!session.started || !trial || dailyEnded(trial, session.day))
    return { session, error: 'This challenge is complete. Continue to the next one.' }
  const result = change(trial)
  if (result.error) return { session, error: result.error }
  return {
    session: {
      ...session,
      trials: session.trials.map((t, i) => (i === session.index ? result.trial : t)),
    },
  }
}
export function startDaily(session: DailySession) {
  return session.started ? session : { ...session, started: true }
}
export function guessDaily(session: DailySession, raw: string | Country): Change {
  return updateTrial(session, (trial) => {
    const geo = dailyGeoRound(trial)
    if (geo) {
      const result = addGuess(geo, typeof raw === 'string' ? raw : raw.id)
      if (result.error) return { trial, error: result.error }
      return {
        trial: {
          ...trial,
          guesses: result.round.guesses,
          revealed: !hasWon(result.round) && result.round.guesses.length >= dailyLimit(trial),
        },
      }
    }
    if (trial.kind !== 'who' && trial.kind !== 'mystery')
      return { trial, error: 'Choose one of the trivia answers.' }
    const result = textGames[trial.kind].guess(
      textRound(trial),
      typeof raw === 'string' ? raw : raw.name,
    )
    if (result.error) return { trial, error: result.error }
    return {
      trial: {
        ...trial,
        guesses: result.round.guesses,
        revealed:
          !textGames[trial.kind].solved(result.round) &&
          result.round.guesses.length >= dailyLimit(trial),
      },
    }
  })
}
export function answerDaily(session: DailySession, choice: number): Change {
  return updateTrial(session, (trial) =>
    trial.kind === 'trivia' && Number.isInteger(choice) && choice >= 0 && choice < 4
      ? { trial: { ...trial, choice } }
      : { trial, error: 'Choose an available answer.' },
  )
}
export function hintDaily(session: DailySession): Change {
  return updateTrial(session, (trial) => {
    if (trial.kind === 'flags' || trial.kind === 'shapes')
      return trial.hintUsed
        ? { trial, error: 'The continent hint is already visible.' }
        : { trial: { ...trial, hintUsed: true } }
    if (trial.kind === 'who' || trial.kind === 'mystery')
      return trial.cluesShown >= 5
        ? { trial, error: 'All five clues are visible.' }
        : { trial: { ...trial, cluesShown: trial.cluesShown + 1 } }
    return { trial, error: 'There is no hint for this challenge.' }
  })
}
export function revealDaily(session: DailySession): Change {
  return updateTrial(session, (trial) => ({ trial: { ...trial, revealed: true } }))
}
export function nextDaily(session: DailySession): DailySession {
  const trial = session.trials[session.index]
  return trial && dailyEnded(trial, session.day)
    ? { ...session, index: session.index + 1 }
    : session
}
export function parseDaily(raw: string | null, day: number): DailySession | null {
  try {
    const s = JSON.parse(raw || 'null') as DailySession
    const fresh = newDailySession(day)
    if (
      !s ||
      s.version !== 1 ||
      s.day !== day ||
      typeof s.started !== 'boolean' ||
      !Number.isInteger(s.index) ||
      s.index < 0 ||
      s.index > 5 ||
      !Array.isArray(s.trials) ||
      s.trials.length !== 5
    )
      return null
    for (let i = 0; i < 5; i++) {
      const t = s.trials[i],
        expected = fresh.trials[i]
      if (
        !t ||
        t.kind !== expected.kind ||
        t.id !== expected.id ||
        !Array.isArray(t.guesses) ||
        t.guesses.some((g) => typeof g !== 'string') ||
        t.guesses.length > dailyLimit(t) ||
        typeof t.revealed !== 'boolean' ||
        typeof t.hintUsed !== 'boolean' ||
        !Number.isInteger(t.cluesShown) ||
        t.cluesShown < 1 ||
        t.cluesShown > 5 ||
        !(t.choice === null || (Number.isInteger(t.choice) && t.choice >= 0 && t.choice < 4))
      )
        return null
      const geo = dailyGeoRound(t)
      if (geo) {
        if (
          !parseRound(JSON.stringify(geo), geo.mode) ||
          t.choice !== null ||
          t.cluesShown !== 1 ||
          (!['flags', 'shapes'].includes(t.kind) && t.hintUsed)
        )
          return null
      } else if (t.kind === 'trivia') {
        if (
          t.guesses.length ||
          t.cluesShown !== 1 ||
          t.hintUsed ||
          (t.choice !== null && t.revealed)
        )
          return null
      } else if (t.kind === 'who' || t.kind === 'mystery') {
        if (
          t.choice !== null ||
          t.hintUsed ||
          !textGames[t.kind].parseSession(
            JSON.stringify({ version: 1, round: textRound(t), seen: [] }),
          )
        )
          return null
      }
      if (t.guesses.length >= dailyLimit(t) && !dailyEnded(t, day)) return null
      if (i < s.index && !dailyEnded(t, day)) return null
      if (
        (i > s.index || !s.started) &&
        (t.guesses.length || t.choice !== null || t.cluesShown !== 1 || t.hintUsed || t.revealed)
      )
        return null
    }
    if (!s.started && s.index !== 0) return null
    return s
  } catch {
    return null
  }
}
export function loadDaily(uid: string | null, day: number) {
  try {
    const raw = localStorage.getItem(dailyStorageKey(uid))
    const parsed = parseDaily(raw, day)
    let storedDay: unknown
    try {
      storedDay = raw ? JSON.parse(raw)?.day : undefined
    } catch {
      /* Unreadable save. */
    }

    return {
      session: parsed || newDailySession(day),
      warning:
        raw && !parsed && (storedDay === day || typeof storedDay !== 'number')
          ? 'Today’s saved mix could not be read. A fresh mix is ready.'
          : '',
    }
  } catch {
    return {
      session: newDailySession(day),
      warning:
        'Browser storage is unavailable. Keep this page open to preserve your daily attempt.',
    }
  }
}
export function dailyShare(session: DailySession, url: string) {
  const summary = dailySummary(session),
    date = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' }).format(
      session.day * 86400000,
    )
  return (
    'Daily Mix · ' +
    date +
    '\n' +
    session.trials.map((t) => (dailyCorrect(t, session.day) ? '🟩' : '⬜')).join('') +
    '\n' +
    summary.solved +
    '/5 solved · ' +
    summary.score +
    '/500 points\n' +
    url
  )
}
