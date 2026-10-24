import {
  collection,
  doc,
  getDocFromServer,
  getDocsFromServer,
  query,
  where,
  orderBy,
  limit,
  runTransaction,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore'
import { getAuth } from 'firebase/auth'
import { app } from './firebaseApp'
import { db } from './firestoreSync'
import { getDailyMember } from './dailyCloud'
import { emptyPlayer, parseGame, type PlayerData } from './playerData'
import { validCheckIn } from './streak'
import { creditCheckIn, planStreakCredit, type StreakCreditPlan } from './adminStreak'

export interface PlayerProfile {
  uid: string
  displayName: string
  email: string
}
export interface AdminPlayer {
  profile: PlayerProfile
  data: PlayerData
  dailyMember: boolean
}
export interface AuditEntry {
  id: string
  actorUid: string
  targetUid: string
  previousCurrent: number
  requestedCurrent: number
  creditedDays: number[]
  reason: string
  createdAt: number
}
export function adminError(error: unknown) {
  const code = (error as { code?: string })?.code
  if (code === 'permission-denied')
    return 'Admin access is unavailable. Check your account and Firebase rules.'
  if (code === 'unavailable' || code === 'failed-precondition')
    return 'Connect to the internet and try again.'
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}
export async function findPlayers(search: string): Promise<PlayerProfile[]> {
  const term = search.trim()
  if (term && !term.includes('@')) {
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(term))
      throw new Error('Enter a valid Firebase UID or full email address.')
    const snapshot = await getDocFromServer(doc(db, 'players', term))
    return [
      snapshot.exists()
        ? (snapshot.data() as PlayerProfile)
        : { uid: term, displayName: '', email: '' },
    ]
  }
  const source = collection(db, 'players')
  const snapshot = await getDocsFromServer(
    term
      ? query(source, where('emailLower', '==', term.toLowerCase()), limit(20))
      : query(source, orderBy('updatedAt', 'desc'), limit(20)),
  )
  return snapshot.docs.map((d) => d.data() as PlayerProfile)
}
export async function loadAdminPlayer(profile: PlayerProfile): Promise<AdminPlayer> {
  const [games, claims] = await Promise.all([
    getDocsFromServer(collection(db, 'users', profile.uid, 'games')),
    getDocsFromServer(collection(db, 'users', profile.uid, 'checkins')),
  ])
  const data = emptyPlayer()
  if (!profile.email && !profile.displayName && games.empty && claims.empty)
    throw new Error(
      'No player data found for this UID. Check the UID or ask the player to open the app while signed in.',
    )
  for (const d of games.docs) {
    const record = parseGame(d.data())
    if (record?.id === d.id) data.games[d.id] = record
  }
  for (const d of claims.docs) {
    const record = d.data()
    if (validCheckIn(record) && String(record.day) === d.id)
      data.claims[d.id] = { day: record.day, at: record.at }
  }
  return { profile, data, dailyMember: await getDailyMember(profile.uid) }
}
export async function loadAudit(): Promise<AuditEntry[]> {
  const snapshot = await getDocsFromServer(
    query(collection(db, 'adminAudit'), orderBy('createdAt', 'desc'), limit(25)),
  )
  return snapshot.docs.map((d) => {
    const value = d.data()
    return {
      ...value,
      id: d.id,
      createdAt: value.createdAt instanceof Timestamp ? value.createdAt.toMillis() : 0,
    } as AuditEntry
  })
}
export async function applyStreakCredit(uid: string, preview: StreakCreditPlan, reason: string) {
  const actorUid = getAuth(app).currentUser?.uid
  if (!actorUid) throw new Error('Sign in to your admin account first.')
  if (!navigator.onLine) throw new Error('Connect to the internet before adjusting a streak.')
  const note = reason.trim()
  if (note.length < 3 || note.length > 240)
    throw new Error('Enter a reason between 3 and 240 characters.')
  const audit = doc(collection(db, 'adminAudit'))
  await runTransaction(
    db,
    async (tx) => {
      const now = Date.now()
      // Read the complete proposed streak, its preceding boundary, and today.
      // Concurrent check-ins/credits cause a transaction retry and fresh preview.
      const days = new Set([
        preview.day,
        ...Array.from({ length: preview.desired + 1 }, (_, i) => preview.anchorDay - i),
      ])
      const refs = [...days].map((day) => doc(db, 'users', uid, 'checkins', String(day)))
      const records = await Promise.all(refs.map((ref) => tx.get(ref)))
      const claims: PlayerData['claims'] = {}
      for (const record of records) {
        const claim = record.data()
        if (validCheckIn(claim)) claims[record.id] = { day: claim.day, at: claim.at }
      }
      const plan = planStreakCredit(claims, preview.desired, now)
      if (
        plan.day !== preview.day ||
        plan.current !== preview.current ||
        plan.anchorDay !== preview.anchorDay ||
        JSON.stringify(plan.days) !== JSON.stringify(preview.days)
      )
        throw new Error('Check-ins changed. Reload this player and preview the adjustment again.')
      for (const day of plan.days)
        tx.set(doc(db, 'users', uid, 'checkins', String(day)), {
          ...creditCheckIn(day, now),
          recordedAt: serverTimestamp(),
          creditId: audit.id,
        })
      tx.set(audit, {
        version: 1,
        actorUid,
        targetUid: uid,
        previousCurrent: plan.current,
        requestedCurrent: plan.desired,
        anchorDay: plan.anchorDay,
        creditedDays: plan.days,
        reason: note,
        createdAt: serverTimestamp(),
      })
    },
    { maxAttempts: 3 },
  )
}
