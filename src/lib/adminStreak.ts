import { streakDay, streakSummary, validCheckIn, type CheckIn } from './streak'

export const MAX_STREAK_CREDIT = 365
const DAY = 86_400_000

// 19:00 UTC is after noon Central in both CST and CDT. Today uses the actual
// current time if noon has passed but 19:00 UTC has not yet arrived.
export function creditCheckIn(day: number, now: number): CheckIn {
  const claim = { day, at: Math.min(now, day * DAY + 19 * 3_600_000) }
  if (!validCheckIn(claim) || day > streakDay(now)) throw new Error('Invalid check-in day.')
  return claim
}

export function planStreakCredit(
  claims: Record<string, CheckIn>,
  desired: number,
  now = Date.now(),
) {
  const before = streakSummary(claims, now)
  if (!Number.isInteger(desired) || desired < 1 || desired > MAX_STREAK_CREDIT)
    throw new Error(`Enter a whole number from 1 to ${MAX_STREAK_CREDIT}.`)
  if (desired <= before.current) throw new Error('Choose a streak higher than the current streak.')
  // Credit through yesterday unless the player has already checked in today.
  // An adjustment never consumes an unclaimed daily check-in.
  const anchorDay = before.claimable ? before.day - 1 : before.day
  const days = Array.from({ length: desired }, (_, i) => anchorDay - desired + 1 + i).filter(
    (day) => !claims[String(day)],
  )
  const afterClaims = { ...claims }
  for (const day of days) afterClaims[String(day)] = creditCheckIn(day, now)
  const after = streakSummary(afterClaims, now)
  if (after.current !== desired)
    throw new Error(
      `These days reconnect an older streak of ${after.current} days. Choose that total instead.`,
    )
  return {
    day: before.day,
    anchorDay,
    current: before.current,
    desired,
    days,
    longest: after.longest,
    claimable: before.claimable,
  }
}
export type StreakCreditPlan = ReturnType<typeof planStreakCredit>
