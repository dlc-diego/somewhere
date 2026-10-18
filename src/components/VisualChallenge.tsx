import { Lightbulb } from 'lucide-react'
import { useState } from 'react'
import type { Country } from '../lib/countries'
import FlagImage from './FlagImage'

export default function VisualChallenge({
  mode,
  country,
  hintUsed,
  ended,
  onHint,
  hintDisabled = false,
  hintLabel = 'Hint: reveal continent',
}: {
  mode: 'flags' | 'shapes'
  country: Country
  hintUsed: boolean
  ended: boolean
  onHint: () => void
  hintDisabled?: boolean
  hintLabel?: string
}) {
  const isShape = mode === 'shapes'
  const [loading, setLoading] = useState(isShape)
  const [imageFailed, setImageFailed] = useState(false)
  return (
    <div className={`visual-challenge ${isShape ? 'shape-challenge' : 'flag-challenge'}`}>
      {imageFailed ? (
        <div className="flag-error" role="alert">
          <p>The {isShape ? 'shape' : 'flag'} couldn’t load.</p>
          <button
            className="text-button"
            onClick={() => {
              setLoading(isShape)
              setImageFailed(false)
            }}
          >
            Try {isShape ? 'shape' : 'flag'} again
          </button>
        </div>
      ) : isShape ? (
        <div className="shape-frame">
          {loading && (
            <span className="shape-loading" role="status">
              Drawing the mystery shape…
            </span>
          )}
          <img
            className="mystery-shape"
            src={`${import.meta.env.BASE_URL}shapes/${country.id}.svg`}
            alt={ended ? `${country.name} shape` : 'Mystery country shape'}
            width={320}
            height={220}
            decoding="async"
            onLoad={() => setLoading(false)}
            onError={() => {
              setLoading(false)
              setImageFailed(true)
            }}
          />
        </div>
      ) : (
        <FlagImage
          country={country}
          className="mystery-flag"
          alt={ended ? `${country.name} flag` : 'Mystery flag'}
          onError={() => setImageFailed(true)}
        />
      )}
      {hintUsed ? (
        <p className="continent-hint" role="status">
          <Lightbulb size={15} aria-hidden="true" /> Continent: <strong>{country.continent}</strong>
        </p>
      ) : !ended ? (
        <button className="flag-hint-button" onClick={onHint} disabled={hintDisabled}>
          <Lightbulb size={15} aria-hidden="true" /> {hintLabel}
        </button>
      ) : null}
    </div>
  )
}
