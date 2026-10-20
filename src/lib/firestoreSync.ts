import {
  getFirestore,
  collection,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  connectFirestoreEmulator,
} from 'firebase/firestore'
import { app, localEmulators } from './firebaseApp'
import { mergeGame, parseGame, type GameRecord } from './playerData'
import { validCheckIn, type CheckIn } from './streak'
const db = getFirestore(app)
if (localEmulators) connectFirestoreEmulator(db, '127.0.0.1', 8080)
export function watchPlayer(
  uid: string,
  onGames: (games: GameRecord[]) => void,
  onClaims: (claims: CheckIn[]) => void,
  onError: (error: unknown) => void,
) {
  const games = onSnapshot(
    collection(db, 'users', uid, 'games'),
    (snapshot) =>
      onGames(
        snapshot
          .docChanges()
          .filter((c) => c.type !== 'removed')
          .flatMap((c) => {
            const record = parseGame(c.doc.data())
            return record && record.id === c.doc.id ? [record] : []
          }),
      ),
    onError,
  )
  const claims = onSnapshot(
    collection(db, 'users', uid, 'checkins'),
    (snapshot) =>
      onClaims(
        snapshot
          .docChanges()
          .filter((c) => c.type !== 'removed')
          .flatMap((c) => {
            const record = c.doc.data()
            return validCheckIn(record) && String(record.day) === c.doc.id
              ? [{ day: record.day, at: record.at }]
              : []
          }),
      ),
    onError,
  )
  return () => {
    games()
    claims()
  }
}
export async function saveGame(uid: string, game: GameRecord) {
  const ref = doc(db, 'users', uid, 'games', game.id)
  await runTransaction(db, async (tx) => {
    const existing = await tx.get(ref)
    tx.set(ref, {
      ...mergeGame(parseGame(existing.data()) || undefined, game),
      recordedAt: serverTimestamp(),
    })
  })
}
export async function saveClaim(uid: string, claim: CheckIn) {
  const ref = doc(db, 'users', uid, 'checkins', String(claim.day))
  await runTransaction(db, async (tx) => {
    if (!(await tx.get(ref)).exists()) tx.set(ref, { ...claim, recordedAt: serverTimestamp() })
  })
}
