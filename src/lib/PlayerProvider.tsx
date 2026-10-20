import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import {
  emptyPlayer,
  mergeGame,
  mergePlayers,
  parsePlayer,
  playerKey,
  type GameRecord,
  type PlayerData,
  type StatMode,
  type Outcome,
  validTrackingId,
} from './playerData'
import { streakDay, type CheckIn } from './streak'
import type { PlayerUser } from './firebaseClient'
type Client = typeof import('./firebaseClient')
type Progress = Partial<
  Pick<GameRecord, 'guesses' | 'correct' | 'answered' | 'bestStreak' | 'stage'>
> & { outcome: Outcome }
interface PlayerContextValue {
  user: PlayerUser | null
  data: PlayerData
  ready: boolean
  busy: boolean
  error: string
  storageWarning: string
  sync: 'local' | 'syncing' | 'synced' | 'error'
  signIn: () => void
  signOut: () => void
  retry: () => void
  recordGame: (id: string, mode: StatMode, progress: Progress) => void
  claim: () => boolean
  setCelebrating: (value: boolean) => void
}
const Context = createContext<PlayerContextValue | null>(null)
function read(uid: string | null) {
  try {
    return parsePlayer(localStorage.getItem(playerKey(uid)))
  } catch {
    return emptyPlayer()
  }
}
export function PlayerProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState(emptyPlayer),
    [user, setUser] = useState<PlayerUser | null>(null)
  const [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const [storageWarning, setStorageWarning] = useState(''),
    [sync, setSync] = useState<PlayerContextValue['sync']>('local')
  const [retry, setRetry] = useState(0)
  const [listenRetry, setListenRetry] = useState(0)
  const current = useRef(data),
    identity = useRef<string | null>(null),
    client = useRef<Client | null>(null)
  const animation = useRef(false),
    blocked = useRef(false),
    flushing = useRef(false)
  const setCelebrating = useCallback((value: boolean) => {
    animation.current = value
    if (!value) setRetry((n) => n + 1)
  }, [])
  function commit(next: PlayerData) {
    current.current = next
    setData(next)
    if (!identity.current) return
    try {
      localStorage.setItem(playerKey(identity.current), JSON.stringify(next))
    } catch {
      setStorageWarning(
        'Browser storage is unavailable or full. Statistics may not survive closing the app.',
      )
    }
  }
  useEffect(() => {
    let active = true,
      unsubscribe: (() => void) | undefined
    // Old guest statistics are no longer collected or imported into an account.
    try {
      localStorage.removeItem(playerKey(null))
    } catch {
      /* Storage may be blocked. */
    }
    import('./firebaseClient')
      .then((sdk) => {
        if (!active) return
        client.current = sdk
        unsubscribe = sdk.watchUser((next) => {
          if (!active) return
          const uid = next?.uid || null
          if (uid !== identity.current || !ready) {
            const profile = uid
              ? uid === identity.current
                ? mergePlayers(read(uid), current.current)
                : read(uid)
              : emptyPlayer()
            identity.current = uid
            blocked.current = false
            setError('')
            setStorageWarning('')
            setSync(uid ? 'syncing' : 'local')
            commit(profile)
          }
          setUser(next)
          setReady(true)
        })
      })
      .catch(() => {
        if (active) {
          setReady(true)
          setError('Google sign-in could not load. You can keep playing on this device.')
        }
      })
    return () => {
      active = false
      unsubscribe?.()
    }
  }, [])
  useEffect(() => {
    const uid = user?.uid,
      sdk = client.current
    if (!uid || !sdk) return
    blocked.current = false
    const received = new Set<string>()
    const failed = () => {
      if (identity.current === uid) {
        blocked.current = true
        setSync('error')
      }
    }
    const stop = sdk.watchPlayer(
      uid,
      (games) => {
        if (identity.current !== uid) return
        const next = { ...current.current, games: { ...current.current.games } }
        for (const game of games) next.games[game.id] = mergeGame(next.games[game.id], game)
        commit(next)
        received.add('games')
        if (
          received.size === 2 &&
          !next.pendingGames.length &&
          !next.pendingClaims.length &&
          !blocked.current
        )
          setSync('synced')
      },
      (claims) => {
        if (identity.current !== uid) return
        const next = { ...current.current, claims: { ...current.current.claims } }
        for (const claim of claims) {
          const old = next.claims[String(claim.day)]
          next.claims[String(claim.day)] = old && old.at < claim.at ? old : claim
        }
        commit(next)
        received.add('claims')
        if (
          received.size === 2 &&
          !next.pendingGames.length &&
          !next.pendingClaims.length &&
          !blocked.current
        )
          setSync('synced')
      },
      failed,
    )
    return stop
  }, [user?.uid, listenRetry])
  useEffect(() => {
    // Do not write a storage notification back to every tab; doing so causes a ping-pong loop.
    const receive = (event: StorageEvent) => {
      if (!identity.current || event.key !== playerKey(identity.current) || !event.newValue) return
      const next = mergePlayers(current.current, parsePlayer(event.newValue))
      current.current = next
      setData(next)
    }
    window.addEventListener('storage', receive)
    const resume = () => {
      if (!document.hidden) {
        if (blocked.current) setListenRetry((n) => n + 1)
        blocked.current = false
        setRetry((n) => n + 1)
      }
    }
    window.addEventListener('online', resume)
    window.addEventListener('pageshow', resume)
    document.addEventListener('visibilitychange', resume)
    return () => {
      window.removeEventListener('storage', receive)
      window.removeEventListener('online', resume)
      window.removeEventListener('pageshow', resume)
      document.removeEventListener('visibilitychange', resume)
    }
  }, [])
  useEffect(() => {
    const uid = user?.uid,
      sdk = client.current
    if (!uid || !sdk || (!data.pendingGames.length && !data.pendingClaims.length)) return
    const timer = window.setTimeout(async () => {
      if (animation.current || blocked.current || flushing.current || identity.current !== uid)
        return
      flushing.current = true
      setSync('syncing')
      try {
        const games = [...current.current.pendingGames],
          claims = [...current.current.pendingClaims]
        for (const id of games) {
          if (identity.current !== uid) break
          const record = current.current.games[id]
          await sdk.saveGame(uid, record)
          if (
            identity.current === uid &&
            JSON.stringify(current.current.games[id]) === JSON.stringify(record)
          )
            commit({
              ...current.current,
              pendingGames: current.current.pendingGames.filter((key) => key !== id),
            })
        }
        for (const id of claims) {
          if (identity.current !== uid) break
          const record = current.current.claims[id]
          await sdk.saveClaim(uid, record)
          if (identity.current === uid && current.current.claims[id].at === record.at)
            commit({
              ...current.current,
              pendingClaims: current.current.pendingClaims.filter((key) => key !== id),
            })
        }
        if (identity.current === uid)
          setSync(
            current.current.pendingGames.length || current.current.pendingClaims.length
              ? 'syncing'
              : 'synced',
          )
      } catch {
        if (identity.current === uid) {
          blocked.current = true
          setSync('error')
        }
      } finally {
        flushing.current = false
        if (
          identity.current &&
          !blocked.current &&
          !animation.current &&
          (current.current.pendingGames.length || current.current.pendingClaims.length)
        )
          setRetry((n) => n + 1)
      }
    }, 1200)
    return () => window.clearTimeout(timer)
  }, [data, user?.uid, retry])
  function recordGame(id: string, mode: StatMode, progress: Progress) {
    if (!identity.current || !validTrackingId(id)) return
    const old = current.current.games[id],
      at = Date.now()
    const game: GameRecord = {
      version: 1,
      id,
      mode,
      startedAt: old?.startedAt || at,
      updatedAt: Math.max(old?.updatedAt || 0, at),
      guesses: old?.guesses || 0,
      correct: old?.correct || 0,
      answered: old?.answered || 0,
      bestStreak: old?.bestStreak || 0,
      stage: old?.stage || 0,
      ...progress,
    }
    commit({
      ...current.current,
      games: { ...current.current.games, [id]: mergeGame(old, game) },
      pendingGames: [...new Set([...current.current.pendingGames, id])],
    })
  }
  function claim() {
    if (!identity.current) return false
    const at = Date.now(),
      day = streakDay(at),
      id = String(day)
    // Re-read other tabs before accepting a claim.
    const latest = mergePlayers(current.current, read(identity.current))
    if (latest.claims[id]) {
      commit(latest)
      return false
    }
    const record: CheckIn = { day, at }
    commit({
      ...latest,
      claims: { ...latest.claims, [id]: record },
      pendingClaims: [...new Set([...latest.pendingClaims, id])],
    })
    return true
  }
  async function authenticate(signingOut = false) {
    const sdk = client.current
    if (busy) return
    if (!sdk) {
      setError('Google sign-in could not load. Reconnect and reopen the app to try again.')
      return
    }
    setBusy(true)
    setError('')
    try {
      if (signingOut) await sdk.googleSignOut()
      else await sdk.googleSignIn()
    } catch (error: unknown) {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
      if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request')
        setError(
          code === 'auth/popup-blocked'
            ? 'Google sign-in was blocked. Allow the sign-in window and try again.'
            : code === 'auth/unauthorized-domain'
              ? 'Google sign-in is not enabled for this website yet.'
              : 'Google sign-in could not finish. Please try again; your local progress is safe.',
        )
    } finally {
      setBusy(false)
    }
  }
  return (
    <Context.Provider
      value={{
        user,
        data,
        ready,
        busy,
        error,
        storageWarning,
        sync,
        recordGame,
        claim,
        signIn: () => void authenticate(),
        signOut: () => void authenticate(true),
        retry: () => {
          setListenRetry((n) => n + 1)
          blocked.current = false
          setRetry((n) => n + 1)
        },
        setCelebrating,
      }}
    >
      {children}
    </Context.Provider>
  )
}
export function usePlayer() {
  const value = useContext(Context)
  if (!value) throw new Error('Player provider is missing')
  return value
}
