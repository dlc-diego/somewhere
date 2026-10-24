import {
  collection,
  doc,
  getDocFromServer,
  limit,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
} from 'firebase/firestore'
import { getAuth } from 'firebase/auth'
import { app } from './firebaseApp'
import { db } from './firestoreSync'
import { streakDay } from './streak'
import type { DailySummary } from './daily'

export interface DailyMember {
  uid: string
  displayName: string
  enabled: boolean
}
export interface DailyEntry extends DailySummary {
  uid: string
  completedAt: number | null
}
export interface DailyAccess {
  admin: boolean
  member: boolean
}

export async function setDailyMember(uid: string, displayName: string, enabled: boolean) {
  const actor = getAuth(app).currentUser
  if (!actor) throw new Error('Sign in to your admin account first.')
  await setDoc(doc(db, 'dailyMembers', uid), {
    version: 1,
    uid,
    displayName: (displayName.trim() || 'Player').slice(0, 80),
    enabled,
    addedBy: actor.uid,
    updatedAt: serverTimestamp(),
  })
}
export async function getDailyMember(uid: string) {
  const snapshot = await getDocFromServer(doc(db, 'dailyMembers', uid))
  return snapshot.data()?.enabled === true
}
export function watchDailyAccess(
  uid: string,
  onAccess: (access: DailyAccess) => void,
  onError: (error: unknown) => void,
) {
  const ready = new Set<string>()
  let admin = false,
    member = false,
    active = true
  const emit = () => {
    if (active && ready.size === 2) onAccess({ admin, member })
  }
  const stopAdmin = onSnapshot(
    doc(db, 'admins', uid),
    (s) => {
      admin = s.data()?.enabled === true
      ready.add('admin')
      emit()
    },
    onError,
  )
  const stopMember = onSnapshot(
    doc(db, 'dailyMembers', uid),
    (s) => {
      member = s.data()?.enabled === true
      ready.add('member')
      emit()
    },
    onError,
  )
  return () => {
    active = false
    stopAdmin()
    stopMember()
  }
}
function parseEntry(data: Record<string, unknown>, uid: string, day: number): DailyEntry | null {
  if (
    data.version !== 1 ||
    data.uid !== uid ||
    data.day !== day ||
    data.challengeVersion !== 1 ||
    !['started', 'finished'].includes(String(data.status)) ||
    ![data.attempted, data.solved, data.score].every(Number.isInteger) ||
    Number(data.attempted) < 0 ||
    Number(data.attempted) > 5 ||
    Number(data.solved) < 0 ||
    Number(data.solved) > Number(data.attempted) ||
    Number(data.score) < Number(data.solved) * 90 ||
    Number(data.score) > Number(data.solved) * 100 ||
    (data.status === 'finished') !== (data.attempted === 5)
  )
    return null
  return {
    version: 1,
    day,
    uid,
    challengeVersion: 1,
    status: data.status as DailyEntry['status'],
    attempted: Number(data.attempted),
    solved: Number(data.solved),
    score: Number(data.score),
    completedAt: data.completedAt instanceof Timestamp ? data.completedAt.toMillis() : null,
  }
}
export function watchDailyBoard(
  day: number,
  onMembers: (members: DailyMember[]) => void,
  onEntries: (entries: DailyEntry[]) => void,
  onError: (error: unknown) => void,
) {
  const stopMembers = onSnapshot(
    query(collection(db, 'dailyMembers'), where('enabled', '==', true), limit(20)),
    (s) => {
      onMembers(
        s.docs.flatMap((d) => {
          const data = d.data()
          return data.uid === d.id && typeof data.displayName === 'string' && data.enabled === true
            ? [{ uid: d.id, displayName: data.displayName, enabled: true }]
            : []
        }),
      )
    },
    onError,
  )
  const stopEntries = onSnapshot(
    query(collection(db, 'dailyResults', String(day), 'entries'), limit(20)),
    (s) => {
      onEntries(
        s.docs.flatMap((d) => {
          const entry = parseEntry(d.data(), d.id, day)
          return entry ? [entry] : []
        }),
      )
    },
    onError,
  )
  return () => {
    stopMembers()
    stopEntries()
  }
}
export async function saveDailySummary(uid: string, summary: DailySummary) {
  if (summary.day !== streakDay())
    throw new Error('A new Daily Mix is ready. Today’s board has changed.')
  if (!navigator.onLine)
    throw new Error('Your daily progress is saved here. The board will update when you reconnect.')
  const ref = doc(db, 'dailyResults', String(summary.day), 'entries', uid)
  await runTransaction(
    db,
    async (tx) => {
      const snapshot = await tx.get(ref),
        old = snapshot.exists() ? parseEntry(snapshot.data(), uid, summary.day) : null
      if (old?.status === 'finished' || (old && old.attempted > summary.attempted)) return
      if (
        old &&
        old.attempted === summary.attempted &&
        old.score >= summary.score &&
        old.solved >= summary.solved
      )
        return
      tx.set(ref, {
        ...summary,
        uid,
        updatedAt: serverTimestamp(),
        completedAt: summary.status === 'finished' ? serverTimestamp() : null,
      })
    },
    { maxAttempts: 3 },
  )
}
export function dailyCloudError(error: unknown) {
  const code = (error as { code?: string })?.code
  if (code === 'permission-denied')
    return 'The private board is unavailable for this account. Check your invitation or try again after updating.'
  return error instanceof Error
    ? error.message
    : 'The private board could not sync. Your daily progress stays on this device.'
}
