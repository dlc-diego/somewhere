import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Search, ShieldCheck, RefreshCw, Flame, ArrowRight, Check } from 'lucide-react'
import Dialog from './Dialog'
import StatInsights from './StatInsights'
import {
  adminError,
  applyStreakCredit,
  findPlayers,
  loadAdminPlayer,
  loadAudit,
  type AdminPlayer,
  type AuditEntry,
  type PlayerProfile,
} from '../lib/adminClient'
import { MAX_STREAK_CREDIT, planStreakCredit, type StreakCreditPlan } from '../lib/adminStreak'
import { statistics, STAT_LABELS, totalStatistics } from '../lib/playerData'
import { CENTRAL_ZONE, streakSummary } from '../lib/streak'

const date = (at: number) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: CENTRAL_ZONE,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(at)
const average = (value: number | null) =>
  value === null ? '—' : new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value)

export default function AdminPanel({ onClose }: { onClose: () => void }) {
  const [search, setSearch] = useState('')
  const [players, setPlayers] = useState<PlayerProfile[]>([])
  const [selected, setSelected] = useState<AdminPlayer | null>(null)
  const [audit, setAudit] = useState<AuditEntry[]>([])
  const [busy, setBusy] = useState(true),
    [saving, setSaving] = useState(false)
  const [error, setError] = useState(''),
    [notice, setNotice] = useState('')
  const [desired, setDesired] = useState(''),
    [reason, setReason] = useState('')
  const [preview, setPreview] = useState<StreakCreditPlan | null>(null)
  const request = useRef(0)
  useEffect(() => {
    let active = true
    void Promise.all([findPlayers(''), loadAudit()])
      .then(([people, history]) => {
        if (active) {
          setPlayers(people)
          setAudit(history)
        }
      })
      .catch((e) => {
        if (active) setError(adminError(e))
      })
      .finally(() => {
        if (active) setBusy(false)
      })
    return () => {
      active = false
      request.current++
    }
  }, [])
  async function lookup(event: FormEvent) {
    event.preventDefault()
    const token = ++request.current
    setBusy(true)
    setError('')
    setNotice('')
    setPreview(null)
    setSelected(null)
    try {
      const people = await findPlayers(search)
      if (token === request.current) setPlayers(people)
    } catch (e) {
      if (token === request.current) setError(adminError(e))
    } finally {
      if (token === request.current) setBusy(false)
    }
  }
  async function select(profile: PlayerProfile) {
    const token = ++request.current
    setBusy(true)
    setError('')
    setNotice('')
    setPreview(null)
    setSelected(null)
    setReason('')
    setDesired('')
    try {
      const player = await loadAdminPlayer(profile)
      if (token === request.current) setSelected(player)
    } catch (e) {
      if (token === request.current) setError(adminError(e))
    } finally {
      if (token === request.current) setBusy(false)
    }
  }
  function prepare(event: FormEvent) {
    event.preventDefault()
    setError('')
    setNotice('')
    if (!selected) return
    try {
      if (reason.trim().length < 3)
        throw new Error('Please add a short reason for this adjustment.')
      setPreview(planStreakCredit(selected.data.claims, Number(desired)))
    } catch (e) {
      setError(adminError(e))
    }
  }
  async function confirm() {
    if (!selected || !preview || saving) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      await applyStreakCredit(selected.profile.uid, preview, reason)
      setPreview(null)
      setNotice('Streak credited. Check-ins will sync to the player’s connected devices.')
      const [updated, history] = await Promise.all([loadAdminPlayer(selected.profile), loadAudit()])
      setSelected(updated)
      setAudit(history)
      setDesired('')
      setReason('')
    } catch (e) {
      setError(adminError(e))
      setPreview(null)
    } finally {
      setSaving(false)
    }
  }
  const rows = selected ? statistics(selected.data) : [],
    totals = totalStatistics(rows)
  const streak = selected ? streakSummary(selected.data.claims) : null
  return (
    <Dialog
      title="Admin panel"
      onClose={() => {
        if (!saving) onClose()
      }}
      className="admin-panel"
    >
      <p className="eyebrow">
        <ShieldCheck size={15} aria-hidden="true" /> A little behind the scenes
      </p>
      <h2>Admin panel</h2>
      <p className="admin-note">
        Player statistics are read-only. Streak credits add missing check-ins and keep a record of
        every adjustment.
      </p>
      <section aria-label="Player lookup">
        <form className="admin-lookup" onSubmit={lookup}>
          <label htmlFor="admin-player-search">Find a player</label>
          <div className="admin-actions">
            <input
              id="admin-player-search"
              type="search"
              autoComplete="off"
              placeholder="Full email or Firebase UID"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              disabled={saving}
            />
            <button className="primary" type="submit" disabled={busy || saving}>
              <Search size={17} aria-hidden="true" />
              <span>Find</span>
            </button>
          </div>
        </form>
        <p className="admin-note">
          Leave blank for 20 recent players. Names appear after a player opens this version while
          signed in.
        </p>
        {busy && <p role="status">Loading player information…</p>}
        {!busy && !players.length && (
          <p>
            No matching players. Try their Firebase UID, or ask them to open the app while signed
            in.
          </p>
        )}
        <ul className="admin-players" aria-label="Players">
          {players.map((profile) => (
            <li key={profile.uid}>
              <button
                disabled={busy || saving}
                onClick={() => void select(profile)}
                aria-pressed={selected?.profile.uid === profile.uid}
              >
                <span>
                  <strong>{profile.displayName || profile.email || 'Player'}</strong>
                  <small>{profile.email || profile.uid}</small>
                </span>
                <ArrowRight size={18} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      </section>
      {error && (
        <p className="input-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="admin-success" role="status">
          <Check size={17} aria-hidden="true" />
          {notice}
        </p>
      )}
      {selected && streak && (
        <section aria-label="Selected player" className="admin-selected">
          <div className="admin-actions admin-heading">
            <h3>{selected.profile.displayName || selected.profile.email || 'Player'}</h3>
            <button
              className="text-button"
              disabled={busy || saving}
              onClick={() => void select(selected.profile)}
            >
              <RefreshCw size={15} />
              Reload player
            </button>
          </div>
          <p className="admin-uid">UID: {selected.profile.uid}</p>
          <div className="stats-overview">
            {[
              ['Games played', totals.played],
              ['Games won', totals.wins],
              ['Current streak', streak.current],
              ['Longest streak', streak.longest],
            ].map(([label, value]) => (
              <div key={label} role="group" aria-label={String(label)}>
                <strong>{value}</strong>
                <span>{label}</span>
              </div>
            ))}
          </div>
          {rows.some((row) => row.played) && (
            <div className="admin-game-stats" aria-label="Per-game statistics">
              {rows
                .filter((row) => row.played)
                .map((row) => (
                  <section key={row.mode}>
                    <p>
                      <strong>{STAT_LABELS[row.mode]}</strong>
                      <span>
                        {row.played} played · {row.wins} wins
                        {row.averageGuesses !== null
                          ? ` · ${average(row.averageGuesses)} avg guesses`
                          : ''}
                        {row.averageCrossings !== null
                          ? ` · ${average(row.averageCrossings)} avg crossings`
                          : ''}
                        {row.mode === 'trivia' && row.answered
                          ? ` · ${Math.round((row.correct / row.answered) * 100)}% accuracy`
                          : ''}
                      </span>
                    </p>
                    <StatInsights row={row} />
                  </section>
                ))}
            </div>
          )}
          <details className="admin-checkins">
            <summary>Recent check-ins ({Object.keys(selected.data.claims).length} total)</summary>
            <ul>
              {Object.values(selected.data.claims)
                .sort((a, b) => b.day - a.day)
                .slice(0, 14)
                .map((claim) => (
                  <li key={claim.day}>{date(claim.at)} Central</li>
                ))}
            </ul>
          </details>
          <form className="admin-credit" onSubmit={prepare}>
            <h3>
              <Flame size={18} aria-hidden="true" /> Credit a streak
            </h3>
            <p className="admin-note">
              Adds missing days to reach the chosen streak.{' '}
              {streak.claimable
                ? 'Today’s check-in stays available.'
                : 'Today’s existing check-in stays intact.'}
            </p>
            <label htmlFor="admin-streak-days">Desired current streak</label>
            <input
              id="admin-streak-days"
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_STREAK_CREDIT}
              step={1}
              required
              value={desired}
              disabled={saving || !!preview}
              onChange={(e) => setDesired(e.target.value)}
              placeholder="e.g. 6"
            />
            <label htmlFor="admin-credit-reason">Reason</label>
            <textarea
              id="admin-credit-reason"
              rows={2}
              minLength={3}
              maxLength={240}
              required
              value={reason}
              disabled={saving || !!preview}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Credit days played before sign-in was added"
            />
            {!preview && (
              <button className="primary" disabled={busy || saving}>
                Preview adjustment
              </button>
            )}
            {preview && (
              <div className="admin-preview" role="group" aria-label="Confirm streak adjustment">
                <strong>
                  {selected.profile.displayName || selected.profile.email || selected.profile.uid}
                </strong>
                <p>
                  Current streak:{' '}
                  <strong>
                    {preview.current} → {preview.desired} days
                  </strong>
                  <br />
                  Longest streak after credit: {preview.longest} days
                  <br />
                  {preview.days.length} missing {preview.days.length === 1 ? 'day' : 'days'} will be
                  credited.
                </p>
                <p className="admin-note">Reason: {reason.trim()}</p>
                <div className="admin-actions">
                  <button
                    type="button"
                    className="text-button"
                    disabled={saving}
                    onClick={() => setPreview(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="primary"
                    disabled={saving}
                    onClick={() => void confirm()}
                  >
                    {saving ? 'Saving credit…' : 'Confirm streak credit'}
                  </button>
                </div>
              </div>
            )}
          </form>
        </section>
      )}
      <section className="admin-history" aria-label="Admin activity history">
        <h3>Activity history</h3>
        <p className="admin-note">Latest 25 streak adjustments · times shown in Central.</p>
        {!audit.length && <p>No adjustments yet.</p>}
        <ol>
          {audit.map((entry) => (
            <li key={entry.id}>
              <strong>
                {entry.previousCurrent} → {entry.requestedCurrent} days
              </strong>
              <p>
                Player: <span className="admin-uid">{entry.targetUid}</span>
              </p>
              <p>{entry.reason}</p>
              <small>
                {date(entry.createdAt)} · {entry.creditedDays.length} days credited
                <br />
                By <span className="admin-uid">{entry.actorUid}</span>
              </small>
            </li>
          ))}
        </ol>
      </section>
    </Dialog>
  )
}
