import { useState } from 'react'
import type { PlayerUser } from '../lib/firebaseClient'

export default function ProfileAvatar({ user }: { user: PlayerUser }) {
  const [failed, setFailed] = useState(false)
  const name = user.displayName?.trim() || user.email || 'Google account'
  const words = (user.displayName?.trim() || user.email?.split('@')[0] || 'G').split(/\s+/)
  const initials = [words[0], ...(words.length > 1 ? [words.at(-1)!] : [])]
    .map((word) => Array.from(word)[0] || '')
    .join('')
    .toLocaleUpperCase()
  const photo = user.photoURL?.startsWith('https:') ? user.photoURL : null
  return (
    <span className="profile-avatar" role="img" aria-label={`${name} profile picture`} title={name}>
      {photo && !failed ? (
        <img
          src={photo}
          alt=""
          width={34}
          height={34}
          referrerPolicy="no-referrer"
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        <span aria-hidden="true">{initials}</span>
      )}
    </span>
  )
}
