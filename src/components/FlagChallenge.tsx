import { Lightbulb } from 'lucide-react'
import { useState } from 'react'
import type { Country } from '../lib/countries'
import FlagImage from './FlagImage'

export default function FlagChallenge({
  country,
  hintUsed,
  ended,
  onHint,
}: {
  country: Country
  hintUsed: boolean
  ended: boolean
  onHint: () => void
}) {
  const [imageFailed, setImageFailed] = useState(false)
  return (
    <div className="flag-challenge">
      {imageFailed ? (
        <div className="flag-error" role="alert">
          <p>The flag couldn’t load.</p>
          <button className="text-button" onClick={() => setImageFailed(false)}>
            Try flag again
          </button>
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
        <button className="flag-hint-button" onClick={onHint}>
          <Lightbulb size={15} aria-hidden="true" /> Hint: reveal continent
        </button>
      ) : null}
    </div>
  )
}
