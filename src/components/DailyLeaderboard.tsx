import { RefreshCw, Trophy, LockKeyhole } from 'lucide-react'
import type { DailyEntry, DailyMember } from '../lib/dailyCloud'
interface Props {
  members: DailyMember[]
  entries: DailyEntry[]
  uid: string | null
  ready: boolean
  allowed: boolean
  admin: boolean
  error: string
  sync: 'idle' | 'syncing' | 'synced'
  retry: () => void
  signIn: () => void
  signInDisabled: boolean
}
export default function DailyLeaderboard({
  members,
  entries,
  uid,
  ready,
  allowed,
  admin,
  error,
  sync,
  retry,
  signIn,
  signInDisabled,
}: Props) {
  const rows = members
    .map((member) => ({ member, entry: entries.find((entry) => entry.uid === member.uid) }))
    .sort((a, b) => {
      const group = (e: DailyEntry | undefined) => (e?.status === 'finished' ? 0 : e ? 1 : 2)
      return (
        group(a.entry) - group(b.entry) ||
        (b.entry?.score || 0) - (a.entry?.score || 0) ||
        a.member.displayName.localeCompare(b.member.displayName)
      )
    })
  const finished = rows.filter((row) => row.entry?.status === 'finished')
  return (
    <aside className="daily-board trivia-card" aria-label="Private daily leaderboard">
      <div className="daily-board-heading">
        <h2>
          <Trophy size={21} aria-hidden="true" />
          Today’s board
        </h2>
        <LockKeyhole size={17} aria-label="Private board" />
      </div>
      {!uid ? (
        <>
          <p className="daily-note">
            Sign in to see your private board and share your daily result.
          </p>
          <button className="secondary" onClick={signIn} disabled={signInDisabled}>
            Sign in with Google
          </button>
        </>
      ) : !ready ? (
        <p role="status">Checking the private board…</p>
      ) : !allowed ? (
        <p className="daily-note">
          This board is invitation-only. Ask the administrator to add your profile to Daily Mix. You
          can still play on this device.
        </p>
      ) : (
        <>
          <p className="daily-note">
            Five discoveries · 500 possible points · equal scores share a rank.
          </p>
          {!rows.length ? (
            <p className="daily-note">
              Your private roster is getting ready. Add your wife through Admin panel → Private
              Daily Mix board.
            </p>
          ) : (
            <ol className="daily-board-list" aria-label="Daily players">
              {rows.map(({ member, entry }) => {
                const rank =
                  entry?.status === 'finished'
                    ? 1 + finished.filter((row) => row.entry!.score > entry.score).length
                    : null
                return (
                  <li key={member.uid} className={uid === member.uid ? 'is-you' : ''}>
                    <span
                      className="daily-rank"
                      aria-label={rank ? 'Rank ' + rank : 'Not ranked yet'}
                    >
                      {rank || '—'}
                    </span>
                    <span className="daily-player">
                      <strong>
                        {member.displayName}
                        {member.uid === uid && <small> You</small>}
                      </strong>
                      <span>
                        {!entry
                          ? 'Not started'
                          : entry.status === 'finished'
                            ? 'Finished · ' + entry.solved + '/5 solved'
                            : 'In progress · ' + entry.attempted + '/5 completed'}
                      </span>
                    </span>
                    <strong className="daily-points">
                      {entry?.status === 'finished' ? entry.score : '—'}
                      <small>{entry?.status === 'finished' ? 'points' : ''}</small>
                    </strong>
                  </li>
                )
              })}
            </ol>
          )}
          <p className="daily-note">
            Only invited players can see this roster. Activity appears when synced; this is not an
            online-presence indicator.
          </p>
          {admin && (
            <p className="daily-note">Manage invitations by selecting a player in Admin panel.</p>
          )}
        </>
      )}
      {error && (
        <p className="input-error" role="alert">
          {error}
        </p>
      )}
      {uid && (
        <div className="daily-board-footer">
          <span role="status">
            {sync === 'syncing'
              ? 'Saving daily result…'
              : sync === 'synced'
                ? 'Daily result synced.'
                : ''}
          </span>
          <button className="text-button" onClick={retry} disabled={!ready}>
            <RefreshCw size={15} />
            Refresh board
          </button>
        </div>
      )}
    </aside>
  )
}
