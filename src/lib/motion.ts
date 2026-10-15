export const GLOBE_FOCUS_DELAY_MS = 350
export const GLOBE_FOCUS_DURATION_MS = 850
export const GUESS_BLINK_PERIOD_MS = 1400
export const GUESS_BLINK_CYCLES = 3
export const GUESS_BLINK_DURATION_MS = GUESS_BLINK_PERIOD_MS * GUESS_BLINK_CYCLES

export function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
