import { people } from '../data/people'
import { createMysteryGame } from './mystery'

export const SOMEONE_KEY = 'someone.who.v1'
export const {
  byId: personById,
  newSession: newWhoSession,
  solved: personSolved,
  ended: personEnded,
  guess: guessPerson,
  nextClue: nextPersonClue,
  reveal: revealPerson,
  parseSession: parseWhoSession,
} = createMysteryGame(people)

export function loadSomeone() {
  try {
    const raw = localStorage.getItem(SOMEONE_KEY)
    const session = parseWhoSession(raw)
    return {
      session: session || newWhoSession(),
      warning:
        raw && !session
          ? 'The saved Who am I round could not be read. A fresh mystery is ready.'
          : '',
    }
  } catch {
    return {
      session: newWhoSession(),
      warning: 'Browser storage is unavailable. This round may not survive a refresh.',
    }
  }
}
