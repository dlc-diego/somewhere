import { lazy, Suspense } from 'react'
import type { CelebrationRequest } from '../lib/celebrations'

const Adventure = lazy(() => import('./Adventure'))

export default function Somehow({
  onCelebrate,
}: {
  onCelebrate: (events: CelebrationRequest[]) => void
}) {
  return (
    <div id="somehow-content" tabIndex={-1} className="somex-view">
      <Suspense
        fallback={
          <p className="something-loading" role="status">
            Packing your adventure…
          </p>
        }
      >
        <Adventure onCelebrate={onCelebrate} />
      </Suspense>
    </div>
  )
}
