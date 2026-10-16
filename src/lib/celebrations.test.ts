import { describe, expect, it } from 'vitest'
import { CELEBRATIONS, createCelebrationPicker } from './celebrations'

describe('victory variety', () => {
  it('plays all six effects before repeating and never repeats across bag boundaries', () => {
    for (const random of [() => 0, () => 0.5, () => 0.999, Math.random]) {
      const next = createCelebrationPicker(random)
      let previous: string | undefined
      for (let bag = 0; bag < 10; bag++) {
        const cycle = CELEBRATIONS.map(() => next())
        expect(new Set(cycle)).toEqual(new Set(CELEBRATIONS))
        expect(cycle[0]).not.toBe(previous)
        previous = cycle.at(-1)
      }
    }
  })
})
