import { lazy, Suspense, useState, type FormEvent } from 'react'
import { Construction, LockKeyhole, ArrowRight } from 'lucide-react'
import type { CelebrationRequest } from '../lib/celebrations'

const Adventure = lazy(() => import('./Adventure'))
const unlockKey = 'somex.dev-unlocked.v1'
export default function Somex({
  onCelebrate,
}: {
  onCelebrate: (events: CelebrationRequest[]) => void
}) {
  const [unlocked, setUnlocked] = useState(() => {
    try {
      return sessionStorage.getItem(unlockKey) === 'yes'
    } catch {
      return false
    }
  })
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  function unlock(event: FormEvent) {
    event.preventDefault()
    if (password.trim() !== 'dev') {
      setError('That password didn’t match. Try again.')
      return
    }
    try {
      sessionStorage.setItem(unlockKey, 'yes')
    } catch {
      /* Allow this session without storage. */
    }
    setUnlocked(true)
    setPassword('')
    setError('')
  }
  function lock() {
    try {
      sessionStorage.removeItem(unlockKey)
    } catch {
      /* The in-memory gate still closes. */
    }
    setUnlocked(false)
  }
  return (
    <div id="somex-content" tabIndex={-1} className="somex-view">
      {unlocked ? (
        <Suspense
          fallback={
            <p className="something-loading" role="status">
              Packing your adventure…
            </p>
          }
        >
          <Adventure onCelebrate={onCelebrate} onLock={lock} />
        </Suspense>
      ) : (
        <section className="coming-soon somex-gate" aria-labelledby="somex-gate-title">
          <div className="coming-soon-icon" aria-hidden="true">
            <LockKeyhole size={38} strokeWidth={1.3} />
            <span>
              <Construction size={19} />
            </span>
          </div>
          <p className="somex-badge">Somex · Early preview</p>
          <h2 id="somex-gate-title">Under construction</h2>
          <p>A little adventure is taking shape. Developer access is available for testing.</p>
          <form onSubmit={unlock} className="somex-unlock">
            <label htmlFor="somex-password">Developer password</label>
            <input
              id="somex-password"
              type="password"
              autoComplete="off"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value)
                setError('')
              }}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'somex-password-error' : undefined}
            />
            <button className="primary" type="submit" disabled={!password.trim()}>
              Unlock preview <ArrowRight size={17} />
            </button>
            {error && (
              <p className="input-error" id="somex-password-error" role="alert">
                {error}
              </p>
            )}
          </form>
        </section>
      )}
    </div>
  )
}
