export const GLOBE_FOCUS_DELAY_MS = 350
export const GLOBE_FOCUS_DURATION_MS = 850

export function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
