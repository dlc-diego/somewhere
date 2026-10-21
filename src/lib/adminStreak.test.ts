import { describe, expect, it } from 'vitest'
import { creditCheckIn, planStreakCredit } from './adminStreak'
import { streakDay, streakSummary, validCheckIn, type CheckIn } from './streak'

const now = Date.parse('2026-10-21T19:00:00Z')
const today = streakDay(now)
const claims = (days: number[], at = now) =>
  Object.fromEntries(days.map((day) => [String(day), creditCheckIn(day, at)]))

describe('administrative streak credits', () => {
  it('credits a claimed one-day streak to six without modifying the existing day', () => {
    const before = claims([today])
    const original = structuredClone(before)
    const plan = planStreakCredit(before, 6, now)
    expect(plan).toMatchObject({
      current: 1,
      desired: 6,
      longest: 6,
      claimable: false,
      anchorDay: today,
    })
    expect(plan.days).toEqual([today - 5, today - 4, today - 3, today - 2, today - 1])
    expect(before).toEqual(original)
  })
  it('preserves today’s available claim and an older longest streak', () => {
    const oldDays = Array.from({ length: 10 }, (_, i) => today - 30 + i)
    const before = claims([today - 1, ...oldDays])
    const plan = planStreakCredit(before, 6, now)
    expect(plan).toMatchObject({
      current: 1,
      desired: 6,
      longest: 10,
      claimable: true,
      anchorDay: today - 1,
    })
    const after: Record<string, CheckIn> = { ...before }
    for (const day of plan.days) after[String(day)] = creditCheckIn(day, now)
    expect(streakSummary(after, now)).toMatchObject({ current: 6, longest: 10, claimable: true })
    after[String(today)] = creditCheckIn(today, now)
    expect(streakSummary(after, now).current).toBe(7)
  })
  it('fills only holes and never allows duplicate or decreasing credits', () => {
    const before = claims([today, today - 2, today - 4])
    const plan = planStreakCredit(before, 6, now)
    expect(plan.days).toEqual([today - 5, today - 3, today - 1])
    for (const day of plan.days) before[String(day)] = creditCheckIn(day, now)
    expect(() => planStreakCredit(before, 6, now)).toThrow('higher')
    for (const value of [0, -1, 1.5, 366, NaN, Infinity])
      expect(() => planStreakCredit({}, value, now)).toThrow()
  })
  it('requires a new preview if the proposed days reconnect a longer historical chain', () => {
    const before = claims([today, today - 2, today - 3, today - 4])
    expect(() => planStreakCredit(before, 3, now)).toThrow('5 days')
    expect(planStreakCredit(before, 5, now).days).toEqual([today - 1])
  })
  it('handles maximum credit and does not consume a first-ever daily claim', () => {
    const plan = planStreakCredit({}, 365, now)
    expect(plan.days).toHaveLength(365)
    expect(plan.anchorDay).toBe(today - 1)
    expect(plan.longest).toBe(365)
    expect(plan.claimable).toBe(true)
  })
  it.each([
    '2026-03-08T17:01:00Z',
    '2026-11-01T18:01:00Z',
    '2026-03-08T16:59:00Z',
    '2026-11-01T17:59:00Z',
  ])('keeps credits valid around noon and DST: %s', (value) => {
    const at = Date.parse(value)
    const day = streakDay(at)
    for (const offset of [0, -1, -100]) {
      const claim = creditCheckIn(day + offset, at)
      expect(validCheckIn(claim)).toBe(true)
      expect(claim.at).toBeLessThanOrEqual(at)
    }
    expect(() => creditCheckIn(day + 1, at)).toThrow()
  })
})
