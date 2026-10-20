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
