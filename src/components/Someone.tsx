import { lazy, Suspense, useEffect, useState } from 'react'
import { ChevronDown, UserRound } from 'lucide-react'
import type { CelebrationRequest } from '../lib/celebrations'
import WhoAmI from './WhoAmI'

const IdentifyMe = lazy(() => import('./IdentifyMe'))
const modeKey = 'someone.mode.v1'
type Mode = 'who' | 'identify'
export default function Someone({
  onCelebrate,
}: {
  onCelebrate: (requests: CelebrationRequest[]) => void
}) {
  const [mode, setMode] = useState<Mode>(() => {
    try {
      return localStorage.getItem(modeKey) === 'identify' ? 'identify' : 'who'
    } catch {
      return 'who'
    }
  })
  const [visitedIdentify, setVisitedIdentify] = useState(mode === 'identify')
  useEffect(() => {
    if (mode === 'identify') setVisitedIdentify(true)
    try {
      localStorage.setItem(modeKey, mode)
    } catch {
      /* Each game displays its own persistence warning. */
    }
  }, [mode])
  return (
    <section
      id="someone-content"
      className="something-games"
      tabIndex={-1}
      aria-labelledby={mode === 'who' ? 'someone-title' : 'identify-title'}
    >
      <div className="game-toolbar">
        <div className="mode-selector">
          <UserRound size={18} aria-hidden="true" />
          <label className="sr-only" htmlFor="someone-mode">
            Someone game mode
          </label>
          <select
            id="someone-mode"
            value={mode}
            onChange={(event) => setMode(event.target.value as Mode)}
          >
            <option value="who">Who am I</option>
            <option value="identify">Identify Me</option>
          </select>
          <ChevronDown size={17} aria-hidden="true" />
        </div>
      </div>
      <div hidden={mode !== 'who'}>
        <WhoAmI onCelebrate={onCelebrate} />
      </div>
      <div hidden={mode !== 'identify'}>
        {(visitedIdentify || mode === 'identify') && (
          <Suspense
            fallback={
              <p className="something-loading" role="status">
                Finding a familiar face…
              </p>
            }
          >
            <IdentifyMe onCelebrate={onCelebrate} />
          </Suspense>
        )}
      </div>
    </section>
  )
}
