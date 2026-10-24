import { describe, expect, it } from 'vitest'
import pools from '../data/daily-pools.v1.json'
import { countryById } from './countries'
import { questionById } from './something'
import {
  answerDaily,
  dailyChoices,
  dailyCorrect,
  dailyEnded,
  dailyGeoRound,
  dailyLimit,
  dailyShare,
  dailyStats,
  dailySummary,
  dailyTextItem,
  guessDaily,
  hintDaily,
  newDailySession,
  nextDaily,
  parseDaily,
  revealDaily,
  startDaily,
  type DailySession,
} from './daily'
import { streakDay } from './streak'
const day = 20746
function solve(session: DailySession) {
  const trial = session.trials[session.index]
  if (trial.kind === 'trivia')
    return answerDaily(
      session,
      dailyChoices(trial, session.day).indexOf(questionById.get(trial.id)!.answer),
    ).session
  return guessDaily(
    session,
    trial.kind === 'who' || trial.kind === 'mystery' ? dailyTextItem(trial).answer : trial.id,
  ).session
}
describe('Daily Mix', () => {
  it('pins valid content pools and generates identical puzzles/choices for each daily period', () => {
    expect(pools.trivia).toHaveLength(400)
    expect(pools.countries).toHaveLength(195)
    expect(pools.who).toHaveLength(80)
    expect(pools.mystery).toHaveLength(80)
    for (const id of pools.trivia) expect(questionById.has(id)).toBe(true)
    for (const id of pools.countries) expect(countryById.has(id)).toBe(true)
    const a = newDailySession(day),
      b = newDailySession(day)
    expect(a).toEqual(b)
    expect(dailyChoices(a.trials[0], day)).toEqual(dailyChoices(b.trials[0], day))
    expect(newDailySession(day + 1)).not.toEqual(a)
    for (const trial of a.trials)
      if (trial.kind === 'who' || trial.kind === 'mystery')
        expect(dailyTextItem(trial).clues).toHaveLength(5)
    expect(streakDay(Date.parse('2026-10-20T16:59:59Z'))).not.toBe(
      streakDay(Date.parse('2026-10-20T17:00:00Z')),
    )
  })
  it('requires an explicit start and locks each answer, with perfect scoring and spoiler-free sharing', () => {
    let session = newDailySession(day)
    expect(dailySummary(session)).toMatchObject({ attempted: 0, score: 0, solved: 0 })
    expect(answerDaily(session, 0).error).toBeTruthy()
    session = startDaily(session)
    for (let index = 0; index < 5; index++) {
      session = solve(session)
      expect(dailyCorrect(session.trials[index], day)).toBe(true)
      expect(parseDaily(JSON.stringify(session), day)).toEqual(session)
      expect(solve(session)).toEqual(session)
      session = nextDaily(session)
    }
    expect(dailySummary(session)).toMatchObject({
      status: 'finished',
      attempted: 5,
      solved: 5,
      score: 500,
    })
    expect(dailyStats(session)).toMatchObject({
      outcome: 'won',
      answered: 5,
      correct: 5,
      bestStreak: 5,
      guesses: 5,
    })
    expect(nextDaily(session)).toBe(session)
    const shared = dailyShare(session, 'https://example.com/somewhere/')
    expect(shared).toContain('5/5 solved · 500/500')
    for (const trial of session.trials) {
      if (trial.kind === 'trivia') expect(shared).not.toContain(questionById.get(trial.id)!.answer)
      else if (trial.kind === 'who' || trial.kind === 'mystery')
        expect(shared).not.toContain(dailyTextItem(trial).answer)
      else expect(shared).not.toContain(countryById.get(trial.id)!.name)
    }
  })
  it('deducts only misses/hints on solved trials; reveals never outperform a successful solve', () => {
    let session = startDaily(newDailySession(day))
    session = nextDaily(solve(session))
    const visual = session.trials[1]
    const wrong = [...countryById.keys()].find((id) => id !== visual.id)!
    session = guessDaily(session, wrong).session
    session = hintDaily(session).session
    session = solve(session)
    expect(dailySummary(session)).toMatchObject({ solved: 2, score: 197 })
    const again = guessDaily(session, wrong)
    expect(again.error).toBeTruthy()
    expect(again.session).toBe(session)
    session = nextDaily(session)
    session = revealDaily(session).session
    expect(dailySummary(session)).toMatchObject({ attempted: 3, solved: 2, score: 197 })
    expect(dailyCorrect(session.trials[2], day)).toBe(false)
    session = nextDaily(session)
    for (let n = 0; n < 4; n++) session = hintDaily(session).session
    session = solve(session)
    expect(dailySummary(session).score).toBe(293)
  })
  it('enforces budgets, duplicate rejection and monotonic progression without writing another game mode', () => {
    let session = nextDaily(solve(startDaily(newDailySession(day))))
    const trial = session.trials[1],
      wrong = [...countryById.keys()].filter((id) => id !== trial.id).slice(0, 5)
    session = guessDaily(session, wrong[0]).session
    expect(guessDaily(session, wrong[0]).error).toBeTruthy()
    for (const id of wrong.slice(1)) session = guessDaily(session, id).session
    expect(dailyEnded(session.trials[1], day)).toBe(true)
    expect(dailySummary(session).solved).toBe(1)
    expect(session.trials[1].guesses).toHaveLength(dailyLimit(trial))
    expect(dailyGeoRound(session.trials[1])!.revealed).toBe(true)
    expect(nextDaily(session).index).toBe(2)
  })
  it('rejects changed puzzles, impossible history, wrong-day saves and premature wins', () => {
    const session = startDaily(newDailySession(day))
    expect(parseDaily(JSON.stringify(session), day)).toEqual(session)
    expect(parseDaily(JSON.stringify(session), day + 1)).toBeNull()
    expect(parseDaily('{', day)).toBeNull()
    expect(parseDaily(JSON.stringify({ ...session, index: 1 }), day)).toBeNull()
    expect(
      parseDaily(
        JSON.stringify({
          ...session,
          trials: session.trials.map((t, i) => (i ? { ...t } : { ...t, id: 'changed' })),
        }),
        day,
      ),
    ).toBeNull()
    expect(
      parseDaily(
        JSON.stringify({
          ...session,
          trials: session.trials.map((t, i) =>
            i === 3 ? { ...t, guesses: ['already answered'] } : t,
          ),
        }),
        day,
      ),
    ).toBeNull()
    const answered = solve(session)
    expect(parseDaily(JSON.stringify({ ...answered, started: false }), day)).toBeNull()
  })
})
