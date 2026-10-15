import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import {
  ArrowRight,
  Check,
  CircleHelp,
  Compass,
  Globe2,
  Heart,
  MapPin,
  RotateCcw,
  Sparkles,
  Trophy,
} from 'lucide-react'
import CountrySearch from './components/CountrySearch'
import GuessHistory from './components/GuessHistory'
import Dialog from './components/Dialog'
import { addGuess, guessDetails, hasWon, loadRound, newRound, STORAGE_KEY } from './lib/game'
import { countryById, type Country } from './lib/countries'
import { formatDistance, temperatures, type Temperature } from './lib/geo'

const Globe = lazy(() => import('./components/Globe'))
type DialogType = 'help' | 'restart' | 'win' | null

export default function App() {
  const [initial] = useState(loadRound)
  const [round, setRound] = useState(initial.round)
  const [warning, setWarning] = useState(initial.warning)
  const [dialog, setDialog] = useState<DialogType>(null)
  const [selection, setSelection] = useState<{ country: Country; sequence: number } | null>(null)
  const [focus, setFocus] = useState<{ country: Country; sequence: number } | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const [copied, setCopied] = useState(false)
  const guesses = guessDetails(round)
  const won = hasWon(round)
  const closest = guesses.length ? Math.min(...guesses.map((g) => g.distance)) : null

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(round))
    } catch {
      setWarning('Browser storage is unavailable. This round may not survive a refresh.')
    }
  }, [round])

  const selectOnGlobe = useCallback(
    (country: Country) => setSelection((s) => ({ country, sequence: (s?.sequence || 0) + 1 })),
    [],
  )
  const focusCountry = useCallback(
    (country: Country) => setFocus((f) => ({ country, sequence: (f?.sequence || 0) + 1 })),
    [],
  )
  function submit(country: Country) {
    const result = addGuess(round, country.id)
    if (result.error) return result.error
    setRound(result.round)
    focusCountry(country)
    const latest = guessDetails(result.round).at(-1)!
    setAnnouncement(
      `${country.name}: ${formatDistance(latest.distance)} kilometers. ${temperatures[latest.temperature].label}. ${result.round.guesses.length} guesses.`,
    )
    if (hasWon(result.round)) setDialog('win')
  }
  function restart() {
    setRound(newRound(round.answer))
    setSelection(null)
    setFocus(null)
    setDialog(null)
    setCopied(false)
    setAnnouncement('A fresh mystery country is ready. Good luck!')
  }
  function requestRestart() {
    if (round.guesses.length && !won) setDialog('restart')
    else restart()
  }
  async function share() {
    const text = `I found ${countryById.get(round.answer)!.name} in ${guesses.length} ${guesses.length === 1 ? 'guess' : 'guesses'} on Somewhere! 🌍\n${window.location.href.split('#')[0]}`
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      setAnnouncement('Copying is unavailable in this browser. You can share the page URL instead.')
    }
  }

  return (
    <div className="app-shell">
      <a href="#country-search" className="skip-link">
        Skip to country search
      </a>
      <header className="site-header">
        <a className="brand" href="./" aria-label="Somewhere home">
          <span className="brand-icon">
            <Compass size={23} strokeWidth={1.5} />
          </span>
          somewhere<span className="brand-dot">.</span>
        </a>
        <span className="brand-tagline">A little world of discovery</span>
        <nav aria-label="Game actions">
          <button
            className="help-button"
            aria-label="How to play"
            onClick={() => setDialog('help')}
          >
            <CircleHelp size={17} />
            <span>How to play</span>
          </button>
          <button className="new-game" onClick={requestRestart}>
            <RotateCcw size={15} />
            <span>New round</span>
          </button>
        </nav>
      </header>

      <main>
        <section className="intro" aria-labelledby="page-title">
          <div>
            <p className="eyebrow">
              <span className="tiny-line" /> Follow your curiosity
            </p>
            <h1 id="page-title">
              One world. <em>One mystery.</em>
            </h1>
            <p className="intro-copy">There’s a country on our mind. Can you find it?</p>
          </div>
          <div className="intro-note">
            <Sparkles size={17} />
            <span>
              No timer. No pressure.
              <br />
              Just a little exploration.
            </span>
          </div>
        </section>
        {warning && (
          <div className="storage-warning" role="status">
            {warning}
          </div>
        )}
        <div className="game-layout">
          <section className="globe-panel" aria-label="Explore the world">
            <Suspense
              fallback={
                <div className="globe-loading" role="status">
                  <Globe2 size={35} />
                  <p>Getting the world ready…</p>
                </div>
              }
            >
              <Globe guesses={guesses} focus={focus} onSelect={selectOnGlobe} />
            </Suspense>
            <div className="temperature-legend" aria-label="Distance color key">
              <span className="legend-label">Far away</span>
              <div className="legend-stops">
                {(['cold', 'cool', 'warm', 'hot'] as Temperature[]).map((t) => (
                  <span key={t}>
                    <i style={{ backgroundColor: temperatures[t].color }} />
                    <span>{temperatures[t].label}</span>
                  </span>
                ))}
              </div>
              <span className="legend-label">Getting closer</span>
            </div>
          </section>

          <div className="play-column">
            <section className="search-card" id="country-search" aria-labelledby="search-title">
              <div className="search-card-top">
                <span className={`round-status ${won ? 'is-won' : ''}`}>
                  <span /> {won ? 'Mystery solved' : 'The search is on'}
                </span>
                <span className="round-label">195 countries</span>
              </div>
              <h2 id="search-title">
                {won ? 'You found your somewhere.' : 'A hunch is a good start.'}
              </h2>
              <p className="card-description">
                {won
                  ? `${countryById.get(round.answer)!.name} was the mystery country. Beautifully explored.`
                  : 'Guess a country. We’ll tell you how close you are.'}
              </p>
              {won ? (
                <div className="completed-actions">
                  <button className="primary" onClick={restart}>
                    Explore another round <ArrowRight size={18} />
                  </button>
                  <button className="text-button" onClick={() => setDialog('win')}>
                    <Trophy size={15} /> See your discovery
                  </button>
                </div>
              ) : (
                <CountrySearch
                  key={round.answer}
                  onGuess={submit}
                  guessed={round.guesses}
                  disabled={won}
                  selection={selection}
                />
              )}
            </section>
            <GuessHistory guesses={guesses} onFocus={focusCountry} />
            {closest !== null && !won && (
              <div className="closest-note">
                <MapPin size={14} />
                <span>
                  Your closest guess is <strong>{formatDistance(closest)} km</strong> away.
                </span>
              </div>
            )}
          </div>
        </div>
        <p className="game-footnote">
          <Globe2 size={14} /> Distances are measured between country centers. Every direction is a
          possibility.
        </p>
      </main>
      <footer className="site-footer">
        <span>
          Made for curious hearts <Heart size={12} />
        </span>
        <button className="text-button" onClick={() => setDialog('help')}>
          A small world, explained <ArrowRight size={13} />
        </button>
      </footer>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>

      {dialog === 'help' && (
        <Dialog title="How to play Somewhere" onClose={() => setDialog(null)}>
          <span className="dialog-emblem">
            <Compass size={30} />
          </span>
          <p className="eyebrow">A little guide</p>
          <h2>
            A world of discovery.
            <br />
            One guess at a time.
          </h2>
          <ol className="help-steps">
            <li>
              <span>01</span>
              <div>
                <strong>Pick a country</strong>
                <p>
                  Search a name or alias, or tap a country on the globe. Select it, then make your
                  guess.
                </p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>Follow the warmth</strong>
                <p>
                  Each guess reveals its distance to the mystery country’s center. Cold is 7,000+
                  km; cool is 3,000–7,000; warm is 1,000–3,000; hot is under 1,000.
                </p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>Find your somewhere</strong>
                <p>
                  There’s no guess limit. Find the exact country to win, then start a fresh
                  adventure. Your round saves in this browser.
                </p>
              </div>
            </li>
          </ol>
          <div className="help-note">
            <strong>A note on the world</strong>
            <p>
              We play with 193 UN member states, Palestine, and Vatican City. Territories and other
              disputed states are outside this version’s answer list. Borders are simplified; small
              guessed countries get a marker. Centers are approximate, and distance is
              center-to-center, not border-to-border.
            </p>
            <p>
              The answer stays unmarked until guessed. As a browser-only game, it can be found by
              inspecting saved data.
            </p>
            <p>
              Map:{' '}
              <a href="https://www.naturalearthdata.com/" target="_blank" rel="noreferrer">
                Natural Earth
              </a>{' '}
              /{' '}
              <a href="https://github.com/topojson/world-atlas" target="_blank" rel="noreferrer">
                world-atlas
              </a>{' '}
              (public-domain geography). Country data:{' '}
              <a href="https://github.com/mledoze/countries" target="_blank" rel="noreferrer">
                mledoze/countries
              </a>{' '}
              (<a href={`${import.meta.env.BASE_URL}data/ODbL.txt`}>ODbL</a>);{' '}
              <a href={`${import.meta.env.BASE_URL}data/countries.json`}>download adapted data</a>.
            </p>
          </div>
          <button className="primary" onClick={() => setDialog(null)}>
            Let’s explore <ArrowRight size={17} />
          </button>
        </Dialog>
      )}
      {dialog === 'restart' && (
        <Dialog title="Start a new round?" onClose={() => setDialog(null)}>
          <span className="dialog-emblem">
            <RotateCcw size={28} />
          </span>
          <h2>A new direction?</h2>
          <p className="dialog-description">
            Your current journey has {guesses.length} {guesses.length === 1 ? 'guess' : 'guesses'}.
            Starting over will replace this round with a new mystery country.
          </p>
          <button className="primary" onClick={restart}>
            Start a fresh round <ArrowRight size={17} />
          </button>
          <button className="secondary" onClick={() => setDialog(null)}>
            Keep exploring this round
          </button>
        </Dialog>
      )}
      {dialog === 'win' && (
        <Dialog
          title="You found the mystery country"
          onClose={() => setDialog(null)}
          className="win-dialog"
        >
          <span className="victory-symbol">
            <Trophy size={32} strokeWidth={1.5} />
          </span>
          <p className="eyebrow">Oh, there you are</p>
          <h2>
            You found your
            <br />
            <em>somewhere.</em>
          </h2>
          <span className="victory-country">
            <span aria-hidden="true">{countryById.get(round.answer)!.flag}</span>
            {countryById.get(round.answer)!.name}
          </span>
          <p className="dialog-description">
            One mystery. {guesses.length}{' '}
            {guesses.length === 1 ? 'brilliant guess' : 'curious guesses'}.<br />A whole world well
            explored.
          </p>
          <button className="primary" onClick={restart}>
            Let’s go somewhere new <ArrowRight size={17} />
          </button>
          <button className="secondary" onClick={share}>
            {copied ? <Check size={16} /> : <Heart size={16} />}
            {copied ? 'Result copied' : 'Copy your discovery'}
          </button>
        </Dialog>
      )}
    </div>
  )
}
