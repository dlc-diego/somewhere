import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Download, LoaderCircle } from 'lucide-react'
import { APP_VERSION, fetchLatestVersion, updateUrl, UPDATE_QUERY_KEY } from '../lib/updates'

type Status = 'idle' | 'checking' | 'current' | 'available' | 'waiting' | 'updating' | 'error'

export default function AppUpdate({ celebrating }: { celebrating: boolean }) {
  const [status, setStatus] = useState<Status>('idle')
  const [availableVersion, setAvailableVersion] = useState<string | null>(null)
  const [pendingVersion, setPendingVersion] = useState<string | null>(null)
  const mounted = useRef(false)
  const lastCheck = useRef<number | null>(null)
  const inFlight = useRef<Promise<string> | null>(null)
  const manualCheck = useRef(false)
  const installing = useRef(false)

  const check = useCallback(async (manual: boolean) => {
    if (document.hidden || manualCheck.current || installing.current) return
    if (!manual && lastCheck.current !== null && Date.now() - lastCheck.current < 60_000) return
    lastCheck.current = Date.now()
    if (manual) {
      manualCheck.current = true
      setStatus('checking')
    }
    if (!inFlight.current) {
      const base = new URL(import.meta.env.BASE_URL, window.location.href).href
      inFlight.current = fetchLatestVersion(base).finally(() => {
        inFlight.current = null
      })
    }
    try {
      const latest = await inFlight.current
      if (!mounted.current || (!manual && manualCheck.current)) return
      const newer = latest !== APP_VERSION
      setAvailableVersion(newer ? latest : null)
      if (manual && newer) {
        installing.current = true
        setPendingVersion(latest)
      } else setStatus(newer ? 'available' : manual ? 'current' : 'idle')
    } catch {
      // An automatic check must never interrupt a game or show an offline warning.
      if (manual && mounted.current) setStatus('error')
    } finally {
      if (manual) manualCheck.current = false
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    const url = new URL(window.location.href)
    if (url.searchParams.has(UPDATE_QUERY_KEY)) {
      url.searchParams.delete(UPDATE_QUERY_KEY)
      history.replaceState(history.state, '', url)
    }
    const resume = () => void check(false)
    const online = () => {
      lastCheck.current = null
      void check(false)
    }
    resume()
    document.addEventListener('visibilitychange', resume)
    window.addEventListener('pageshow', resume)
    window.addEventListener('online', online)
    return () => {
      mounted.current = false
      document.removeEventListener('visibilitychange', resume)
      window.removeEventListener('pageshow', resume)
      window.removeEventListener('online', online)
    }
  }, [check])

  useEffect(() => {
    if (!pendingVersion) return
    if (celebrating) {
      setStatus('waiting')
      return
    }
    setStatus('updating')
    window.location.replace(updateUrl(window.location.href, pendingVersion))
  }, [pendingVersion, celebrating])

  useEffect(() => {
    if (status !== 'current' && status !== 'error') return
    const timer = window.setTimeout(() => setStatus(availableVersion ? 'available' : 'idle'), 6000)
    return () => window.clearTimeout(timer)
  }, [status, availableVersion])

  const busy = status === 'checking' || status === 'waiting' || status === 'updating'
  const label = availableVersion ? 'Download update' : 'Check for updates'
  const message = {
    idle: '',
    checking: 'Checking for updates…',
    current: 'You’re up to date.',
    available: 'Update available. Use the download button to install it.',
    waiting: 'Your update will open after the celebration.',
    updating: 'Opening the latest version…',
    error: 'Couldn’t check for updates. Please try again when you’re online.',
  }[status]

  return (
    <div className="app-update">
      <button
        className={`update-button${availableVersion ? ' update-available' : ''}`}
        onClick={() => void check(true)}
        aria-label={label}
        title={label}
        disabled={busy}
      >
        {status === 'checking' || status === 'updating' ? (
          <LoaderCircle className="update-spinner" size={16} aria-hidden="true" />
        ) : status === 'current' ? (
          <Check size={16} aria-hidden="true" />
        ) : (
          <Download size={16} aria-hidden="true" />
        )}
        {availableVersion && <span>Update available</span>}
      </button>
      <span
        className={status === 'available' ? 'sr-only' : 'update-feedback'}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {message}
      </span>
    </div>
  )
}
