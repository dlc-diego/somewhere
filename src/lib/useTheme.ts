import { useEffect, useRef, useState } from 'react'

type Theme = 'light' | 'dark'
const storageKey = 'somewhere.theme.v1'

function savedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(storageKey)
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    return null
  }
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(
    () => savedTheme() ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
  )
  const chosen = useRef(savedTheme() !== null)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? '#101c20' : '#f8f7f2')
  }, [theme])

  useEffect(() => {
    const system = matchMedia('(prefers-color-scheme: dark)')
    const update = () => {
      if (!chosen.current) setTheme(system.matches ? 'dark' : 'light')
    }
    system.addEventListener('change', update)
    return () => system.removeEventListener('change', update)
  }, [])

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    chosen.current = true
    setTheme(next)
    try {
      localStorage.setItem(storageKey, next)
    } catch {
      // Keep the toggle usable when browser storage is unavailable.
    }
  }

  return { theme, toggleTheme }
}
