import { Lightbulb } from 'lucide-react'
import type { Country } from '../lib/countries'

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
  return (
    <div className="flag-challenge">
      <span
        className="mystery-flag"
        role="img"
        aria-label={ended ? `${country.name} flag` : 'Mystery flag'}
      >
        <span aria-hidden="true">{country.flag}</span>
      </span>
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
