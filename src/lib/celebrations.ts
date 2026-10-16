export const CELEBRATIONS = [
  'confetti',
  'fireworks',
  'emoji-parade',
  'heart-fountains',
  'shooting-stars',
  'rainbow-bubbles',
] as const

export type Celebration = (typeof CELEBRATIONS)[number]
export const CELEBRATION_DURATION_MS = 4800

/** Share one shuffled bag across all modes; see every effect before a repeat. */
export function createCelebrationPicker(random = Math.random) {
  let bag: Celebration[] = []
  let previous: Celebration | undefined
  return (): Celebration => {
    if (!bag.length) {
      bag = [...CELEBRATIONS]
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1))
        ;[bag[i], bag[j]] = [bag[j], bag[i]]
      }
      if (bag[0] === previous) [bag[0], bag[1]] = [bag[1], bag[0]]
    }
    previous = bag.shift()!
    return previous
  }
}
