export const GLOBE_FOCUS_DELAY_MS = 350
export const GLOBE_FOCUS_DURATION_MS = 850
export const GUESS_BLINK_PERIOD_MS = 1400
export const GUESS_BLINK_CYCLES = 3
export const GUESS_BLINK_DURATION_MS = GUESS_BLINK_PERIOD_MS * GUESS_BLINK_CYCLES
export const MIN_GLOBE_ZOOM = 1
export const MAX_GLOBE_ZOOM = 32
export const GLOBE_ZOOM_STEP = 1.25

/** Approximate regional framing from country area in km²; keep context for tiny states. */
export function focusZoomForArea(area: number) {
  if (!Number.isFinite(area) || area <= 0) return MIN_GLOBE_ZOOM
  return Math.max(1.3, Math.min(16, 2700 / Math.sqrt(area)))
}

export function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
