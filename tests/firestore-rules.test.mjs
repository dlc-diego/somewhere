import { readFile } from 'node:fs/promises'
import { test, after, before } from 'node:test'
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing'
import {
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
  serverTimestamp,
  updateDoc,
  deleteDoc,
} from 'firebase/firestore'
let env
before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-somewhere',
    firestore: { rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8') },
  })
})
after(async () => {
  await env?.cleanup()
})
const record = () => ({
  version: 1,
  id: 'round-12345678',
  mode: 'countries',
  startedAt: Date.now() - 1000,
  updatedAt: Date.now(),
  outcome: 'active',
  guesses: 1,
  correct: 0,
  answered: 0,
  bestStreak: 0,
  stage: 0,
  recordedAt: serverTimestamp(),
})
test('only the owner may read and update their valid statistics; all other paths remain private', async () => {
  const a = env.authenticatedContext('alice').firestore(),
    b = env.authenticatedContext('bob').firestore(),
    guest = env.unauthenticatedContext().firestore()
  const ref = doc(a, 'users/alice/games/round-12345678')
  await assertSucceeds(setDoc(ref, record()))
  await assertSucceeds(getDocs(collection(a, 'users/alice/games')))
  for (const db of [b, guest]) {
    await assertFails(getDoc(doc(db, ref.path)))
    await assertFails(setDoc(doc(db, ref.path), record()))
  }
  await assertSucceeds(
    updateDoc(ref, {
      outcome: 'won',
      guesses: 2,
      updatedAt: Date.now(),
      recordedAt: serverTimestamp(),
    }),
  )
  await assertFails(updateDoc(ref, { guesses: 1, recordedAt: serverTimestamp() }))
  await assertFails(updateDoc(ref, { outcome: 'active', recordedAt: serverTimestamp() }))
  await assertFails(deleteDoc(ref))
  await assertFails(setDoc(doc(a, 'unexpected/public'), { hello: true }))
})
test('invalid modes, fields and counters are rejected', async () => {
  const db = env.authenticatedContext('invalid').firestore(),
    ref = doc(db, 'users/invalid/games/round-12345678')
  for (const patch of [
    { mode: 'bad' },
    { correct: 2, answered: 1 },
    { guesses: -1 },
    { stage: 14 },
    { extra: 'not allowed' },
    { id: 'different-id' },
    { recordedAt: new Date(0) },
  ])
    await assertFails(setDoc(ref, { ...record(), ...patch }))
})
test('historical claims use noon Central through both DST transitions and are immutable', async () => {
  const db = env.authenticatedContext('history').firestore()
  for (const [at, year, month, date] of [
    ['2026-03-08T16:59:59Z', 2026, 3, 7],
    ['2026-03-08T17:00:00Z', 2026, 3, 8],
    ['2025-11-02T17:59:59Z', 2025, 11, 1],
    ['2025-11-02T18:00:00Z', 2025, 11, 2],
  ]) {
    const day = Date.UTC(year, month - 1, date) / 86400000,
      ref = doc(db, `users/history/checkins/${day}`)
    await assertSucceeds(setDoc(ref, { day, at: Date.parse(at), recordedAt: serverTimestamp() }))
    await assertFails(updateDoc(ref, { at: Date.parse(at) + 1, recordedAt: serverTimestamp() }))
    await assertFails(deleteDoc(ref))
  }
  await assertFails(
    setDoc(doc(db, 'users/history/checkins/20000'), {
      day: 20000,
      at: Date.parse('2026-03-08T17:00:00Z'),
      recordedAt: serverTimestamp(),
    }),
  )
  await assertFails(
    getDocs(collection(env.authenticatedContext('bob').firestore(), 'users/history/checkins')),
  )
})
test('future claims and claims without authentication are rejected', async () => {
  const at = Date.now() + 3 * 86400000,
    day = Math.floor(at / 86400000)
  const db = env.authenticatedContext('future').firestore()
  await assertFails(
    setDoc(doc(db, `users/future/checkins/${day}`), { day, at, recordedAt: serverTimestamp() }),
  )
  await assertFails(
    setDoc(doc(env.unauthenticatedContext().firestore(), `users/future/checkins/${day}`), {
      day,
      at,
      recordedAt: serverTimestamp(),
    }),
  )
})

async function seedAdmin(uid, enabled = true) {
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'admins', uid), { enabled })
  })
}
function centralDayNow() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      hourCycle: 'h23',
    })
      .formatToParts(Date.now())
      .map((p) => [p.type, p.value]),
  )
  return Date.UTC(+parts.year, +parts.month - 1, +parts.day) / 86400000 - (+parts.hour < 12 ? 1 : 0)
}
const auditRecord = (actorUid, targetUid, days) => ({
  version: 1,
  actorUid,
  targetUid,
  previousCurrent: 0,
  requestedCurrent: days.length,
  anchorDay: centralDayNow() - 1,
  creditedDays: days,
  reason: 'Credit prior play',
  createdAt: serverTimestamp(),
})
test('only console-provisioned admins can see the player directory and private records', async () => {
  await seedAdmin('administrator')
  await seedAdmin('disabled-admin', false)
  const admin = env.authenticatedContext('administrator').firestore()
  const player = env
    .authenticatedContext('directory-player', { email: 'Val@example.com', email_verified: true })
    .firestore()
  const profile = {
    uid: 'directory-player',
    displayName: 'Val',
    email: 'Val@example.com',
    emailLower: 'val@example.com',
    updatedAt: serverTimestamp(),
  }
  await assertSucceeds(setDoc(doc(player, 'players/directory-player'), profile))
  await assertSucceeds(getDoc(doc(admin, 'players/directory-player')))
  const { query, limit } = await import('firebase/firestore')
  await assertSucceeds(getDocs(query(collection(admin, 'players'), limit(20))))
  await assertFails(getDocs(collection(admin, 'players')))
  await assertSucceeds(getDocs(collection(admin, 'users/alice/games')))
  await assertSucceeds(getDocs(collection(admin, 'users/history/checkins')))
  for (const db of [
    player,
    env.authenticatedContext('disabled-admin').firestore(),
    env.unauthenticatedContext().firestore(),
  ]) {
    await assertFails(getDocs(query(collection(db, 'players'), limit(20))))
    await assertFails(getDocs(collection(db, 'users/alice/games')))
    await assertFails(getDocs(query(collection(db, 'adminAudit'), limit(25))))
    await assertFails(setDoc(doc(db, 'admins/directory-player'), { enabled: true }))
  }
  await assertSucceeds(getDoc(doc(player, 'admins/directory-player')))
  await assertFails(getDoc(doc(player, 'admins/administrator')))
  await assertFails(setDoc(doc(admin, 'admins/administrator'), { enabled: false }))
  await assertFails(
    setDoc(doc(admin, 'users/alice/games/admin-change'), { ...record(), id: 'admin-change' }),
  )
  await assertFails(
    setDoc(doc(player, 'players/directory-player'), { ...profile, email: 'other@example.com' }),
  )
  await assertFails(
    setDoc(doc(player, 'players/directory-player'), {
      ...profile,
      emailLower: 'other@example.com',
    }),
  )
  await assertFails(setDoc(doc(player, 'players/directory-player'), { ...profile, admin: true }))
  await assertFails(setDoc(doc(player, 'players/other'), { ...profile, uid: 'other' }))
})
test('streak credits require an immutable matching audit in the same atomic write', async () => {
  await seedAdmin('credit-admin')
  const db = env.authenticatedContext('credit-admin').firestore()
  const { writeBatch, query, limit } = await import('firebase/firestore')
  const day = centralDayNow() - 1
  const creditId = doc(collection(db, 'adminAudit')).id
  const credit = { day, at: day * 86400000 + 19 * 3600000, recordedAt: serverTimestamp(), creditId }
  const ref = doc(db, `users/credit-player/checkins/${day}`)
  await assertFails(setDoc(ref, credit))
  const batch = writeBatch(db)
  batch.set(ref, credit)
  batch.set(doc(db, 'adminAudit', creditId), auditRecord('credit-admin', 'credit-player', [day]))
  await assertSucceeds(batch.commit())
  await assertSucceeds(getDocs(query(collection(db, 'adminAudit'), limit(25))))
  await assertFails(updateDoc(ref, { at: credit.at + 1 }))
  await assertFails(deleteDoc(ref))
  await assertFails(updateDoc(doc(db, 'adminAudit', creditId), { reason: 'Rewritten reason' }))
  await assertFails(deleteDoc(doc(db, 'adminAudit', creditId)))
  const later = writeBatch(db)
  later.set(doc(db, `users/different-player/checkins/${day}`), credit)
  await assertFails(later.commit())
  for (const patch of [
    { actorUid: 'someone-else' },
    { reason: '' },
    { requestedCurrent: 0 },
    { requestedCurrent: 366 },
    { creditedDays: [day, day] },
  ]) {
    await assertFails(
      setDoc(doc(collection(db, 'adminAudit')), {
        ...auditRecord('credit-admin', 'credit-player', [day]),
        ...patch,
      }),
    )
  }
})
test('ordinary users cannot credit another player or write an admin audit', async () => {
  const db = env.authenticatedContext('ordinary-player').firestore()
  const { writeBatch } = await import('firebase/firestore')
  const day = centralDayNow() - 1
  const id = doc(collection(db, 'adminAudit')).id
  const batch = writeBatch(db)
  batch.set(doc(db, 'adminAudit', id), auditRecord('ordinary-player', 'someone-else', [day]))
  batch.set(doc(db, `users/someone-else/checkins/${day}`), {
    day,
    at: day * 86400000 + 19 * 3600000,
    recordedAt: serverTimestamp(),
    creditId: id,
  })
  await assertFails(batch.commit())
})
test('the maximum 365-day credit and its audit fit Firestore atomic/rules limits', async () => {
  await seedAdmin('max-credit-admin')
  const db = env.authenticatedContext('max-credit-admin').firestore()
  const { writeBatch } = await import('firebase/firestore')
  const days = Array.from({ length: 365 }, (_, i) => centralDayNow() - 365 + i)
  const audit = doc(collection(db, 'adminAudit'))
  const batch = writeBatch(db)
  batch.set(audit, auditRecord('max-credit-admin', 'max-credit-player', days))
  for (const day of days)
    batch.set(doc(db, `users/max-credit-player/checkins/${day}`), {
      day,
      at: day * 86400000 + 19 * 3600000,
      recordedAt: serverTimestamp(),
      creditId: audit.id,
    })
  await assertSucceeds(batch.commit())
})

test('optional gameplay details accept old records and enforce mode, bounds and monotonic merges', async () => {
  const db = env.authenticatedContext('insights').firestore()
  const cases = [
    ['who', { cluesShown: 2 }],
    ['identify', { cluesShown: 1 }],
    ['flags', { hintUsed: false }],
    ['shapes', { hintUsed: true }],
    ['journey', { shortestCrossings: 5, guesses: 7, outcome: 'won' }],
  ]
  for (const [mode, patch] of cases) {
    const id = 'details-' + mode
    const ref = doc(db, 'users/insights/games', id)
    await assertSucceeds(setDoc(ref, { ...record(), id, mode, ...patch }))
    if (patch.cluesShown !== undefined) {
      await assertSucceeds(
        updateDoc(ref, { cluesShown: patch.cluesShown + 1, recordedAt: serverTimestamp() }),
      )
      await assertFails(
        updateDoc(ref, { cluesShown: patch.cluesShown, recordedAt: serverTimestamp() }),
      )
    }
    if (patch.hintUsed !== undefined) {
      await assertSucceeds(updateDoc(ref, { hintUsed: true, recordedAt: serverTimestamp() }))
      await assertFails(updateDoc(ref, { hintUsed: false, recordedAt: serverTimestamp() }))
    }
    if (patch.shortestCrossings !== undefined)
      await assertFails(updateDoc(ref, { shortestCrossings: 4, recordedAt: serverTimestamp() }))
  }
  for (const patch of [
    { mode: 'who', cluesShown: 0 },
    { mode: 'who', cluesShown: 6 },
    { mode: 'identify', cluesShown: 3 },
    { mode: 'countries', cluesShown: 1 },
    { mode: 'who', hintUsed: true },
    { mode: 'shapes', hintUsed: 1 },
    { mode: 'countries', shortestCrossings: 5 },
    { mode: 'journey', shortestCrossings: 0 },
    { mode: 'journey', shortestCrossings: 195 },
    { mode: 'journey', shortestCrossings: 5, guesses: 4, outcome: 'won' },
  ])
    await assertFails(
      setDoc(doc(db, 'users/insights/games/invalid-details'), {
        ...record(),
        id: 'invalid-details',
        ...patch,
      }),
    )
})

const dailyMembership = (uid, addedBy) => ({
  version: 1,
  uid,
  displayName: uid,
  enabled: true,
  addedBy,
  updatedAt: serverTimestamp(),
})
const dailyRecord = (uid, patch = {}) => ({
  version: 1,
  uid,
  day: centralDayNow(),
  challengeVersion: 1,
  status: 'started',
  attempted: 0,
  solved: 0,
  score: 0,
  updatedAt: serverTimestamp(),
  completedAt: null,
  ...patch,
})
test('a private daily board requires admin invitations; strangers cannot see the roster or results', async () => {
  await seedAdmin('daily-admin')
  const admin = env.authenticatedContext('daily-admin').firestore()
  const wife = env.authenticatedContext('daily-wife').firestore()
  const stranger = env.authenticatedContext('daily-stranger').firestore()
  const { query, limit } = await import('firebase/firestore')
  for (const uid of ['daily-admin', 'daily-wife'])
    await assertSucceeds(
      setDoc(doc(admin, 'dailyMembers', uid), dailyMembership(uid, 'daily-admin')),
    )
  await assertSucceeds(getDocs(query(collection(wife, 'dailyMembers'), limit(20))))
  await assertSucceeds(getDoc(doc(wife, 'dailyMembers/daily-admin')))
  await assertFails(getDocs(collection(wife, 'dailyMembers')))
  await assertFails(getDocs(collection(wife, 'users/daily-admin/games')))
  await assertFails(
    setDoc(
      doc(wife, 'dailyMembers/daily-stranger'),
      dailyMembership('daily-stranger', 'daily-wife'),
    ),
  )
  await assertFails(
    setDoc(
      doc(stranger, 'dailyMembers/daily-stranger'),
      dailyMembership('daily-stranger', 'daily-stranger'),
    ),
  )
  await assertSucceeds(getDoc(doc(stranger, 'dailyMembers/daily-stranger')))
  for (const db of [stranger, env.unauthenticatedContext().firestore()]) {
    await assertFails(getDocs(query(collection(db, 'dailyMembers'), limit(20))))
    await assertFails(getDoc(doc(db, 'dailyMembers/daily-wife')))
    await assertFails(
      getDocs(query(collection(db, 'dailyResults', String(centralDayNow()), 'entries'), limit(20))),
    )
  }
  await assertFails(
    setDoc(doc(admin, 'dailyMembers/new-member'), {
      ...dailyMembership('new-member', 'daily-admin'),
      email: 'private@example.com',
    }),
  )
})
test('daily results are owner-only, current-day, bounded summaries and finished results are immutable', async () => {
  const admin = env.authenticatedContext('daily-admin').firestore()
  const wife = env.authenticatedContext('daily-wife').firestore()
  const day = centralDayNow(),
    path = 'dailyResults/' + day + '/entries/daily-admin'
  const { query, limit } = await import('firebase/firestore')
  await assertSucceeds(setDoc(doc(admin, path), dailyRecord('daily-admin')))
  await assertSucceeds(
    getDocs(query(collection(wife, 'dailyResults', String(day), 'entries'), limit(20))),
  )
  await assertFails(setDoc(doc(wife, path), dailyRecord('daily-admin')))
  await assertFails(setDoc(doc(admin, path), dailyRecord('daily-admin', { answers: ['secret'] })))
  for (const patch of [
    { day: day + 1 },
    { day: day - 1 },
    { challengeVersion: 2 },
    { attempted: 6 },
    { attempted: 1, solved: 2, score: 200 },
    { attempted: 1, solved: 1, score: 89 },
    { attempted: 1, solved: 1, score: 101 },
    { attempted: 5, status: 'started' },
    { status: 'finished', attempted: 4 },
    { attempted: 1, solved: 1, score: 100, completedAt: serverTimestamp() },
  ])
    await assertFails(setDoc(doc(admin, path), dailyRecord('daily-admin', patch)))
  await assertSucceeds(
    setDoc(doc(admin, path), dailyRecord('daily-admin', { attempted: 1, solved: 1, score: 100 })),
  )
  await assertFails(setDoc(doc(admin, path), dailyRecord('daily-admin')))
  await assertSucceeds(
    setDoc(
      doc(admin, path),
      dailyRecord('daily-admin', {
        status: 'finished',
        attempted: 5,
        solved: 5,
        score: 500,
        completedAt: serverTimestamp(),
      }),
    ),
  )
  await assertFails(
    setDoc(
      doc(admin, path),
      dailyRecord('daily-admin', {
        status: 'finished',
        attempted: 5,
        solved: 5,
        score: 499,
        completedAt: serverTimestamp(),
      }),
    ),
  )
  await assertFails(deleteDoc(doc(admin, path)))
})
test('revoking a daily invitation blocks new board reads and writes without changing personal statistics', async () => {
  const admin = env.authenticatedContext('daily-admin').firestore()
  const wife = env.authenticatedContext('daily-wife').firestore()
  await assertSucceeds(
    setDoc(doc(wife, 'users/daily-wife/games/daily-personal-123'), {
      ...record(),
      id: 'daily-personal-123',
      mode: 'daily',
    }),
  )
  await assertSucceeds(
    updateDoc(doc(admin, 'dailyMembers/daily-wife'), {
      enabled: false,
      updatedAt: serverTimestamp(),
    }),
  )
  const { query, limit } = await import('firebase/firestore')
  await assertFails(
    getDocs(query(collection(wife, 'dailyResults', String(centralDayNow()), 'entries'), limit(20))),
  )
  await assertFails(
    setDoc(
      doc(wife, 'dailyResults', String(centralDayNow()), 'entries/daily-wife'),
      dailyRecord('daily-wife'),
    ),
  )
  await assertSucceeds(getDocs(collection(wife, 'users/daily-wife/games')))
})
