import { useState } from 'react'
import { Image as ImageIcon, Info, RefreshCw } from 'lucide-react'
import type { Portrait } from '../lib/identify'
import Dialog from './Dialog'

export default function LicensedPortrait({
  portrait,
  answer,
}: {
  portrait: Portrait
  answer: string | null
}) {
  const [credits, setCredits] = useState(false)
  return (
    <>
      <PortraitImage key={portrait.id} portrait={portrait} answer={answer} />
      <div className="portrait-credit-line">
        <span>
          {portrait.creator} ·{' '}
          <a href={portrait.license.url} target="_blank" rel="noreferrer">
            {portrait.license.name}
          </a>
        </span>
        <button className="text-button" onClick={() => setCredits(true)}>
          <Info size={14} /> Image credits
        </button>
      </div>
      {credits && (
        <Dialog title="Image credits" onClose={() => setCredits(false)}>
          <div className="portrait-credit-detail">
            <p className="eyebrow">Source & reuse</p>
            <h2>Image credits</h2>
            <dl>
              <dt>Title</dt>
              <dd>{portrait.title}</dd>
              <dt>Creator</dt>
              <dd>{portrait.creator}</dd>
              <dt>Source</dt>
              <dd>
                <a href={portrait.sourceUrl} target="_blank" rel="noreferrer">
                  Wikimedia Commons file page
                </a>
              </dd>
              <dt>License / rights statement</dt>
              <dd>
                <a href={portrait.license.url} target="_blank" rel="noreferrer">
                  {portrait.license.name}
                </a>
              </dd>
              {portrait.credit && (
                <>
                  <dt>Source credit</dt>
                  <dd>{portrait.credit}</dd>
                </>
              )}
              {portrait.attribution && (
                <>
                  <dt>Additional attribution</dt>
                  <dd>{portrait.attribution}</dd>
                </>
              )}
              <dt>Changes</dt>
              <dd>{portrait.changes}</dd>
              {portrait.restrictions && (
                <>
                  <dt>Source notes</dt>
                  <dd>{portrait.restrictions}</dd>
                </>
              )}
            </dl>
            {portrait.license.code.startsWith('CC-BY-SA') && (
              <p>The adapted image is shared under the same license linked above.</p>
            )}
            <p>
              <a
                href={`${import.meta.env.BASE_URL}portraits/CREDITS.md`}
                target="_blank"
                rel="noreferrer"
              >
                Credits for the full portrait collection
              </a>
            </p>
          </div>
        </Dialog>
      )}
    </>
  )
}

function PortraitImage({ portrait, answer }: { portrait: Portrait; answer: string | null }) {
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  return (
    <div className="portrait-frame">
      {failed ? (
        <div className="portrait-image-error" role="alert">
          <ImageIcon size={30} />
          <p>The picture couldn’t load. Retry it, or use the clue.</p>
          <button
            className="text-button"
            onClick={() => {
              setAttempt((n) => n + 1)
              setLoading(true)
              setFailed(false)
            }}
          >
            Try loading picture again <RefreshCw size={15} />
          </button>
        </div>
      ) : (
        <>
          {loading && (
            <span className="portrait-loading" role="status">
              Loading the portrait…
            </span>
          )}
          <img
            key={attempt}
            src={`${import.meta.env.BASE_URL}portraits/${portrait.file}${attempt ? `?retry=${attempt}` : ''}`}
            width={portrait.width}
            height={portrait.height}
            alt={answer ? `Portrait of ${answer}` : 'Mystery person to identify'}
            decoding="async"
            onLoad={() => setLoading(false)}
            onError={() => {
              setLoading(false)
              setFailed(true)
            }}
          />
        </>
      )}
    </div>
  )
}
