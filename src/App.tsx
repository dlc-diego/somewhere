import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { ArrowRight, Check, Compass, Globe2, Heart, Sparkles, UserRound } from 'lucide-react'
import ExperienceSwitcher from './components/ExperienceSwitcher'
import ExperienceTransition from './components/ExperienceTransition'
import { useExperience, type Experience } from './lib/useExperience'
import ModeSelector from './components/ModeSelector'
import { JourneyChallenge, JourneyHistory } from './components/BorderJourney'
import { shortestBorderRoute } from './lib/journey'
import GuessSearch from './components/GuessSearch'
import ValHeart from './components/ValHeart'
import VisualChallenge from './components/VisualChallenge'
import GuessHistory from './components/GuessHistory'
import Dialog from './components/Dialog'
import VictoryCelebration from './components/VictoryCelebration'
import {
  createCelebrationPicker,
  type CelebrationEffect,
  type CelebrationRequest,
} from './lib/celebrations'
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
import { JOURNEY_CROSSINGS } from './lib/journey'
import { prefersReducedMotion } from './lib/motion'
import { useTheme } from './lib/useTheme'
import { usePlayer } from './lib/PlayerProvider'
import { trackRound } from './lib/playerData'
import AccountNav from './components/AccountNav'

const Globe = lazy(() => import('./components/Globe'))
const Something = lazy(() => import('./components/Something'))
const Someone = lazy(() => import('./components/Someone'))
const Somehow = lazy(() => import('./components/Somehow'))
type DialogType = 'help' | null
type QueuedCelebration = { sequence: number; effect: CelebrationEffect; intensity?: number }

export default function App() {
  const { theme, toggleTheme } = useTheme()
  const { recordGame, setCelebrating, data: playerData } = usePlayer()
  const { experience, transition, switchExperience } = useExperience()
  const [hasVisitedSomewhere, setHasVisitedSomewhere] = useState(experience === 'somewhere')
  const [hasVisitedSomething, setHasVisitedSomething] = useState(experience === 'something')
  const [hasVisitedSomeone, setHasVisitedSomeone] = useState(experience === 'someone')
  const [hasVisitedSomehow, setHasVisitedSomehow] = useState(experience === 'somehow')
  useEffect(() => {
    if (experience === 'somewhere') setHasVisitedSomewhere(true)
    else if (experience === 'something') setHasVisitedSomething(true)
    else if (experience === 'someone') setHasVisitedSomeone(true)
    else if (experience === 'somehow') setHasVisitedSomehow(true)
  }, [experience])
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
  const [pickCelebration] = useState(() => createCelebrationPicker())
  const [celebrations, setCelebrations] = useState<QueuedCelebration[]>([])
  const celebration = celebrations[0]
  useEffect(() => setCelebrating(celebrations.length > 0), [celebrations.length, setCelebrating])
  const finishCelebration = useCallback(() => setCelebrations((queue) => queue.slice(1)), [])
  const focusSequence = useRef(0)
  const celebrationSequence = useRef(0)
  const lastScrollFocus = useRef(0)
  const globePanel = useRef<HTMLElement>(null)
  const roundsCache = useRef(new Map<GameMode, Round>([[initial.round.mode, initial.round]]))
  const guesses = guessDetails(round)
  const won = hasWon(round)
  const ended = hasEnded(round)
  const mode = round.mode
  const isJourney = mode === 'journey'
  const item =
    mode === 'flags'
      ? 'flag'
      : mode === 'shapes'
        ? 'shape'
        : mode === 'capitals'
          ? 'capital'
          : 'country'
  const answerCountry = countryById.get(round.answer)!
  const answerLocation = locationFor(answerCountry, mode)

  const celebrate = useCallback(
    (requests: CelebrationRequest[]) => {
      if (!requests.length || prefersReducedMotion()) return
      const additions = requests.map((request) => ({
        sequence: ++celebrationSequence.current,
        effect: request.effect === 'normal' ? pickCelebration() : request.effect,
        intensity: request.intensity,
      }))
      setCelebrations((queue) => [...queue, ...additions])
    },
    [pickCelebration],
  )

  useEffect(() => {
    try {
      localStorage.setItem(storageKeyFor(round.mode), JSON.stringify(round))
      localStorage.setItem(MODE_KEY, round.mode)
    } catch {
      setWarning('Browser storage is unavailable. This round may not survive a refresh.')
    }
  }, [round])

  useEffect(() => {
    // Scroll once per new focus request. Returning to this view must not replay it.
    if (!focus || lastScrollFocus.current === focus.sequence) return
    lastScrollFocus.current = focus.sequence
    if (experience !== 'somewhere' || !window.matchMedia('(max-width: 820px)').matches) return
    // Let the mobile keyboard close before centering the globe in the viewport.
    if (document.activeElement instanceof HTMLInputElement) document.activeElement.blur()
    const timer = window.setTimeout(() => {
      globePanel.current?.querySelector('.globe-viewport')?.scrollIntoView({
        block: 'center',
        behavior: prefersReducedMotion() ? 'instant' : 'smooth',
      })
    }, 120)
    return () => window.clearTimeout(timer)
  }, [focus, experience])

  const focusCountry = useCallback((country: Country, location: Location = country) => {
    const sequence = ++focusSequence.current
    setFocus({ countryId: country.id, location, sequence })
    return sequence
  }, [])
  useEffect(() => {
    if (mode === 'journey' && round.start) {
      const current = countryById.get(round.guesses.at(-1) || round.start)!
      focusCountry(current, locationFor(current, mode))
    }
  }, [mode, round.start, round.answer, focusCountry])

  function changeExperience(next: Experience) {
    setDialog(null)
    switchExperience(next)
    window.scrollTo({ top: 0, behavior: 'instant' })
    setAnnouncement(
      next === 'something'
        ? 'Something. General Trivia and What am I.'
        : next === 'someone'
          ? 'Someone. Who am I and Identify Me.'
          : next === 'somehow'
            ? 'Somehow. A little adventure awaits.'
            : 'Welcome back to Somewhere. Your journey is saved.',
    )
  }

  function submit(country: Country) {
    const result = addGuess(round, country.id)
    if (result.error) return result.error
    const tracked = trackRound(result.round)
    setRound(tracked)
    recordGame(tracked.trackingId, mode, {
      outcome: hasWon(tracked) ? 'won' : 'active',
      guesses: tracked.guesses.length,
      ...(mode === 'flags' || mode === 'shapes' ? { hintUsed: !!tracked.hintUsed } : {}),
      ...(mode === 'journey'
        ? { shortestCrossings: shortestBorderRoute(tracked.start!, tracked.answer)!.length - 1 }
        : {}),
    })
    const latest = guessDetails(result.round).at(-1)!
    focusCountry(country, latest.location)
    if (hasWon(result.round)) celebrate([{ effect: 'normal' }])
    setAnnouncement(
      isJourney
        ? `${country.name}. Border crossed. ${result.round.guesses.length} crossings.${hasWon(result.round) ? ' Destination reached!' : ''}`
        : `${latest.location.name}: ${formatDistance(latest.distance)} kilometers. ${temperatures[latest.temperature].label}. ${result.round.guesses.length} guesses.`,
    )
  }
  function restart() {
    setRound(newRound(round.answer, mode))
    setFocus(null)
    setDialog(null)
    setCopied(false)
    setAnnouncement(
      isJourney
        ? 'A fresh border journey is ready. Good luck!'
        : `A fresh mystery ${item} is ready. Good luck!`,
    )
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
    setAnnouncement(`Now guessing ${nextMode}. Each mode keeps its own round.`)
  }
  function giveUp() {
    if (ended) return
    const tracked = trackRound(revealAnswer(round))
    setRound(tracked)
    recordGame(tracked.trackingId, mode, {
      outcome: 'revealed',
      guesses: tracked.guesses.length,
      ...(mode === 'flags' || mode === 'shapes' ? { hintUsed: !!tracked.hintUsed } : {}),
      ...(mode === 'journey'
        ? { shortestCrossings: shortestBorderRoute(tracked.start!, tracked.answer)!.length - 1 }
        : {}),
    })
    focusCountry(answerCountry, answerLocation)
    setAnnouncement(
      `Answer revealed: ${answerLocation.name}${mode === 'capitals' ? `, ${answerCountry.name}` : ''}. Round complete.`,
    )
  }
  function showContinentHint() {
    const next = revealContinentHint(round)
    setRound(next)
    if (
      next.trackingId &&
      playerData.games[next.trackingId] &&
      (mode === 'flags' || mode === 'shapes')
    )
      recordGame(next.trackingId, mode, {
        outcome: 'active',
        guesses: next.guesses.length,
        hintUsed: !!next.hintUsed,
      })
    setAnnouncement(`Continent hint: ${answerCountry.continent}. Keep guessing!`)
  }
  async function share() {
    const text = isJourney
      ? `I ${won ? 'completed' : 'explored'} a Border Journey from ${countryById.get(round.start!)!.name} to ${answerCountry.name} in ${round.guesses.length} crossings on Somewhere! 🌍\n${window.location.href.split('#')[0]}`
      : `${won ? 'I found' : 'I revealed'} ${answerLocation.name} (${mode}) ${won ? 'in' : 'after'} ${guesses.length} ${guesses.length === 1 ? 'guess' : 'guesses'} on Somewhere! 🌍\n${window.location.href.split('#')[0]}`
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      setAnnouncement('Copying is unavailable in this browser. You can share the page URL instead.')
    }
  }

  return (
    <div className="app-shell" data-experience={experience} data-switch-phase={transition?.phase}>
      <a
        href={
          experience === 'somewhere'
            ? '#country-search'
            : experience === 'something'
              ? '#something-games'
              : experience === 'someone'
                ? '#someone-content'
                : '#somehow-content'
        }
        className="skip-link"
      >
        {experience === 'somewhere' ? 'Skip to guessing' : 'Skip to content'}
      </a>
      <header className="site-header">
        <ExperienceSwitcher experience={experience} onChange={changeExperience} />
        <span className="brand-tagline">
          {experience === 'somewhere'
            ? 'A little world of discovery'
            : experience === 'something'
              ? 'A little more to discover'
              : experience === 'someone'
                ? 'Every person has a story'
                : 'A little adventure awaits'}
        </span>
        <AccountNav theme={theme} toggleTheme={toggleTheme} celebrating={celebrations.length > 0} />
      </header>

      <main>
        <section className="intro" aria-labelledby="page-title">
          <h1 id="page-title">
            Built for Val <ValHeart />
          </h1>
        </section>
        <div className="experience-view" hidden={experience !== 'somewhere'}>
          {(hasVisitedSomewhere || experience === 'somewhere') && (
            <>
              <div className="game-toolbar">
                <ModeSelector mode={mode} onChange={changeMode} />
              </div>
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
                    isJourney
                      ? 'Border Journey search'
                      : mode === 'shapes'
                        ? 'Shape search'
                        : mode === 'flags'
                          ? 'Flag search'
                          : mode === 'capitals'
                            ? 'Capital search'
                            : 'Country search'
                  }
                >
                  {isJourney && <JourneyChallenge round={round} />}
                  {(mode === 'flags' || mode === 'shapes') && (
                    <VisualChallenge
                      mode={mode}
                      key={`clue:${mode}:${round.answer}`}
                      country={answerCountry}
                      hintUsed={Boolean(round.hintUsed)}
                      ended={ended}
                      onHint={showContinentHint}
                    />
                  )}
                  {ended && !isJourney && (
                    <>
                      <h2>
                        {won
                          ? 'You found your somewhere.'
                          : `The answer was ${answerLocation.name}.`}
                      </h2>
                      <p className="card-description">
                        {answerLocation.name}
                        {mode === 'capitals' ? `, ${answerCountry.name},` : ''}{' '}
                        {mode === 'flags'
                          ? 'was the country behind the flag.'
                          : mode === 'shapes'
                            ? 'was the country behind the shape.'
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
                      <button className="text-button" onClick={share}>
                        {copied ? <Check size={15} /> : <Heart size={15} />}
                        {copied
                          ? 'Result copied'
                          : won
                            ? 'Copy your discovery'
                            : 'Copy your result'}
                      </button>
                    </div>
                  ) : (
                    <GuessSearch
                      mode={mode}
                      key={`${mode}:${round.answer}`}
                      onGuess={submit}
                      guessed={isJourney ? [] : round.guesses}
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
                      journey={
                        isJourney
                          ? {
                              start: round.start!,
                              destination: round.answer,
                              route: [round.start!, ...round.guesses],
                              remaining: round.revealed
                                ? shortestBorderRoute(
                                    round.guesses.at(-1) || round.start!,
                                    round.answer,
                                  )!
                                : [],
                            }
                          : null
                      }
                      answerReveal={
                        round.revealed ? { country: answerCountry, location: answerLocation } : null
                      }
                    />
                  </Suspense>
                  {!isJourney && (
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
                  )}
                  {isJourney && (
                    <div className="journey-legend" aria-label="Journey color key">
                      <span>
                        <i className="route-visited" />
                        Visited
                      </span>
                      <span>
                        <i className="route-current" />
                        Current stop
                      </span>
                      <span>
                        <i className="route-destination" />
                        Destination
                      </span>
                      <span>
                        <i className="route-arrived" />
                        Arrived / revealed
                      </span>
                    </div>
                  )}
                </section>

                <div className="history-column">
                  {isJourney ? (
                    <JourneyHistory
                      round={round}
                      onFocus={(country) => focusCountry(country, locationFor(country, mode))}
                    />
                  ) : (
                    <GuessHistory guesses={guesses} mode={mode} onFocus={focusCountry} />
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
            </>
          )}
        </div>
        <div className="experience-view" hidden={experience !== 'something'}>
          {(hasVisitedSomething || experience === 'something') && (
            <Suspense
              fallback={
                <div className="something-loading" role="status">
                  Getting your questions ready…
                </div>
              }
            >
              <Something onCelebrate={celebrate} />
            </Suspense>
          )}
        </div>
        <div className="experience-view" hidden={experience !== 'someone'}>
          {(hasVisitedSomeone || experience === 'someone') && (
            <Suspense
              fallback={
                <p className="something-loading" role="status">
                  Getting your clues ready…
                </p>
              }
            >
              <Someone onCelebrate={celebrate} />
            </Suspense>
          )}
        </div>
        <div className="experience-view" hidden={experience !== 'somehow'}>
          {(hasVisitedSomehow || experience === 'somehow') && (
            <Suspense
              fallback={
                <p className="something-loading" role="status">
                  Preparing Somehow…
                </p>
              }
            >
              <Somehow onCelebrate={celebrate} />
            </Suspense>
          )}
        </div>
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

      {dialog === 'help' && experience === 'somewhere' && (
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
                <strong>Choose your game</strong>
                <p>
                  Use the game dropdown to guess a country, a capital city, or the country behind a
                  flag or silhouette. In Flags and Shapes, “Hint: reveal continent” gives a clue
                  without ending your round or using a guess. Search a name or alias, select a
                  suggestion, then make your guess. Each mode keeps its own saved round. In Border
                  Journey, travel from the starting country to the displayed destination by choosing
                  countries that share a continuous mainland border with your current stop. Routes
                  stay within connected Africa–Eurasia; overseas territories and disconnected parts
                  cannot link routes. Click the destination above your journey list to find it on
                  the globe without making a crossing. Invalid crossings do not count. You can
                  revisit countries to retrace your steps; the route stays in travel order. Reach
                  the destination to win. Giving up reveals one shortest route from your last stop.
                  New routes start at least {JOURNEY_CROSSINGS.min} crossings apart, with no upper
                  difficulty limit; the destination is visible from the start. The globe is for
                  exploring; tapping it never selects a guess. Pinch to zoom up to 32×. With the
                  globe focused, keyboard users can use +/− to zoom and Home to reset the view. Each
                  guess or reveal automatically zooms to suit the country’s size.
                </p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>Follow the warmth</strong>
                <p>
                  Border Journey tracks valid crossings rather than heat or distance. In the mystery
                  modes, country, flag and shape rounds measure center-to-center distance; capital
                  rounds measure city-to-city distance. Cold is 7,000+ km; cool is 3,000–7,000; warm
                  is 1,000–3,000; hot is under 1,000. Countries sharing a land border are marked
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
                  fresh adventure. In Flags or Shapes, name the country behind the clue. Or use
                  “Give up and reveal answer” below the guesses to end a round and see its answer.
                  Giving up keeps your guesses and is not a win. Your rounds save in this browser.
                </p>
              </div>
            </li>
          </ol>
          <div className="help-note">
            <strong>A note on the world</strong>
            <p>
              We play with 193 UN member states, Palestine, and Vatican City. Territories and other
              disputed states are outside this version’s answer list. Border Journey uses the
              country data’s land borders with a reviewed mainland-only filter. Overseas links
              (including Canada–Denmark, France–Brazil and Spain–Morocco), detached exclaves and
              island-hopping are excluded. Each country represents one main connected land area;
              islands without a playable mainland route are not selected. Borders are simplified;
              small guessed countries get a marker. Centers and city coordinates are approximate,
              and distances are not border-to-border. Capitals use one selected city per country:
              for example Pretoria for South Africa and Sucre for Bolivia. Nauru uses Yaren, its
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
              Shape clues show a north-up outline, scaled to fit. Islands and disconnected regions
              stay together; tiny islands can be hard to recognize. Generalized outlines may differ
              from the globe’s boundaries.
            </p>
            <p>
              Mystery answers stay unmarked until guessed correctly or revealed by giving up. Border
              Journey shows its starting country and destination from the beginning. As a
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
              Shapes: <a href={`${import.meta.env.BASE_URL}shapes/README.txt`}>outline sources</a> (
              <a href={`${import.meta.env.BASE_URL}shapes/ODbL.txt`}>ODbL</a>);{' '}
              <a href={`${import.meta.env.BASE_URL}shapes/outlines.json`}>
                download adapted outlines
              </a>
              . Flags:{' '}
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
      {dialog === 'help' && experience === 'something' && (
        <Dialog title="How to play Something" onClose={() => setDialog(null)}>
          <span className="dialog-emblem">
            <Sparkles size={30} />
          </span>
          <p className="eyebrow">A little guide</p>
          <h2>A little of everything.</h2>
          <ol className="help-steps">
            <li>
              <span>01</span>
              <div>
                <strong>General Trivia</strong>
                <p>
                  New rounds cover ten categories, with one question from each and no timer. Choose
                  Standard mix or Harder questions; a change before your first answer starts a new
                  selection, while a change during play applies to your next round. Question tags
                  describe editorial difficulty. Each category gets a fresh shuffled cycle after its
                  questions are used. Choose once from four choices, read the explanation, then
                  continue. Review any answer in Your round. Your score, question order and progress
                  save in this browser.
                </p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>Get On Fire</strong>
                <p>
                  Every correct answer gets one of our familiar celebrations. Three consecutive
                  correct answers turn your streak On Fire: each continued correct answer gets more,
                  larger, faster fire emojis, up to a mobile-friendly limit. A wrong answer resets
                  the count to zero and the next correct answer uses the normal celebrations. New
                  rounds start a fresh streak. Ten correct answers also queue a special golden
                  trophy and starburst celebration. Effects finish in order, even if you switch
                  games, switch experiences or start another round. Reduced-motion preferences keep
                  the result still.
                </p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>What am I</strong>
                <p>
                  Identify an animal, object, structure or natural phenomenon from up to five clues.
                  Reveal another clue whenever you like without using a guess. Type your answer;
                  common aliases, capitalization and punctuation are accepted. Likely spelling slips
                  get a chance to be corrected without using a guess. Wrong answers and repeated
                  guesses never end a mystery. Give up and reveal answer shows the solution and all
                  clues without counting as a win. After solving or revealing, try another mystery.
                  Each game keeps its own saved round.
                </p>
              </div>
            </li>
          </ol>
          <p className="help-note">
            Your progress is saved in this browser. New rounds prioritize questions and mysteries
            you haven’t played yet.
          </p>
          <button className="primary" onClick={() => setDialog(null)}>
            Let’s play <ArrowRight size={17} />
          </button>
        </Dialog>
      )}
      {dialog === 'help' && experience === 'someone' && (
        <Dialog title="How to play Someone" onClose={() => setDialog(null)}>
          <span className="dialog-emblem">
            <UserRound size={30} />
          </span>
          <p className="eyebrow">A familiar face</p>
          <h2>Who is behind the clues?</h2>
          <ol className="help-steps">
            <li>
              <span>01</span>
              <div>
                <strong>Who am I</strong>
                <p>
                  Guess a well-known person from up to five clues. The first clue is broad; later
                  clues reveal more. Reveal another clue whenever you like without using a guess.
                </p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>Follow your hunch</strong>
                <p>
                  Type a name and make a guess. Common names, listed nicknames, accents and
                  punctuation are accepted. Wrong guesses do not end the round; repeated answers do
                  not count twice. Likely spelling slips can be corrected without using a guess;
                  short or ambiguous names still need a listed answer. Correct guesses use the
                  familiar winning animations.
                </p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>Identify Me</strong>
                <p>
                  Switch to Identify Me to name a person from a photograph or portrait. Reveal a
                  clue for free if you need one. Creator and license credits stay available beside
                  every picture; image credit titles and source pages may name the person.
                </p>
              </div>
            </li>
          </ol>
          <p className="help-note">
            Give up and reveal answer shows the person without counting as a win. Each mode keeps
            its own saved round and prioritizes people you have not met yet. Who am I contains an
            80-person collection spanning science, music, screen, sport, art, history, exploration
            and changemakers.
          </p>
          <button className="primary" onClick={() => setDialog(null)}>
            Let’s play <ArrowRight size={17} />
          </button>
        </Dialog>
      )}
      {dialog === 'help' && experience === 'somehow' && (
        <Dialog title="How to play Somehow" onClose={() => setDialog(null)}>
          <span className="dialog-emblem">
            <Compass size={30} />
          </span>
          <p className="eyebrow">A little adventure</p>
          <h2>Find your way to the final gate.</h2>
          <p>
            Choose a highlighted stop on the branching route. Complete thirteen stops and defeat the
            final boss before your hearts run out. Rest stops restore one heart; shops trade coins
            for supplies.
          </p>
          <ol className="help-steps">
            <li>
              <span>01</span>
              <div>
                <strong>Play familiar challenges</strong>
                <p>
                  Normal trivia needs all three correct answers. Geography, What am I, Who am I and
                  Identify Me use a guess budget; a failed challenge costs one heart. Invalid or
                  duplicate guesses do not count. Border Journey uses continuous land borders only.
                  What am I and Who am I offer up to three free clues; a Trail compass reveals
                  another clue and the first letter. Identify Me offers one optional text clue.
                </p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>Pack a little possibility</strong>
                <p>
                  Use the item buttons in a trial or open your Satchel for healing, heart
                  containers, a shield, 50/50, clues, extra guesses, a fresh question, or a Lucky
                  star that clears a non-boss challenge. A Phoenix feather automatically revives you
                  with one heart. Invalid item uses never consume an item.
                </p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>Face the final boss</strong>
                <p>
                  Elite trials need three correct answers in a row; the final boss needs four. Each
                  wrong answer resets the streak and costs a heart. A shield blocks one loss. Reach
                  the final streak to win the run and celebrate. Lucky stars cannot be used on the
                  boss.
                </p>
              </div>
            </li>
          </ol>
          <p className="help-note">
            Start with two hearts, 8 coins and one Trail compass. Geography allows five guesses,
            mystery modes allow three, and Border Journey allows one spare crossing beyond the
            shortest route. Normal wins earn 4 coins; elites earn 7 and the boss earns 12. There is
            one guaranteed rest stop, halfway through the run. Lucky stars are found only in
            discoveries or as a rare reward after a challenge win earned without a star. Progress
            saves in this browser separately from your other games. New run, beside the Satchel,
            asks for confirmation before replacing your adventure.
          </p>
          <button className="primary" onClick={() => setDialog(null)}>
            Let’s explore <ArrowRight size={17} />
          </button>
        </Dialog>
      )}
      {transition && <ExperienceTransition key={transition.sequence} />}
      {celebration && (
        <VictoryCelebration
          key={celebration.sequence}
          effect={celebration.effect}
          intensity={celebration.intensity}
          onComplete={finishCelebration}
        />
      )}
    </div>
  )
}
