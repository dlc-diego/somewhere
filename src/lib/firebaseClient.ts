import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  connectAuthEmulator,
} from 'firebase/auth'
import { app, localEmulators } from './firebaseApp'
import type { GameRecord } from './playerData'
import type { CheckIn } from './streak'
const auth = getAuth(app)
if (localEmulators) connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
auth.useDeviceLanguage()
const google = new GoogleAuthProvider()
google.setCustomParameters({ prompt: 'select_account' })
export interface PlayerUser {
  uid: string
  displayName: string | null
  email: string | null
  photoURL: string | null
}
export const watchUser = (listener: (user: PlayerUser | null) => void) =>
  onAuthStateChanged(auth, listener)
export const googleSignIn = () => signInWithPopup(auth, google)
export const googleSignOut = () => signOut(auth)
export function watchPlayer(...args: Parameters<typeof import('./firestoreSync').watchPlayer>) {
  let active = true,
    stop: (() => void) | undefined
  void import('./firestoreSync')
    .then((sdk) => {
      if (active) stop = sdk.watchPlayer(...args)
    })
    .catch((error) => {
      if (active) args[3](error)
    })
  return () => {
    active = false
    stop?.()
  }
}
export async function saveGame(uid: string, game: GameRecord) {
  return (await import('./firestoreSync')).saveGame(uid, game)
}
export async function saveClaim(uid: string, claim: CheckIn) {
  return (await import('./firestoreSync')).saveClaim(uid, claim)
}
