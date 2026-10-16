import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  Check,
  CircleHelp,
  Compass,
  Flag,
  Globe2,
  Heart,
  MapPin,
  RotateCcw,
  Trophy,
} from 'lucide-react'
import GuessSearch from './components/GuessSearch'
import FlagChallenge from './components/FlagChallenge'
import FlagImage from './components/FlagImage'
import GuessHistory from './components/GuessHistory'
import Dialog from './components/Dialog'
import VictoryCelebration from './components/VictoryCelebration'
import { createCelebrationPicker, type Celebration } from './lib/celebrations'
import {
  addGuess,
  guessDetails,
  hasEnded,
  hasWon,
  loadRound,
  newRound,
  revealAnswer,
  revealContinentHint,
  storageKeyFor,
  MODE_KEY,
  type Round,
} from './lib/game'
import {
  countryById,
  locationFor,
  type Country,
  type GameMode,
  type Location,
} from './lib/countries'
import { formatDistance, temperatures, type Temperature } from './lib/geo'
import {
  GLOBE_FOCUS_DELAY_MS,
  GLOBE_FOCUS_DURATION_MS,
  GUESS_BLINK_DURATION_MS,
  prefersReducedMotion,
} from './lib/motion'

const Globe = lazy(() => import('./components/Globe'))
type DialogType = 'help' | 'restart' | 'result' | null

export default function App() {
  const [initial] = useState(loadRound)
  const [round, setRound] = useState(initial.round)
  const [warning, setWarning] = useState(initial.warning)
  const [dialog, setDialog] = useState<DialogType>(null)
  const [focus, setFocus] = useState<{
    countryId: string
    location: Location
    sequence: number
  } | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const [copied, setCopied] = useState(false)
  const [resultPending, setResultPending] = useState(false)
  const [pickCelebration] = useState(() => createCelebrationPicker())
  const [celebration, setCelebration] = useState<Celebration | null>(null)
  const finishCelebration = useCallback(() => setCelebration(null), [])
  const globePanel = useRef<HTMLElement>(null)
  const roundsCache = useRef(new Map<GameMode, Round>([[initial.round.mode, initial.round]]))
  const guesses = guessDetails(round)
  const won = hasWon(round)
  const ended = hasEnded(round)
  const mode = round.mode
  const item = mode === 'flags' ? 'flag' : mode === 'capitals' ? 'capital' : 'country'
  const answerCountry = countryById.get(round.answer)!
  const answerLocation = locationFor(answerCountry, mode)
  const closest = guesses.length ? Math.min(...guesses.map((g) => g.distance)) : null

  useEffect(() => {
    try {
      localStorage.setItem(storageKeyFor(round.mode), JSON.stringify(round))
      localStorage.setItem(MODE_KEY, round.mode)
    } catch {
      setWarning('Browser storage is unavailable. This round may not survive a refresh.')
    }
  }, [round])

  useEffect(() => {
    if (!focus || !window.matchMedia('(max-width: 820px)').matches) return
    // Let the mobile keyboard close before centering the globe in the viewport.
    if (document.activeElement instanceof HTMLInputElement) document.activeElement.blur()
    const timer = window.setTimeout(() => {
      globePanel.current?.querySelector('.globe-viewport')?.scrollIntoView({
        block: 'center',
        behavior: prefersReducedMotion() ? 'instant' : 'smooth',
      })
    }, 120)
    return () => window.clearTimeout(timer)
  }, [focus])

  useEffect(() => {
    if (!resultPending) return
    // Keep the result dialog from covering the answer's arrival cue.
    const timer = window.setTimeout(
      () => {
        setDialog('result')
        setResultPending(false)
      },
      prefersReducedMotion()
        ? 0
        : GLOBE_FOCUS_DELAY_MS + GLOBE_FOCUS_DURATION_MS + GUESS_BLINK_DURATION_MS + 100,
    )
    return () => window.clearTimeout(timer)
  }, [resultPending])

  const focusCountry = useCallback(
    (country: Country, location: Location = country) =>
      setFocus((f) => ({ countryId: country.id, location, sequence: (f?.sequence || 0) + 1 })),
    [],
  )
  function submit(country: Country) {
    const result = addGuess(round, country.id)
    if (result.error) return result.error
    setRound(result.round)
    const latest = guessDetails(result.round).at(-1)!
    focusCountry(country, latest.location)
    setAnnouncement(
      `${latest.location.name}: ${formatDistance(latest.distance)} kilometers. ${temperatures[latest.temperature].label}. ${result.round.guesses.length} guesses.`,
    )
    if (hasWon(result.round)) {
      setCelebration(prefersReducedMotion() ? null : pickCelebration())
      setResultPending(true)
    }
  }
  function restart() {
    setRound(newRound(round.answer, mode))
    setFocus(null)
    setDialog(null)
    setCopied(false)
    setResultPending(false)
    setCelebration(null)
    setAnnouncement(`A fresh mystery ${item} is ready. Good luck!`)
  }
  function requestRestart() {
    if ((round.guesses.length || round.hintUsed) && !ended) setDialog('restart')
    else restart()
  }
  function changeMode(nextMode: GameMode) {
    if (nextMode === mode) return
    roundsCache.current.set(mode, round)
    const loaded = loadRound(nextMode)
    const nextRound = roundsCache.current.get(nextMode) || loaded.round
    setRound(nextRound)
    setWarning(loaded.warning)
    setFocus(null)
    setDialog(null)
    setCopied(false)
    setResultPending(false)
    setCelebration(null)
    setAnnouncement(`Now guessing ${nextMode}. Each mode keeps its own round.`)
  }
  function giveUp() {
    if (ended) return
    setRound(revealAnswer(round))
    focusCountry(answerCountry, answerLocation)
    setResultPending(true)
    setAnnouncement(
      `Answer revealed: ${answerLocation.name}${mode === 'capitals' ? `, ${answerCountry.name}` : ''}. Round complete.`,
    )
  }
  function showContinentHint() {
    setRound(revealContinentHint(round))
    setAnnouncement(`Continent hint: ${answerCountry.continent}. Keep guessing!`)
  }
  async function share() {
    const text = `${won ? 'I found' : 'I revealed'} ${answerLocation.name} (${mode}) ${won ? 'in' : 'after'} ${guesses.length} ${guesses.length === 1 ? 'guess' : 'guesses'} on Somewhere! 🌍\n${window.location.href.split('#')[0]}`
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
        Skip to guessing
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
          <h1 id="page-title">
            Built for Val <Heart className="title-heart" aria-hidden="true" strokeWidth={1.5} />
          </h1>
        </section>
        {warning && (
          <div className="storage-warning" role="status">
            {warning}
          </div>
        )}
        <div className="game-layout">
          <section
            className="search-card"
            id="country-search"
            aria-label={
              mode === 'flags'
                ? 'Flag search'
                : mode === 'capitals'
                  ? 'Capital search'
                  : 'Country search'
            }
          >
            <div className="mode-selector" role="group" aria-label="Game mode">
              <button aria-pressed={mode === 'countries'} onClick={() => changeMode('countries')}>
                <Globe2 size={15} /> Countries
              </button>
              <button aria-pressed={mode === 'capitals'} onClick={() => changeMode('capitals')}>
                <MapPin size={15} /> Capitals
              </button>
              <button aria-pressed={mode === 'flags'} onClick={() => changeMode('flags')}>
                <Flag size={15} /> Flags
              </button>
            </div>
            {mode === 'flags' && (
              <FlagChallenge
                key={round.answer}
                country={answerCountry}
                hintUsed={Boolean(round.hintUsed)}
                ended={ended}
                onHint={showContinentHint}
              />
            )}
            {ended && (
              <>
                <h2>
                  {won ? 'You found your somewhere.' : `The answer was ${answerLocation.name}.`}
                </h2>
                <p className="card-description">
                  {answerLocation.name}
                  {mode === 'capitals' ? `, ${answerCountry.name},` : ''}{' '}
                  {mode === 'flags'
                    ? 'was the country behind the flag.'
                    : `was the mystery ${item}.`}{' '}
                  {won ? 'Beautifully explored.' : 'A new discovery for your next adventure.'}
                </p>
              </>
            )}
            {ended ? (
              <div className="completed-actions">
                <button className="primary" onClick={restart}>
                  Explore another round <ArrowRight size={18} />
                </button>
                <button className="text-button" onClick={() => setDialog('result')}>
                  {won ? <Trophy size={15} /> : <Globe2 size={15} />} See your discovery
                </button>
              </div>
            ) : (
              <GuessSearch
                mode={mode}
                key={`${mode}:${round.answer}`}
                onGuess={submit}
                guessed={round.guesses}
                disabled={ended}
              />
            )}
          </section>
          <section ref={globePanel} className="globe-panel" aria-label="Explore the world">
            <Suspense
              fallback={
                <div className="globe-loading" role="status">
                  <Globe2 size={35} />
                  <p>Getting the world ready…</p>
                </div>
              }
            >
              <Globe
                guesses={guesses}
                focus={focus}
                mode={mode}
                answerReveal={
                  round.revealed ? { country: answerCountry, location: answerLocation } : null
                }
              />
            </Suspense>
            <div className="temperature-legend" aria-label="Distance color key">
              <span className="legend-label">Far away</span>
              <div className="legend-stops">
                {(['cold', 'cool', 'warm', 'hot', 'adjacent'] as Temperature[]).map((t) => (
                  <span key={t}>
                    <i style={{ backgroundColor: temperatures[t].color }} />
                    <span>{temperatures[t].label}</span>
                  </span>
                ))}
              </div>
              <span className="legend-label">Getting closer</span>
            </div>
          </section>

          <div className="history-column">
            <GuessHistory guesses={guesses} mode={mode} onFocus={focusCountry} />
            {closest !== null && !ended && (
              <div className="closest-note">
                <MapPin size={14} />
                <span>
                  Your closest guess is <strong>{formatDistance(closest)} km</strong> away.
                </span>
              </div>
            )}
          </div>
        </div>
        {!ended && (
          <div className="give-up-area">
            <button className="give-up-button" onClick={giveUp}>
              Give up and reveal answer
            </button>
          </div>
        )}
      </main>
      <footer className="site-footer">
        <span>
          Built for Val <Heart size={12} />
        </span>
        <button className="text-button" onClick={() => setDialog('help')}>
          How to play <ArrowRight size={13} />
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
                <strong>Choose countries, capitals or flags</strong>
                <p>
                  Use the mode buttons to guess a country, a capital city, or the country behind a
                  flag image. In Flags, “Hint: reveal continent” gives a clue without ending your
                  round or using a guess. Search a name or alias, select a suggestion, then make
                  your guess. Each mode keeps its own saved round. The globe is for exploring;
                  tapping it never selects a guess. Pinch or use +/− to zoom up to 32×. Each guess
                  or reveal automatically zooms to suit the country’s size.
                </p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>Follow the warmth</strong>
                <p>
                  Country and flag rounds measure center-to-center distance; capital rounds measure
                  city-to-city distance. Cold is 7,000+ km; cool is 3,000–7,000; warm is
                  1,000–3,000; hot is under 1,000. Countries sharing a land border are marked
                  “Adjacent” with the hottest color, regardless of distance. In capital mode,
                  “Adjacent” means the capitals' countries share a land border, not that the cities
                  touch. Capital guesses get city markers as well as country colors. Your closest
                  guess stays highlighted at the top of the list.
                </p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>Find your somewhere</strong>
                <p>
                  There’s no guess limit. Find the exact country or capital to win, then start a
                  fresh adventure. In Flags, name the country whose flag you see. Or use “Give up
                  and reveal answer” below the guesses to end a round and see its answer. Giving up
                  keeps your guesses and is not a win. Your rounds save in this browser.
                </p>
              </div>
            </li>
          </ol>
          <div className="help-note">
            <strong>A note on the world</strong>
            <p>
              We play with 193 UN member states, Palestine, and Vatican City. Territories and other
              disputed states are outside this version’s answer list. Borders are simplified; small
              guessed countries get a marker. Centers and city coordinates are approximate, and
              distances are not border-to-border. Capitals use one selected city per country: for
              example Pretoria for South Africa and Sucre for Bolivia. Nauru uses Yaren, its
              government district; Palestine uses Ramallah as its administrative seat. Other
              co-capitals are not separate guesses. See the README for the full data choices and
              limitations.
            </p>
            <p>
              Flags use bundled images so they display consistently across devices. Similar flags
              can be hard to distinguish; continent and distance clues can help. Continent hints
              follow the country data’s geographic grouping, splitting the Americas into North and
              South America. Central America and the Caribbean count as North America;
              transcontinental countries use one group, such as Europe for Russia and Asia for
              Türkiye.
            </p>
            <p>
              The answer stays unmarked until guessed correctly or revealed by giving up. As a
              browser-only game, it can be found by inspecting saved data.
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
              <a href={`${import.meta.env.BASE_URL}data/countries.json`}>download adapted data</a>.{' '}
              Flags:{' '}
              <a href="https://flagicons.lipis.dev/" target="_blank" rel="noreferrer">
                flag-icons
              </a>{' '}
              (<a href={`${import.meta.env.BASE_URL}flags/LICENSE.txt`}>MIT</a>).
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
            Starting over will replace this round with a new mystery {item}. Your other modes'
            rounds will be kept.
          </p>
          <button className="primary" onClick={restart}>
            Start a fresh round <ArrowRight size={17} />
          </button>
          <button className="secondary" onClick={() => setDialog(null)}>
            Keep exploring this round
          </button>
        </Dialog>
      )}
      {dialog === 'result' && (
        <Dialog
          title={won ? `You found the mystery ${item}` : 'Answer revealed'}
          onClose={() => {
            setDialog(null)
            setCelebration(null)
          }}
          className="win-dialog"
        >
          {won && celebration && (
            <VictoryCelebration effect={celebration} onComplete={finishCelebration} />
          )}
          <span className="victory-symbol">
            {won ? <Trophy size={32} strokeWidth={1.5} /> : <Globe2 size={32} strokeWidth={1.5} />}
          </span>
          <p className="eyebrow">{won ? 'Oh, there you are' : 'A little discovery'}</p>
          <h2>
            {won ? 'You found your' : 'Here’s your'}
            <br />
            <em>somewhere.</em>
          </h2>
          <span className="victory-country">
            <FlagImage country={answerCountry} className="victory-flag" />
            {answerLocation.name}
          </span>
          {mode === 'capitals' && <p className="answer-country">{answerCountry.name}</p>}
          <p className="dialog-description">
            {won ? 'One mystery.' : 'Answer revealed after'} {guesses.length}{' '}
            {guesses.length === 1 ? 'brilliant guess' : 'curious guesses'}.<br />A whole world well
            explored.{!won && ' This round is complete. Try a fresh one whenever you’re ready.'}
          </p>
          {mode === 'flags' && round.hintUsed && (
            <p className="answer-country">Continent hint used</p>
          )}
          <button className="primary" onClick={restart}>
            Let’s go somewhere new <ArrowRight size={17} />
          </button>
          <button className="secondary" onClick={share}>
            {copied ? <Check size={16} /> : <Heart size={16} />}
            {copied ? 'Result copied' : won ? 'Copy your discovery' : 'Copy your result'}
          </button>
        </Dialog>
      )}
    </div>
  )
}
