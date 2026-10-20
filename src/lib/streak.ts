export const CENTRAL_ZONE = 'America/Chicago'
const dayMs = 86_400_000
const central = new Intl.DateTimeFormat('en-US', {
  timeZone: CENTRAL_ZONE,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  hourCycle: 'h23',
})
// A day belongs to the most recent Central-time noon, including across DST changes.
export function streakDay(at = Date.now()): number {
  const parts = Object.fromEntries(central.formatToParts(at).map((p) => [p.type, p.value]))
  return Date.UTC(+parts.year, +parts.month - 1, +parts.day) / dayMs - (+parts.hour < 12 ? 1 : 0)
}
export function nextStreakNoon(at = Date.now()): number {
  const today = streakDay(at)
  // Noon lies 17 or 18 hours after the date's UTC midnight, never near the DST transition.
  const base = (today + 1) * dayMs
  return streakDay(base + 17 * 3_600_000) > today ? base + 17 * 3_600_000 : base + 18 * 3_600_000
}
export interface CheckIn {
  day: number
  at: number
}
export function validCheckIn(value: unknown): value is CheckIn {
  if (!value || typeof value !== 'object') return false
  const c = value as CheckIn
  return (
    Number.isInteger(c.day) &&
    c.day >= 10957 &&
    c.day < 100000 &&
    Number.isFinite(c.at) &&
    c.at >= 946684800000 &&
    c.at < 8_640_000_000_000_000 &&
    streakDay(c.at) === c.day
  )
}
export function streakSummary(claims: Record<string, CheckIn>, at = Date.now()) {
  const today = streakDay(at)
  const days = [
    ...new Set(
      Object.values(claims)
        .filter(validCheckIn)
        .map((c) => c.day),
    ),
  ]
    .filter((day) => day <= today)
    .sort((a, b) => a - b)
  let longest = 0,
    chain = 0,
    previous = -1
  for (const day of days) {
    chain = day === previous + 1 ? chain + 1 : 1
    longest = Math.max(longest, chain)
    previous = day
  }
  return {
    day: today,
    current: previous >= today - 1 ? chain : 0,
    longest,
    claimable: !days.includes(today),
    nextNoon: nextStreakNoon(at),
  }
}
