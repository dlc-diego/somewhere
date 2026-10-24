import { useEffect, useRef, useState } from 'react'
import type { PlayerUser } from './firebaseClient'
import type { DailySummary } from './daily'
import type { DailyEntry, DailyMember } from './dailyCloud'
type Client = typeof import('./dailyCloud')

export function useDailyBoard(
  user: PlayerUser | null,
  day: number,
  started: boolean,
  summary: DailySummary,
) {
  const [members, setMembers] = useState<DailyMember[]>([]),
    [entries, setEntries] = useState<DailyEntry[]>([])
  const [allowed, setAllowed] = useState(false),
    [admin, setAdmin] = useState(false),
    [ready, setReady] = useState(!user)
  const [error, setError] = useState(''),
    [sync, setSync] = useState<'idle' | 'syncing' | 'synced'>('idle')
  const [retry, setRetry] = useState(0)
  const client = useRef<Client | null>(null)
  const summaryKey = JSON.stringify(summary)
  useEffect(() => {
    const refresh = () => {
      if (!document.hidden) setRetry((n) => n + 1)
    }
    window.addEventListener('online', refresh)
    window.addEventListener('pageshow', refresh)
    return () => {
      window.removeEventListener('online', refresh)
      window.removeEventListener('pageshow', refresh)
    }
  }, [])
  useEffect(() => {
    setMembers([])
    setEntries([])
    setAllowed(false)
    setAdmin(false)
    setError('')
    setReady(!user)
    setSync('idle')
    if (!user) return
    let active = true,
      stopAccess: (() => void) | undefined,
      stopBoard: (() => void) | undefined,
      watching = false,
      joining = false
    void import('./dailyCloud')
      .then((sdk) => {
        if (!active) return
        client.current = sdk
        const fail = (e: unknown) => {
          if (active) {
            setError(sdk.dailyCloudError(e))
            setReady(true)
            setSync('idle')
          }
        }
        stopAccess = sdk.watchDailyAccess(
          user.uid,
          (access) => {
            if (!active) return
            setAdmin(access.admin)
            if (access.admin && !access.member && !joining) {
              joining = true
              void sdk.setDailyMember(user.uid, user.displayName || 'You', true).catch(fail)
            }
            const permitted = access.member || access.admin
            setAllowed(permitted)
            if (!permitted) {
              stopBoard?.()
              stopBoard = undefined
              watching = false
              setMembers([])
              setEntries([])
              setReady(true)
            } else if (!watching) {
              setReady(false)
              watching = true
              const received = new Set<string>()
              stopBoard = sdk.watchDailyBoard(
                day,
                (list) => {
                  if (active) {
                    setMembers(list)
                    received.add('members')
                    if (received.size === 2) setReady(true)
                  }
                },
                (list) => {
                  if (active) {
                    setEntries(list)
                    received.add('entries')
                    if (received.size === 2) setReady(true)
                  }
                },
                fail,
              )
            }
          },
          fail,
        )
      })
      .catch(() => {
        if (active) {
          setReady(true)
          setError('The private board could not load. You can keep playing on this device.')
        }
      })
    return () => {
      active = false
      stopAccess?.()
      stopBoard?.()
    }
  }, [user?.uid, day, retry])
  useEffect(() => {
    const sdk = client.current
    if (!user || !allowed || !ready || !started || !sdk || summary.day !== day) return
    let active = true
    setSync('syncing')
    void sdk
      .saveDailySummary(user.uid, JSON.parse(summaryKey) as DailySummary)
      .then(() => {
        if (active) {
          setSync('synced')
          setError('')
        }
      })
      .catch((e) => {
        if (active) {
          setError(sdk.dailyCloudError(e))
          setSync('idle')
        }
      })
    return () => {
      active = false
    }
  }, [user?.uid, allowed, ready, started, day, summaryKey, retry])
  return {
    members,
    entries,
    allowed,
    admin,
    ready,
    error,
    sync,
    retry: () => setRetry((n) => n + 1),
  }
}
