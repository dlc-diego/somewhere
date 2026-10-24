import { ArrowDown, Flag, MapPin } from 'lucide-react'
import { countryById, type Country } from '../lib/countries'
import { hasEnded, hasWon, type Round } from '../lib/game'
import { shortestBorderRoute } from '../lib/journey'
import FlagImage from './FlagImage'

export function JourneyChallenge({ round }: { round: Round }) {
  const start = countryById.get(round.start!)!
  const destination = countryById.get(round.answer)!
  const ended = hasEnded(round)
  const shortest = shortestBorderRoute(start.id, destination.id)!.length - 1
  const extra = round.guesses.length - shortest
  return (
    <div className="journey-challenge">
      <div className="journey-endpoints">
        <div>
          <MapPin size={16} />
          <span>
            <small>Starting country</small>
            <strong>{start.name}</strong>
          </span>
          <FlagImage country={start} />
        </div>
        <ArrowDown size={17} className="journey-arrow" aria-hidden="true" />
        <div>
          <Flag size={16} />
          <span>
            <small>Destination</small>
            <strong>{destination.name}</strong>
          </span>
          <FlagImage country={destination} />
        </div>
      </div>
      {ended && (
        <p className="journey-instruction">
          {hasWon(round)
            ? `Destination reached in ${round.guesses.length} ${round.guesses.length === 1 ? 'crossing' : 'crossings'}!`
            : 'Your next adventure is just around the border.'}{' '}
          The shortest starting route takes {shortest} crossings.
          {hasWon(round) && (
            <span className={'journey-efficiency' + (extra === 0 ? ' is-optimal' : '')}>
              {extra === 0
                ? 'Optimal route'
                : extra + (extra === 1 ? ' extra crossing' : ' extra crossings')}
            </span>
          )}
        </p>
      )}
    </div>
  )
}

export function JourneyHistory({
  round,
  onFocus,
  idPrefix = '',
}: {
  round: Round
  onFocus: (country: Country) => void
  idPrefix?: string
}) {
  const route = [round.start!, ...round.guesses]
  const destination = countryById.get(round.answer)!
  const current = route.at(-1)!
  const remaining = round.revealed ? shortestBorderRoute(current, round.answer)! : null
  return (
    <section className="history journey-history" aria-labelledby={`${idPrefix}history-title`}>
      <div className="history-heading">
        <h2 id={`${idPrefix}history-title`}>Your border journey</h2>
        <span>
          {round.guesses.length} {round.guesses.length === 1 ? 'crossing' : 'crossings'}
        </span>
      </div>
      <button
        className="journey-destination"
        onClick={() => onFocus(destination)}
        aria-label={`Destination: ${destination.name}. Show on globe.`}
      >
        <Flag size={16} aria-hidden="true" />
        <span>
          <small>Destination</small>
          <strong>{destination.name}</strong>
        </span>
        <FlagImage country={destination} />
        <MapPin size={15} aria-hidden="true" />
      </button>
      <ol className="journey-list" aria-label="Route, in travel order">
        {route.map((id, index) => {
          const country = countryById.get(id)!
          return (
            <li key={`${index}:${id}`}>
              <button
                className={`journey-stop ${index === route.length - 1 ? 'current-stop' : ''}`}
                onClick={() => onFocus(country)}
                aria-label={`${index === 0 ? 'Start' : `Crossing ${index}`}: ${country.name}. ${index === route.length - 1 ? 'Current stop. ' : ''}Show on globe.`}
              >
                <span className="guess-number">
                  {index === 0 ? <MapPin size={15} /> : String(index).padStart(2, '0')}
                </span>
                <FlagImage country={country} />
                <span>
                  {country.name}
                  <small>
                    {index === 0
                      ? 'Starting country'
                      : id === round.answer
                        ? 'Destination reached'
                        : index === route.length - 1
                          ? 'Current stop'
                          : 'Border crossed'}
                  </small>
                </span>
              </button>
            </li>
          )
        })}
      </ol>
      {remaining && (
        <div className="revealed-route">
          <h3>A route from your last stop</h3>
          <p>One shortest route — other routes may work too.</p>
          <ol aria-label="Revealed route">
            {remaining.map((id, index) => (
              <li key={id}>
                <button className="text-button" onClick={() => onFocus(countryById.get(id)!)}>
                  {index > 0 && <span aria-hidden="true">→ </span>}
                  {countryById.get(id)!.name}
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  )
}
