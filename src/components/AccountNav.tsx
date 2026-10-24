import { lazy, Suspense, useEffect, useRef, useState, type CSSProperties } from 'react'
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
  ShieldCheck,
} from 'lucide-react'
import { usePlayer } from '../lib/PlayerProvider'
import { statistics, totalStatistics, STAT_LABELS } from '../lib/playerData'
import { streakSummary } from '../lib/streak'
import AppUpdate from './AppUpdate'
import Dialog from './Dialog'
import ProfileAvatar from './ProfileAvatar'
import StatInsights from './StatInsights'
const AdminPanel = lazy(() => import('./AdminPanel'))

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
  const [panel, setPanel] = useState<'menu' | 'login' | 'stats' | 'admin' | null>(null)
  const [adminUid, setAdminUid] = useState<string | null>(null)
  const isAdmin = !!player.user && adminUid === player.user.uid
  useEffect(() => {
    const user = player.user
    setAdminUid(null)
    if (!user) return
    let active = true,
      stop: (() => void) | undefined
    void import('../lib/firebaseClient')
      .then((sdk) => {
        if (!active) return
        stop = sdk.watchAdmin(user.uid, (enabled) => {
          if (active) setAdminUid(enabled ? user.uid : null)
        })
        // A denied directory write on an older rules release must not interrupt gameplay or sync.
        void sdk.saveProfile(user).catch(() => {})
      })
      .catch(() => {})
    return () => {
      active = false
      stop?.()
    }
  }, [player.user?.uid, player.user?.displayName, player.user?.email])
  const [now, setNow] = useState(Date.now),
    [reward, setReward] = useState(0),
    [message, setMessage] = useState('')
  const menuButton = useRef<HTMLButtonElement>(null)
  const menuOpen = panel === 'menu' || panel === 'login'
  useEffect(() => {
    if (player.user && panel === 'login') setPanel('stats')
    if (!player.user && panel === 'stats') setPanel('login')
  }, [player.user, panel])
  useEffect(() => {
    setReward(0)
    setMessage('')
  }, [player.user?.uid])
  useEffect(() => {
    if (!menuOpen) return
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPanel(null)
        menuButton.current?.focus()
      }
    }
    document.addEventListener('keydown', escape)
    return () => document.removeEventListener('keydown', escape)
  }, [menuOpen])
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
    if (!player.user) {
      setPanel('login')
      return
    }
    if (player.claim()) {
      setReward(Date.now())
      setMessage('Daily check-in claimed. A little spark for showing up!')
    } else setMessage(`You have already checked in today. Next check-in: ${nextNoon}.`)
    setNow(Date.now())
  }
  return (
    <nav aria-label="App controls" className="account-nav">
      {player.user && (
        <ProfileAvatar
          key={`${player.user.uid}:${player.user.photoURL || ''}`}
          user={player.user}
        />
      )}
      <div className="daily-streak">
        <button
          className={`streak-button ${player.user && streak.claimable ? 'streak-ready' : 'streak-claimed'}`}
          aria-label={
            !player.user
              ? 'Sign in to start your daily streak'
              : `${streak.claimable ? 'Claim daily streak' : 'Daily streak already claimed'}. ${streak.current} ${streak.current === 1 ? 'day' : 'days'}.`
          }
          title={
            !player.user
              ? 'Sign in to start your daily streak'
              : streak.claimable
                ? 'Tap to check in for today'
                : `Next check-in: ${nextNoon}`
          }
          onClick={claim}
        >
          <Flame size={21} fill={streak.current ? 'currentColor' : 'none'} aria-hidden="true" />
          <strong>{streak.current}</strong>
          {player.user && streak.claimable && (
            <span className="streak-ready-dot" aria-hidden="true" />
          )}
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
              ref={menuButton}
              onClick={() => setPanel(menuOpen ? null : 'menu')}
              aria-label={`${menuOpen ? 'Close menu' : 'Open menu'}${available ? '. Update available' : ''}`}
              aria-controls="app-menu"
              aria-expanded={menuOpen}
            >
              <Menu size={23} aria-hidden="true" />
              {available && <span className="menu-update-dot" aria-hidden="true" />}
            </button>
            <div
              className="menu-scrim"
              data-open={menuOpen}
              aria-hidden="true"
              onClick={() => setPanel(null)}
            />
            <aside
              id="app-menu"
              aria-label="App menu"
              className="app-menu-drawer"
              data-open={menuOpen}
              inert={!menuOpen}
              aria-hidden={!menuOpen}
            >
              {panel === 'login' ? (
                <div className="menu-login">
                  <p className="eyebrow">Your own little journey</p>
                  <h2>Sign in</h2>
                  <p>Sign in to view your statistics and build your daily streak.</p>
                  <button
                    className="primary"
                    disabled={!player.ready || player.busy}
                    onClick={player.signIn}
                  >
                    <LogIn size={19} />
                    {player.busy ? 'Signing in…' : 'Sign in with Google'}
                  </button>
                  {player.error && (
                    <p className="input-error" role="alert">
                      {player.error}
                    </p>
                  )}
                  <button className="text-button" onClick={() => setPanel('menu')}>
                    Back to menu
                  </button>
                </div>
              ) : (
                <>
                  <p className="eyebrow">Make yourself at home</p>
                  <h2>Menu</h2>
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
                    <button
                      className="menu-action"
                      onClick={() => setPanel(player.user ? 'stats' : 'login')}
                    >
                      <ChartNoAxesCombined size={19} />
                      <span>Your statistics</span>
                    </button>
                    {isAdmin && (
                      <button className="menu-action" onClick={() => setPanel('admin')}>
                        <ShieldCheck size={19} />
                        <span>Admin panel</span>
                      </button>
                    )}
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
                      <button
                        className="menu-action"
                        disabled={player.busy}
                        onClick={player.signOut}
                      >
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
                      : 'Sign in to track your statistics and daily streak.'}
                  </p>
                </>
              )}
            </aside>
          </>
        )}
      />
      {panel === 'stats' && player.user && (
        <StatisticsDialog onClose={() => setPanel(null)} nextNoon={nextNoon} now={now} />
      )}
      {panel === 'admin' && isAdmin && (
        <Suspense
          fallback={
            <Dialog title="Admin panel" onClose={() => setPanel(null)}>
              <p role="status">Loading admin panel…</p>
            </Dialog>
          }
        >
          <AdminPanel key={player.user!.uid} onClose={() => setPanel(null)} />
        </Suspense>
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
    totals = totalStatistics(rows),
    streak = streakSummary(player.data.claims, now)
  const overview = [
    { label: 'Games played', value: totals.played },
    { label: 'Completed', value: totals.completed },
    { label: 'Games won', value: totals.wins },
    { label: 'Avg guesses per solve', value: formatAverage(totals.averageGuesses) },
    { label: 'Total guesses', value: totals.totalGuesses },
    {
      label: 'Trivia accuracy',
      value: totals.accuracy === null ? '—' : `${Math.round(totals.accuracy * 100)}%`,
    },
    { label: 'Daily streak', value: streak.current },
    { label: 'Longest streak', value: streak.longest },
  ]
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
          : ''}
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
      <section aria-label="Overall statistics" className="stats-total">
        <h3>Overall</h3>
        <div className="stats-overview">
          {overview.map((stat) => (
            <div key={stat.label} role="group" aria-label={stat.label}>
              <strong>{stat.value}</strong>
              <span>{stat.label}</span>
            </div>
          ))}
        </div>
        <p className="stats-average-note">
          Guess averages use solved guessing rounds. Trivia wins are perfect rounds.
        </p>
      </section>
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
      {totals.played > 0 && (
        <div className="stats-games">
          <h3>By game</h3>
          {rows
            .filter((r) => r.played)
            .map((r) => (
              <section
                key={r.mode}
                className="stats-mode"
                aria-label={`${STAT_LABELS[r.mode]} statistics`}
              >
                <h4>{STAT_LABELS[r.mode]}</h4>
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
                    {r.mode === 'adventure' ? ` · furthest stop: ${r.furthest}/13` : ''}
                    {r.mode !== 'adventure' && (
                      <>
                        <br />
                        {r.totalGuesses}{' '}
                        {r.mode === 'journey' ? 'border crossings' : 'total guesses'}
                        {' · '}
                        {formatAverage(
                          r.mode === 'journey' ? r.averageCrossings : r.averageGuesses,
                        )}{' '}
                        average {r.mode === 'journey' ? 'crossings' : 'guesses'} on wins
                      </>
                    )}
                  </p>
                )}
                <StatInsights row={r} />
              </section>
            ))}
        </div>
      )}
      <button className="primary" onClick={onClose}>
        <Check size={17} /> Back to exploring
      </button>
    </Dialog>
  )
}

function formatAverage(value: number | null) {
  return value === null
    ? '—'
    : new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value)
}
