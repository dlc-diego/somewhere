import { useCallback, useEffect, useRef, useState } from 'react'
import { prefersReducedMotion } from './motion'

export type Experience = 'somewhere' | 'something'
const storageKey = 'somewhere.experience.v1'
export const EXPERIENCE_SWITCH_MS = 800
const CHANGE_AT_MS = 280

function savedExperience(): Experience {
  try {
    return localStorage.getItem(storageKey) === 'something' ? 'something' : 'somewhere'
  } catch {
    return 'somewhere'
  }
}

export function useExperience() {
  const [experience, setExperience] = useState<Experience>(savedExperience)
  const [transition, setTransition] = useState<{
    sequence: number
    phase: 'leaving' | 'entering'
  } | null>(null)
  const current = useRef(experience)
  const pending = useRef<Experience | null>(null)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const sequence = useRef(0)
  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }, [])
  const commit = useCallback((next: Experience) => {
    current.current = next
    setExperience(next)
  }, [])

  const switchExperience = useCallback(
    (next: Experience) => {
      clearTimers()
      pending.current = null
      if (next === current.current || prefersReducedMotion()) {
        commit(next)
        setTransition(null)
        return
      }
      pending.current = next
      const id = ++sequence.current
      setTransition({ sequence: id, phase: 'leaving' })
      timers.current.push(
        setTimeout(() => {
          commit(next)
          setTransition({ sequence: id, phase: 'entering' })
        }, CHANGE_AT_MS),
      )
      timers.current.push(
        setTimeout(() => {
          pending.current = null
          timers.current = []
          setTransition(null)
        }, EXPERIENCE_SWITCH_MS),
      )
    },
    [clearTimers, commit],
  )

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, experience)
    } catch {
      /* This page still works without storage. */
    }
    document.title =
      experience === 'something'
        ? 'Something — under construction'
        : 'Somewhere — a little world of discovery'
  }, [experience])

  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)')
    const reduce = () => {
      if (!media.matches || pending.current === null) return
      const next = pending.current
      pending.current = null
      clearTimers()
      commit(next)
      setTransition(null)
    }
    media.addEventListener('change', reduce)
    return () => {
      clearTimers()
      media.removeEventListener('change', reduce)
    }
  }, [clearTimers, commit])

  return { experience, transition, switchExperience }
}
