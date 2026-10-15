import { Flag, MapPin, Navigation, Trophy } from 'lucide-react'
import { formatDistance, temperatures } from '../lib/geo'
import { sortGuessesByDistance, type Guess } from '../lib/game'
import type { Country, GameMode, Location } from '../lib/countries'

export default function GuessHistory({
  guesses,
  onFocus,
  mode,
}: {
  guesses: Guess[]
  onFocus: (country: Country, location: Location) => void
  mode: GameMode
}) {
  const sorted = sortGuessesByDistance(guesses)
  const closest = sorted[0]
  return (
    <section className="history" aria-labelledby="history-title">
      <div className="history-heading">
        <h2 id="history-title">Your journey</h2>
        <span>
          {guesses.length} {guesses.length === 1 ? 'guess' : 'guesses'}
        </span>
      </div>
      {guesses.length === 0 ? (
        <div className="empty-history">
          <div className="empty-route" aria-hidden="true">
            <span>
              <MapPin size={20} />
            </span>
            <i />
            <span>
              <Navigation size={20} />
            </span>
            <i />
            <span>
              <Flag size={20} />
            </span>
          </div>
          <h3>Every adventure starts somewhere.</h3>
          <p>
            Make your first guess and follow the warmth.
            <br />
            Your discoveries will appear here.
          </p>
        </div>
      ) : (
        <ol className="guess-list" aria-label="Guesses, closest first">
          {sorted.map((g) => (
            <li
              key={g.country.id}
              className={closest.country.id === g.country.id ? 'closest-guess' : undefined}
            >
              <button
                className="guess-row"
                onClick={() => onFocus(g.country, g.location)}
                aria-label={`${g.number}. ${g.location.name}${mode === 'capitals' ? `, ${g.country.name}` : ''}, ${formatDistance(g.distance)} kilometers, ${temperatures[g.temperature].label}. ${closest.country.id === g.country.id ? 'Closest guess. ' : ''}Show on globe.`}
              >
                <span className="guess-number">{String(g.number).padStart(2, '0')}</span>
                <span className="guess-country">
                  <span className="country-flag" aria-hidden="true">
                    {g.country.flag}
                  </span>
                  <span>
                    {g.location.name}
                    {mode === 'capitals' && <small>{g.country.name}</small>}
                    {closest?.country.id === g.country.id && (
                      <small>
                        {g.temperature === 'found' ? (
                          <>
                            <Trophy size={10} /> Mystery solved
                          </>
                        ) : (
                          <>
                            <MapPin size={10} /> Closest guess
                          </>
                        )}
                      </small>
                    )}
                  </span>
                </span>
                <span className="guess-result">
                  <strong>
                    {formatDistance(g.distance)} <span>km</span>
                  </strong>
                  <span className={`temperature temperature-${g.temperature}`}>
                    <span aria-hidden="true">{temperatures[g.temperature].symbol}</span>{' '}
                    {temperatures[g.temperature].label}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
