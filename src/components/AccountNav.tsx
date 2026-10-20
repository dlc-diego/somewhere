import { useEffect, useState, type CSSProperties } from 'react'
import {
  Menu,
  Sun,
  Moon,
  Flame,
  ChartNoAxesCombined,
  LogIn,
  LogOut,
  Check,
  RefreshCw,
  UserRound,
} from 'lucide-react'
import { usePlayer } from '../lib/PlayerProvider'
import { statistics, STAT_LABELS } from '../lib/playerData'
import { streakSummary } from '../lib/streak'
import AppUpdate from './AppUpdate'
import Dialog from './Dialog'

export default function AccountNav({
  theme,
  toggleTheme,
  celebrating,
}: {
  theme: 'light' | 'dark'
  toggleTheme: () => void
  celebrating: boolean
}) {
  const player = usePlayer()
  const [panel, setPanel] = useState<'menu' | 'stats' | null>(null)
  const [now, setNow] = useState(Date.now),
    [reward, setReward] = useState(0),
    [message, setMessage] = useState('')
  const streak = streakSummary(player.data.claims, now)
  useEffect(() => {
    const refresh = () => setNow(Date.now())
    const timer = window.setTimeout(
      refresh,
      Math.max(10, Math.min(60_000, streak.nextNoon - Date.now() + 10)),
    )
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('pageshow', refresh)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('pageshow', refresh)
    }
  }, [now, streak.nextNoon])
  useEffect(() => {
    if (!reward) return
    const timer = setTimeout(() => setReward(0), 3200)
    return () => clearTimeout(timer)
  }, [reward])
  const nextNoon = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(streak.nextNoon)
  function claim() {
    if (player.claim()) {
      setReward(Date.now())
      setMessage('Daily check-in claimed. A little spark for showing up!')
    } else setMessage(`You have already checked in today. Next check-in: ${nextNoon}.`)
    setNow(Date.now())
  }
  return (
    <nav aria-label="App controls" className="account-nav">
      <div className="daily-streak">
        <button
          className={`streak-button ${streak.claimable ? 'streak-ready' : 'streak-claimed'}`}
          aria-label={`${streak.claimable ? 'Claim daily streak' : 'Daily streak already claimed'}. ${streak.current} ${streak.current === 1 ? 'day' : 'days'}.`}
          title={streak.claimable ? 'Tap to check in for today' : `Next check-in: ${nextNoon}`}
          onClick={claim}
        >
          <Flame size={21} fill={streak.current ? 'currentColor' : 'none'} aria-hidden="true" />
          <strong>{streak.current}</strong>
          {streak.claimable && <span className="streak-ready-dot" aria-hidden="true" />}
        </button>
        {reward > 0 && (
          <div key={reward} className="streak-reward" aria-hidden="true">
            {Array.from({ length: 10 }, (_, i) => (
              <i key={i} style={{ '--spark': i } as CSSProperties}>
                {i % 3 === 0 ? '♥' : '✦'}
              </i>
            ))}
            <span>
              <Flame size={18} /> +1 day
            </span>
          </div>
        )}
        <span className="sr-only" role="status" aria-live="polite">
          {message}
        </span>
      </div>
      <AppUpdate
        celebrating={celebrating}
        render={(updateButton, available) => (
          <>
            <button
              className={`hamburger-button${available ? ' has-update' : ''}`}
              onClick={() => setPanel('menu')}
              aria-label={available ? 'Open menu. Update available' : 'Open menu'}
              aria-haspopup="dialog"
              aria-expanded={panel === 'menu'}
            >
              <Menu size={23} aria-hidden="true" />
              {available && <span className="menu-update-dot" aria-hidden="true" />}
            </button>
            {panel === 'menu' && (
              <Dialog title="App menu" onClose={() => setPanel(null)} className="app-menu-dialog">
                <p className="eyebrow">Make yourself at home</p>
                <h2>Menu</h2>
                <div className="menu-account">
                  <UserRound size={20} aria-hidden="true" />
                  <div>
                    <strong>{player.user?.displayName || 'A little explorer'}</strong>
                    <small>{player.user?.email || 'Playing on this device'}</small>
                  </div>
                </div>
                <div className="menu-actions">
                  <button
                    className="menu-action theme-toggle"
                    onClick={toggleTheme}
                    aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                  >
                    {theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}
                    <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
                  </button>
                  {updateButton}
                  <button className="menu-action" onClick={() => setPanel('stats')}>
                    <ChartNoAxesCombined size={19} />
                    <span>Your statistics</span>
                  </button>
                  {!player.user ? (
                    <button
                      className="menu-action"
                      disabled={!player.ready || player.busy}
                      onClick={player.signIn}
                    >
                      <LogIn size={19} />
                      <span>{player.busy ? 'Signing in…' : 'Sign in with Google'}</span>
                    </button>
                  ) : (
                    <button className="menu-action" disabled={player.busy} onClick={player.signOut}>
                      <LogOut size={19} />
                      <span>{player.busy ? 'Signing out…' : 'Sign out'}</span>
                    </button>
                  )}
                </div>
                {player.error && (
                  <p className="input-error" role="alert">
                    {player.error}
                  </p>
                )}
                <p className="menu-note">
                  {player.user
                    ? player.sync === 'synced'
                      ? 'Your statistics are synced.'
                      : player.sync === 'error'
                        ? 'Cloud sync is unavailable. Your statistics are saved on this device.'
                        : 'Saving your statistics…'
                    : 'Sign in to keep your statistics and check-ins together across devices.'}
                </p>
              </Dialog>
            )}
          </>
        )}
      />
      {panel === 'stats' && (
        <StatisticsDialog onClose={() => setPanel(null)} nextNoon={nextNoon} now={now} />
      )}
    </nav>
  )
}
function StatisticsDialog({
  onClose,
  nextNoon,
  now,
}: {
  onClose: () => void
  nextNoon: string
  now: number
}) {
  const player = usePlayer(),
    rows = statistics(player.data),
    streak = streakSummary(player.data.claims, now)
  const played = rows.reduce((n, r) => n + r.played, 0),
    completed = rows.reduce((n, r) => n + r.completed, 0)
  return (
    <Dialog title="Your statistics" onClose={onClose} className="statistics-dialog">
      <p className="eyebrow">Every little discovery counts</p>
      <h2>Your statistics</h2>
      <p className="stats-sync" role="status">
        {player.user
          ? player.sync === 'synced'
            ? 'Synced to your Google account'
            : player.sync === 'error'
              ? 'Saved on this device. Cloud sync will resume when available.'
              : 'Syncing your statistics…'
          : 'Saved on this device. Sign in with Google to sync across devices.'}
      </p>
      {player.sync === 'error' && (
        <button className="text-button" onClick={player.retry}>
          <RefreshCw size={16} /> Try syncing again
        </button>
      )}
      {player.storageWarning && (
        <p className="storage-warning" role="status">
          {player.storageWarning}
        </p>
      )}
      <div className="stats-overview">
        <div>
          <strong>{played}</strong>
          <span>Games played</span>
        </div>
        <div>
          <strong>{completed}</strong>
          <span>Completed</span>
        </div>
        <div>
          <strong>{streak.current}</strong>
          <span>Daily streak</span>
        </div>
        <div>
          <strong>{streak.longest}</strong>
          <span>Longest streak</span>
        </div>
      </div>
      <div className="stats-streak-note">
        <Flame size={23} />
        <p>
          <strong>
            {streak.claimable ? 'Your daily spark is ready.' : 'Today’s check-in is complete.'}
          </strong>
          <br />
          Tap the flame in the header once a day. Days reset at noon Central, including daylight
          saving time. Missing a full day breaks the streak.
          <br />
          <small>Next check-in period: {nextNoon}</small>
        </p>
      </div>
      {!played ? (
        <p className="something-empty">
          Your next discovery starts the story. Make a guess or answer a question to begin tracking.
        </p>
      ) : (
        <div className="stats-games">
          {rows
            .filter((r) => r.played)
            .map((r) => (
              <section
                key={r.mode}
                className="stats-mode"
                aria-label={`${STAT_LABELS[r.mode]} statistics`}
              >
                <h3>{STAT_LABELS[r.mode]}</h3>
                <p>
                  {r.played} played · {r.completed} completed
                </p>
                {r.mode === 'trivia' ? (
                  <p>
                    {r.correct}/{r.answered} answers correct
                    {r.answered ? ` · ${Math.round((100 * r.correct) / r.answered)}% accuracy` : ''}
                    <br />
                    {r.perfect} perfect rounds · best answer streak: {r.bestStreak}
                  </p>
                ) : (
                  <p>
                    {r.wins} wins
                    {r.completed ? ` · ${Math.round((100 * r.wins) / r.completed)}% win rate` : ''}
                    {r.mode === 'adventure'
                      ? ` · furthest stop: ${r.furthest}/13`
                      : r.wins
                        ? ` · ${Number((r.guesses / r.wins).toFixed(1))} average guesses on wins`
                        : ''}
                  </p>
                )}
              </section>
            ))}
        </div>
      )}
      <p className="menu-note">
        Statistics begin with play after this update. Refreshing a round never counts it twice.
        Revealed answers and abandoned adventures count as completed, without a win. Game progress
        itself stays on each device.
      </p>
      <button className="primary" onClick={onClose}>
        <Check size={17} /> Back to exploring
      </button>
    </Dialog>
  )
}
