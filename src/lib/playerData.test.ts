import { describe, it, expect } from 'vitest'
import { streakDay, nextStreakNoon, streakSummary, validCheckIn } from './streak'
import {
  emptyPlayer,
  mergeGame,
  mergePlayers,
  parseGame,
  parsePlayer,
  statistics,
  trackRound,
  type GameRecord,
} from './playerData'
const day = (date: string) => Date.parse(`${date}T00:00:00Z`) / 86400000
const claim = (date: string) => ({ day: day(date), at: Date.parse(`${date}T19:00:00Z`) })
const game = (patch: Partial<GameRecord> = {}): GameRecord => ({
  version: 1,
  id: 'round-12345678',
  mode: 'countries',
  startedAt: Date.parse('2026-10-19T18:00Z'),
  updatedAt: Date.parse('2026-10-19T18:01Z'),
  outcome: 'active',
  guesses: 1,
  correct: 0,
  answered: 0,
  bestStreak: 0,
  stage: 0,
  ...patch,
})
describe('noon Central daily check-in', () => {
  it('changes only at noon in standard and daylight time', () => {
    for (const [before, noon, date] of [
      ['2026-01-20T17:59:59Z', '2026-01-20T18:00:00Z', '2026-01-20'],
      ['2026-07-20T16:59:59Z', '2026-07-20T17:00:00Z', '2026-07-20'],
      ['2026-03-08T16:59:59Z', '2026-03-08T17:00:00Z', '2026-03-08'],
      ['2026-11-01T17:59:59Z', '2026-11-01T18:00:00Z', '2026-11-01'],
    ]) {
      expect(streakDay(Date.parse(before))).toBe(day(date) - 1)
      expect(streakDay(Date.parse(noon))).toBe(day(date))
      expect(nextStreakNoon(Date.parse(before))).toBe(Date.parse(noon))
    }
  })
  it('uses 23-hour and 25-hour periods when clocks change', () => {
    expect(nextStreakNoon(Date.parse('2026-03-07T18:00Z')) - Date.parse('2026-03-07T18:00Z')).toBe(
      23 * 3600000,
    )
    expect(nextStreakNoon(Date.parse('2026-10-31T17:00Z')) - Date.parse('2026-10-31T17:00Z')).toBe(
      25 * 3600000,
    )
  })
  it('requires a daily claim, keeps yesterday’s chain until noon, and resets after a missed day', () => {
    const claims = Object.fromEntries(
      ['2026-10-17', '2026-10-18', '2026-10-19'].map((d) => [String(day(d)), claim(d)]),
    )
    expect(streakSummary(claims, Date.parse('2026-10-20T16:59Z'))).toMatchObject({
      current: 3,
      longest: 3,
      claimable: false,
    })
    expect(streakSummary(claims, Date.parse('2026-10-20T17:00Z'))).toMatchObject({
      current: 3,
      claimable: true,
    })
    expect(
      streakSummary(
        { ...claims, [day('2026-10-20')]: claim('2026-10-20') },
        Date.parse('2026-10-20T19:00Z'),
      ),
    ).toMatchObject({ current: 4, longest: 4, claimable: false })
    expect(streakSummary(claims, Date.parse('2026-10-21T17:00Z'))).toMatchObject({
      current: 0,
      longest: 3,
      claimable: true,
    })
    expect(
      streakSummary(
        { ...claims, [day('2026-10-21')]: claim('2026-10-21') },
        Date.parse('2026-10-21T19:00Z'),
      ),
    ).toMatchObject({ current: 1, longest: 3 })
  })
  it('ignores future claims and rejects malformed or mismatched dates', () => {
    expect(validCheckIn(claim('2026-10-19'))).toBe(true)
    expect(validCheckIn({ ...claim('2026-10-19'), day: 0 })).toBe(false)
    expect(validCheckIn({ day: 20000, at: NaN })).toBe(false)
    expect(
      streakSummary({ future: claim('2026-10-21') }, Date.parse('2026-10-20T19:00Z')).current,
    ).toBe(0)
  })
})
describe('private per-round statistics', () => {
  it('deduplicates reloads, concurrent devices, finished rounds and account imports', () => {
    const a = emptyPlayer(),
      b = emptyPlayer()
    a.games['round-12345678'] = game()
    b.games['round-12345678'] = game({ outcome: 'won', guesses: 3 })
    const merged = mergePlayers(a, b)
    expect(statistics(mergePlayers(merged, b)).find((r) => r.mode === 'countries')).toMatchObject({
      played: 1,
      completed: 1,
      wins: 1,
      guesses: 3,
    })
    expect(mergeGame(b.games['round-12345678'], a.games['round-12345678']).outcome).toBe('won')
    expect(mergeGame(game({ outcome: 'revealed' }), game({ outcome: 'won' }))).toEqual(
      mergeGame(game({ outcome: 'won' }), game({ outcome: 'revealed' })),
    )
  })
  it('tracks trivia accuracy and perfect rounds separately from guesses, and adventure progress', () => {
    const data = emptyPlayer()
    data.games.trivia = game({
      id: 'trivia-round-123',
      mode: 'trivia',
      outcome: 'won',
      answered: 10,
      correct: 10,
      bestStreak: 10,
      guesses: 0,
    })
    data.games.run = game({
      id: 'adventure-round',
      mode: 'adventure',
      stage: 12,
      outcome: 'abandoned',
    })
    expect(statistics(data).find((r) => r.mode === 'trivia')).toMatchObject({
      perfect: 1,
      correct: 10,
      answered: 10,
      bestStreak: 10,
    })
    expect(statistics(data).find((r) => r.mode === 'adventure')).toMatchObject({
      played: 1,
      completed: 1,
      wins: 0,
      furthest: 12,
    })
  })
  it('validates stored and remote data and keeps account records distinct', () => {
    expect(parsePlayer('{')).toEqual(emptyPlayer())
    for (const patch of [
      { id: '__proto__' },
      { id: 'constructor' },
      { mode: 'bad' },
      { correct: 2, answered: 1 },
      { guesses: -1 },
      { stage: 14 },
    ])
      expect(parseGame({ ...game(), ...patch })).toBeNull()
    const data = emptyPlayer()
    data.games['round-12345678'] = game()
    data.pendingGames = ['round-12345678']
    data.claims[String(day('2026-10-19'))] = claim('2026-10-19')
    expect(parsePlayer(JSON.stringify(data))).toEqual(data)
    expect(statistics(emptyPlayer()).every((r) => r.played === 0)).toBe(true)
  })
  it('keeps a tracking id through guesses and gives each fresh round a distinct id', () => {
    const a = trackRound({ trackingId: undefined, guesses: [] })
    expect(trackRound({ ...a, guesses: ['FRA'] }).trackingId).toBe(a.trackingId)
    expect(trackRound({ trackingId: undefined }).trackingId).not.toBe(a.trackingId)
  })
})
