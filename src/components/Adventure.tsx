import { usePlayer } from '../lib/PlayerProvider'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  Backpack,
  Brain,
  Check,
  ChevronDown,
  Coins,
  Compass,
  Crown,
  Flag,
  Gift,
  Globe2,
  Heart,
  MapPin,
  Route,
  Scan,
  Shield,
  ShoppingBag,
  TentTree,
  Zap,
  CircleHelp,
  UserRound,
  Image as ImageIcon,
  RotateCcw,
  Lightbulb,
} from 'lucide-react'
import {
  ADVENTURE_KEY,
  ADVENTURE_STOPS,
  ADVENTURE_BALANCE,
  adventureMysteryGame,
  adventureClueLimit,
  ITEMS,
  ITEM_IDS,
  SHOP_ITEM_IDS,
  NODE_LABELS,
  abandonEncounter,
  answerAdventureTrivia,
  availableNodes,
  buyItem,
  chooseNode,
  connected,
  guessAdventureCountry,
  guessAdventureMystery,
  isCombat,
  isTrivia,
  itemUnavailable,
  leaveShop,
  loadAdventure,
  newAdventure,
  nextAdventureQuestion,
  resolveEvent,
  resolveRest,
  returnToRoute,
  revealAdventureClue,
  triviaChoices,
  trialItems,
  useItem,
  type AdventureNode,
  type AdventureResult,
  type AdventureRun,
  type ItemId,
} from '../lib/adventure'
import { countryById, locationFor, type Country, type Location } from '../lib/countries'
import { guessDetails, hasWon } from '../lib/game'
import { questionById } from '../lib/something'
import { shortestBorderRoute } from '../lib/journey'
import { prefersReducedMotion } from '../lib/motion'
import type { CelebrationRequest } from '../lib/celebrations'
import GuessSearch from './GuessSearch'
import GuessHistory from './GuessHistory'
import { JourneyChallenge, JourneyHistory } from './BorderJourney'
import VisualChallenge from './VisualChallenge'
import Dialog from './Dialog'

const Globe = lazy(() => import('./Globe'))
const AdventurePortrait = lazy(() => import('./AdventurePortrait'))
const nodeIcons = {
  trivia: Brain,
  mystery: CircleHelp,
  who: UserRound,
  identify: ImageIcon,
  countries: Globe2,
  capitals: MapPin,
  flags: Flag,
  shapes: Scan,
  journey: Route,
  elite: Zap,
  boss: Crown,
  rest: TentTree,
  shop: ShoppingBag,
  event: Gift,
}

export default function Adventure({
  onCelebrate,
}: {
  onCelebrate: (events: CelebrationRequest[]) => void
}) {
  const { recordGame } = usePlayer()
  const [initial] = useState(loadAdventure)
  const [run, setRun] = useState(initial.run)
  const current = useRef(run)
  const [warning, setWarning] = useState(initial.warning || '')
  const [error, setError] = useState('')
  const [satchel, setSatchel] = useState(false)
  const [confirmRestart, setConfirmRestart] = useState(false)
  const [query, setQuery] = useState('')
  const [focus, setFocus] = useState<{
    countryId: string
    location: Location
    sequence: number
  } | null>(null)
  const focusSequence = useRef(0)
  const encounterPanel = useRef<HTMLDivElement>(null)
  const mapPanel = useRef<HTMLDivElement>(null)
  const globePanel = useRef<HTMLDivElement>(null)
  const ownedItems = ITEM_IDS.filter((id) => run.inventory[id] > 0)
  const scene = run.encounter

  useEffect(() => {
    try {
      localStorage.setItem(ADVENTURE_KEY, JSON.stringify(run))
    } catch {
      setWarning('Browser storage is unavailable. This adventure may not survive a refresh.')
    }
  }, [run])
  useEffect(() => {
    setQuery('')
    setError('')
    setFocus(null)
    const geo = scene?.geography
    if (geo?.mode === 'journey')
      focusCountry(
        countryById.get(geo.guesses.at(-1) || geo.start!)!,
        locationFor(countryById.get(geo.guesses.at(-1) || geo.start!)!, 'journey'),
      )
  }, [scene?.nodeId])

  function focusCountry(country: Country, location: Location = country) {
    setFocus({ countryId: country.id, location, sequence: ++focusSequence.current })
  }
  function scrollTo(panel: 'encounter' | 'map' | 'globe') {
    window.setTimeout(() => {
      const element =
        panel === 'encounter'
          ? encounterPanel.current
          : panel === 'map'
            ? mapPanel.current
            : globePanel.current?.querySelector('.globe-viewport')
      if (element?.closest('[hidden]')) return
      element?.scrollIntoView({
        block: panel === 'globe' ? 'center' : 'start',
        behavior: prefersReducedMotion() ? 'instant' : 'smooth',
      })
    }, 120)
  }
  function apply(result: AdventureResult) {
    if (result.error) {
      setError(result.error)
      return result.error
    }
    const before = current.current
    const next = result.run
    if (next.path.length)
      recordGame(next.id, 'adventure', {
        outcome: next.status === 'won' ? 'won' : next.status === 'lost' ? 'lost' : 'active',
        stage: next.path.length,
      })
    if (
      before.encounter?.result === 'active' &&
      next.encounter?.result === 'cleared' &&
      isCombat(next.encounter.kind)
    ) {
      onCelebrate(
        next.encounter.kind === 'boss'
          ? [{ effect: 'fire-streak', intensity: 3 }, { effect: 'perfect-round' }]
          : [{ effect: 'normal' }],
      )
    }
    if (
      before.encounter?.result === 'active' &&
      next.encounter &&
      next.encounter.result !== 'active' &&
      next.encounter.geography
    ) {
      const geo = next.encounter.geography
      focusCountry(
        countryById.get(geo.answer)!,
        locationFor(countryById.get(geo.answer)!, geo.mode),
      )
    }
    current.current = next
    setRun(next)
    setError('')
    return undefined
  }
  function selectNode(node: AdventureNode) {
    if (!apply(chooseNode(current.current, node.id))) scrollTo('encounter')
  }
  function backToMap() {
    if (!apply(returnToRoute(current.current))) scrollTo('map')
  }
  function restart() {
    if (current.current.status === 'playing' && current.current.path.length)
      recordGame(current.current.id, 'adventure', {
        outcome: 'abandoned',
        stage: current.current.path.length,
      })
    const next = newAdventure()
    current.current = next
    setRun(next)
    setError('')
    setFocus(null)
    setQuery('')
    setSatchel(false)
    setConfirmRestart(false)
    scrollTo('map')
  }
  function consume(item: ItemId) {
    if (!apply(useItem(current.current, item))) setSatchel(false)
  }
  function guessCountry(country: Country) {
    const result = guessAdventureCountry(current.current, country.id)
    const failure = apply(result)
    if (!failure) {
      if (result.run.encounter?.result === 'active')
        focusCountry(country, locationFor(country, result.run.encounter.geography!.mode))
      if (matchMedia('(max-width:820px)').matches) scrollTo('globe')
    }
    return failure
  }
  const Icon = scene ? nodeIcons[scene.kind] : Compass
  const ended = scene?.result !== 'active'
  const terminal = run.status !== 'playing'
  const geo = scene?.geography
  const mystery = scene?.mystery
    ? adventureMysteryGame(scene.kind).byId.get(scene.mystery.id)!
    : null
  const trial = scene?.trivia
  const question = trial ? questionById.get(trial.id)! : null
  const answerCountry = geo ? countryById.get(geo.answer)! : null
  const guesses = geo ? guessDetails(geo) : []
  const hint = scene?.hintUsed
    ? geo
      ? geo.mode === 'journey'
        ? `Next connected stop: ${countryById.get(shortestBorderRoute(geo.guesses.at(-1) || geo.start!, geo.answer)![1] || geo.answer)!.name}`
        : geo.mode === 'flags' || geo.mode === 'shapes'
          ? null
          : `Continent: ${answerCountry!.continent}`
      : mystery
        ? `The answer starts with “${mystery.answer[0]}”.`
        : null
    : null

  return (
    <section className="somex-adventure" aria-labelledby="somex-title">
      <div className="somex-heading">
        <div>
          <p className="somex-badge">A journey through what you know</p>
          <h2 id="somex-title">A little adventure.</h2>
          <p>Thirteen stops. One final gate. Keep your heart in it.</p>
        </div>
        <div className="somex-heading-actions">
          <button
            className="secondary somex-satchel-button"
            onClick={() => setConfirmRestart(true)}
          >
            <RotateCcw size={17} /> New run
          </button>
          <button className="secondary somex-satchel-button" onClick={() => setSatchel(true)}>
            <Backpack size={18} /> Satchel{' '}
            <span>{ITEM_IDS.reduce((sum, id) => sum + run.inventory[id], 0)}</span>
          </button>
        </div>
      </div>
      <div className="somex-hud">
        <div
          className="somex-hearts"
          role="status"
          aria-label={`${run.hearts} of ${run.maxHearts} hearts`}
        >
          {Array.from({ length: run.maxHearts }, (_, index) => (
            <Heart
              key={index}
              size={23}
              fill={index < run.hearts ? 'currentColor' : 'none'}
              className={index < run.hearts ? '' : 'empty-heart'}
              aria-hidden="true"
            />
          ))}
          <span>
            {run.hearts}/{run.maxHearts}
          </span>
        </div>
        <span>
          <Coins size={18} aria-hidden="true" />
          {run.coins} coins
        </span>
        <span>
          {Object.keys(run.outcomes).length}/{ADVENTURE_STOPS} stops
        </span>
        {run.shield && (
          <span className="somex-shield">
            <Shield size={17} /> Shield armed
          </span>
        )}
      </div>
      {warning && (
        <p className="storage-warning" role="status">
          {warning}
        </p>
      )}
      {run.message && (
        <p className="somex-notice" role="status">
          {run.message}
        </p>
      )}
      {error && (
        <p className="input-error" role="alert">
          {error}
        </p>
      )}
      {terminal && (
        <div className={`somex-ending ${run.status === 'won' ? 'victorious' : ''}`}>
          <Crown size={32} aria-hidden="true" />
          <h3>
            {run.status === 'won'
              ? 'The long way led you home.'
              : 'Every ending is another beginning.'}
          </h3>
          <p>
            {run.status === 'won'
              ? 'Final boss defeated. Adventure complete.'
              : 'This run is over. Your next route will be different.'}
          </p>
          <button className="primary" onClick={() => setConfirmRestart(true)}>
            Start a new adventure <ArrowRight size={17} />
          </button>
        </div>
      )}
      {scene ? (
        <div ref={encounterPanel} className="somex-stop" tabIndex={-1}>
          <div className="somex-stop-heading">
            <span className="somex-stop-icon">
              <Icon size={23} />
            </span>
            <div>
              <p className="eyebrow">
                Stop {run.path.length} of {ADVENTURE_STOPS}
              </p>
              <h3>{NODE_LABELS[scene.kind]}</h3>
            </div>
            <span className={`somex-result ${scene.result}`}>
              {scene.result === 'active'
                ? 'In progress'
                : scene.result === 'cleared'
                  ? 'Cleared'
                  : 'Not this time'}
            </span>
          </div>
          {!ended && !terminal && isCombat(scene.kind) && <TrialItems run={run} onUse={consume} />}
          {isTrivia(scene.kind) && trial && question && (
            <>
              <p className="somex-rules">
                {scene.kind === 'trivia'
                  ? `Get ${scene.goal} of 3 questions right. A failed trial costs one heart.`
                  : `Get ${scene.goal} right in a row. Each wrong answer costs one heart and resets your streak.`}
              </p>
              <div className="somex-trial-progress">
                {scene.kind === 'trivia' ? (
                  <span>
                    {trial.score} correct · {trial.answered}/3 answered
                  </span>
                ) : (
                  <span className={trial.streak ? 'somex-on-fire' : ''}>
                    {'🔥'.repeat(trial.streak)} {trial.streak}/{scene.goal} in a row
                  </span>
                )}
              </div>
              <p className="eyebrow">{question.category}</p>
              <h4 className="somex-question">{question.question}</h4>
              <div className="trivia-choices" role="group" aria-label={question.question}>
                {triviaChoices(scene).map((choice, index) => (
                  <button
                    key={`${trial.id}:${index}`}
                    className={`trivia-choice ${trial.choice !== null && choice === question.answer ? 'answer-correct' : ''} ${trial.choice === index && !trial.correct ? 'answer-wrong' : ''} ${trial.eliminated.includes(index) ? 'somex-eliminated' : ''}`}
                    disabled={
                      trial.choice !== null || ended || trial.eliminated.includes(index) || terminal
                    }
                    onClick={() => apply(answerAdventureTrivia(current.current, index))}
                  >
                    <span className="choice-letter">{String.fromCharCode(65 + index)}</span>
                    <span>{choice}</span>
                    {trial.eliminated.includes(index) && <small>Removed</small>}
                    {trial.choice !== null && choice === question.answer && <Check size={17} />}
                  </button>
                ))}
              </div>
              {trial.choice !== null && (
                <div
                  className={`answer-feedback ${trial.correct ? 'correct' : 'incorrect'}`}
                  role="status"
                >
                  <strong>
                    {trial.correct ? 'Correct!' : `The answer is ${question.answer}.`}
                  </strong>
                  <p>{question.explanation}</p>
                  {!ended && !terminal && (
                    <button
                      className="primary"
                      onClick={() => apply(nextAdventureQuestion(current.current))}
                    >
                      Next question <ArrowRight size={17} />
                    </button>
                  )}
                </div>
              )}
            </>
          )}
          {scene.mystery && mystery && (
            <>
              <p className="somex-rules">
                {scene.kind === 'identify' ? 'Identify the person' : 'Solve the mystery'} within{' '}
                {scene.limit} guesses.{' '}
                {scene.kind === 'identify' ? 'One clue is free' : 'Up to three clues are free'}; a
                failed mystery costs one heart.
              </p>
              {scene.kind === 'identify' ? (
                <>
                  <Suspense
                    fallback={
                      <p className="something-loading" role="status">
                        Loading the portrait…
                      </p>
                    }
                  >
                    <AdventurePortrait
                      personId={scene.mystery.id}
                      answer={ended ? mystery.answer : null}
                    />
                  </Suspense>
                  {(ended || scene.mystery.cluesShown > 1) && (
                    <p className="portrait-hint" role="status">
                      <Lightbulb size={16} /> {mystery.clues[1]}
                    </p>
                  )}
                </>
              ) : (
                <ol className="mystery-clues" aria-label="Adventure mystery clues">
                  {mystery.clues
                    .slice(0, ended ? mystery.clues.length : scene.mystery.cluesShown)
                    .map((clue, index) => (
                      <li key={clue}>
                        <span>{String(index + 1).padStart(2, '0')}</span>
                        <p>{clue}</p>
                      </li>
                    ))}
                </ol>
              )}
              {!ended && (
                <>
                  {(scene.kind !== 'identify' || scene.mystery.cluesShown < 2) && (
                    <button
                      className="text-button"
                      disabled={scene.mystery.cluesShown >= adventureClueLimit(scene.kind)}
                      onClick={() => apply(revealAdventureClue(current.current))}
                    >
                      {scene.kind === 'identify'
                        ? 'Reveal a clue'
                        : scene.mystery.cluesShown >= adventureClueLimit(scene.kind)
                          ? 'All free clues revealed'
                          : 'Reveal another clue'}
                    </button>
                  )}
                  <form
                    className="mystery-form"
                    onSubmit={(event) => {
                      event.preventDefault()
                      if (!apply(guessAdventureMystery(current.current, query))) setQuery('')
                    }}
                  >
                    <label htmlFor="adventure-answer">Your answer</label>
                    <input
                      id="adventure-answer"
                      value={query}
                      maxLength={100}
                      onChange={(event) => setQuery(event.target.value)}
                      autoComplete="off"
                      autoCorrect="off"
                      spellCheck={false}
                    />
                    <button className="primary" disabled={!query.trim() || terminal}>
                      Make a guess <ArrowRight size={17} />
                    </button>
                  </form>
                </>
              )}
              <p className="somex-rules">
                {scene.mystery.guesses.length}/{scene.limit} guesses used
              </p>
              {!!scene.mystery.guesses.length && (
                <ol className="somex-mystery-guesses" aria-label="Adventure mystery guesses">
                  {scene.mystery.guesses.map((guess, index) => (
                    <li key={index}>{guess}</li>
                  ))}
                </ol>
              )}
            </>
          )}
          {geo && answerCountry && (
            <>
              <p className="somex-rules">
                {geo.mode === 'journey'
                  ? `Reach the destination within ${scene.limit} land crossings.`
                  : `Find the ${geo.mode === 'capitals' ? 'capital' : 'country'} within ${scene.limit} guesses. Distance and adjacency guide you.`}{' '}
                A failed encounter costs one heart.
              </p>
              <div className="somex-geography">
                <div className="somex-geo-search">
                  {geo.mode === 'journey' && <JourneyChallenge round={geo} />}
                  {(geo.mode === 'flags' || geo.mode === 'shapes') && (
                    <VisualChallenge
                      key={`visual-${scene.nodeId}`}
                      mode={geo.mode}
                      country={answerCountry}
                      hintUsed={scene.hintUsed}
                      ended={ended}
                      onHint={() => consume('hint')}
                      showHintButton={false}
                    />
                  )}
                  {!ended && (
                    <GuessSearch
                      mode={geo.mode}
                      key={`search-${scene.nodeId}`}
                      onGuess={guessCountry}
                      guessed={geo.mode === 'journey' ? [] : geo.guesses}
                      disabled={terminal}
                    />
                  )}
                  <p className="somex-rules">
                    {geo.guesses.length}/{scene.limit}{' '}
                    {geo.mode === 'journey' ? 'crossings' : 'guesses'} used
                  </p>
                </div>
                <div ref={globePanel} className="globe-panel">
                  <Suspense
                    fallback={
                      <p className="globe-loading" role="status">
                        Getting the world ready…
                      </p>
                    }
                  >
                    <Globe
                      idPrefix="somex-"
                      key={`visual-${scene.nodeId}`}
                      mode={geo.mode}
                      guesses={guesses}
                      focus={focus}
                      answerReveal={
                        ended && !hasWon(geo)
                          ? {
                              country: answerCountry,
                              location: locationFor(answerCountry, geo.mode),
                            }
                          : null
                      }
                      journey={
                        geo.mode === 'journey'
                          ? {
                              start: geo.start!,
                              destination: geo.answer,
                              route: [geo.start!, ...geo.guesses],
                              remaining: geo.revealed
                                ? shortestBorderRoute(geo.guesses.at(-1) || geo.start!, geo.answer)!
                                : [],
                            }
                          : null
                      }
                    />
                  </Suspense>
                </div>
              </div>
              {geo.mode === 'journey' ? (
                <JourneyHistory
                  idPrefix="somex-"
                  round={geo}
                  onFocus={(country) => focusCountry(country, locationFor(country, geo.mode))}
                />
              ) : (
                <GuessHistory
                  idPrefix="somex-"
                  guesses={guesses}
                  mode={geo.mode}
                  onFocus={focusCountry}
                />
              )}
            </>
          )}
          {hint && (
            <p className="somex-hint" role="status">
              <Compass size={16} />
              {hint}
            </p>
          )}
          {scene.kind === 'rest' && !ended && (
            <div className="somex-pause">
              <TentTree size={44} strokeWidth={1.3} />
              <h4>A place to catch your breath.</h4>
              <p>Restore one heart, up to your current number of containers.</p>
              <button className="primary" onClick={() => apply(resolveRest(current.current))}>
                {run.hearts < run.maxHearts ? 'Rest · +1 heart' : 'Rest with full hearts'}{' '}
                <Heart size={17} />
              </button>
            </div>
          )}
          {scene.kind === 'shop' && !ended && (
            <>
              <p className="somex-rules">
                One of each supply is in stock. Lucky stars can only be found along the way.
              </p>
              <div className="somex-item-grid">
                {SHOP_ITEM_IDS.map((id) => (
                  <button
                    key={id}
                    className="somex-item"
                    onClick={() => apply(buyItem(current.current, id))}
                    disabled={
                      scene.purchases.includes(id) || run.coins < ITEMS[id].price || terminal
                    }
                  >
                    <span className="somex-item-symbol" aria-hidden="true">
                      {ITEMS[id].symbol}
                    </span>
                    <strong>{ITEMS[id].name}</strong>
                    <small>{ITEMS[id].description}</small>
                    <span className="somex-item-cost">
                      {scene.purchases.includes(id) ? 'Sold out' : `${ITEMS[id].price} coins`}
                    </span>
                  </button>
                ))}
              </div>
              <button className="primary" onClick={() => apply(leaveShop(current.current))}>
                Leave the shop <ArrowRight size={17} />
              </button>
            </>
          )}
          {scene.kind === 'event' && !ended && (
            <div className="somex-pause">
              <Gift size={44} strokeWidth={1.3} />
              <h4>A clearing with a choice.</h4>
              <p>A supply cache sits beside a quiet spring. Which will help your journey?</p>
              <div className="somex-event-choices">
                <button
                  className="secondary"
                  onClick={() => apply(resolveEvent(current.current, 'supplies'))}
                >
                  Take {ITEMS[scene.eventItem!].name} + {ADVENTURE_BALANCE.discoveryCoins} coins
                </button>
                <button
                  className="secondary"
                  onClick={() => apply(resolveEvent(current.current, 'heal'))}
                >
                  Drink from the spring · +1 heart
                </button>
              </div>
            </div>
          )}
          {ended && (
            <div className="somex-stop-result" role="status">
              <strong>
                {scene.result === 'cleared'
                  ? 'A step closer.'
                  : 'The path still has something to teach you.'}
              </strong>
              {answerCountry && (
                <p>
                  {geo!.mode === 'capitals'
                    ? `${answerCountry.capital.name}, ${answerCountry.name}`
                    : answerCountry.name}
                </p>
              )}
              {mystery && <p>The answer was {mystery.answer}.</p>}
              {scene.method === 'item' && <p>Cleared using a Lucky star.</p>}
              {!terminal && (
                <button className="primary" onClick={backToMap}>
                  Return to the route <ArrowRight size={17} />
                </button>
              )}
            </div>
          )}
          {!ended && isCombat(scene.kind) && !terminal && (
            <div className="somex-encounter-actions">
              <button className="text-button" onClick={() => setSatchel(true)}>
                <Backpack size={16} /> Use an item
              </button>
              <button
                className="give-up-button"
                onClick={() => apply(abandonEncounter(current.current))}
              >
                {scene.kind === 'boss'
                  ? 'Abandon this run'
                  : 'Give up and reveal answer · risk 1 heart'}
              </button>
            </div>
          )}
        </div>
      ) : (
        !terminal && (
          <div ref={mapPanel} className="somex-map-panel">
            <div className="somex-map-heading">
              <div>
                <p className="eyebrow">Choose your next step</p>
                <h3>The long way home</h3>
              </div>
              <Compass size={23} />
            </div>
            <p className="somex-rules">
              Choose a highlighted stop. A single rest stop waits halfway through the journey; the
              final stretch ends with an elite trial and the boss.
            </p>
            <AdventureMap run={run} onChoose={selectNode} />
          </div>
        )
      )}
      {scene && !terminal && (
        <details className="somex-route-preview">
          <summary>
            Your route <ChevronDown size={16} />
          </summary>
          <AdventureMap run={run} onChoose={selectNode} />
        </details>
      )}
      {confirmRestart && (
        <Dialog title="Start a new run?" onClose={() => setConfirmRestart(false)}>
          <p className="eyebrow">A fresh path</p>
          <h2>Start a new run?</h2>
          <p>
            This replaces your current adventure, including its route, hearts, coins and supplies.
            Your other games stay saved.
          </p>
          <div className="somex-confirm-actions">
            <button className="secondary" autoFocus onClick={() => setConfirmRestart(false)}>
              Keep this run
            </button>
            <button className="primary" onClick={restart}>
              Start new run <ArrowRight size={17} />
            </button>
          </div>
        </Dialog>
      )}
      {satchel && (
        <Dialog
          title="Your adventure satchel"
          onClose={() => setSatchel(false)}
          className="somex-inventory-dialog"
        >
          <p className="eyebrow">Pack a little possibility</p>
          <h2>Your satchel</h2>
          <p>
            Find supplies at shops and discoveries. Trial-specific items can also be used directly
            from a challenge. Phoenix feathers activate automatically.
          </p>
          {!ownedItems.length && (
            <p role="status">Your satchel is empty. Find supplies at shops or discoveries.</p>
          )}
          <div className="somex-item-grid">
            {ownedItems.map((id) => {
              const reason = itemUnavailable(run, id)
              return (
                <button
                  key={id}
                  className="somex-item"
                  onClick={() => consume(id)}
                  disabled={Boolean(reason)}
                  aria-label={`Use ${ITEMS[id].name}, ${run.inventory[id]} left`}
                  title={reason || ITEMS[id].description}
                >
                  <span className="somex-item-symbol" aria-hidden="true">
                    {ITEMS[id].symbol}
                  </span>
                  <span className="somex-item-count">×{run.inventory[id]}</span>
                  <strong>{ITEMS[id].name}</strong>
                  <small>{ITEMS[id].description}</small>
                  {reason && <span className="somex-item-reason">{reason}</span>}
                </button>
              )
            })}
          </div>
        </Dialog>
      )}
    </section>
  )
}

function TrialItems({ run, onUse }: { run: AdventureRun; onUse: (id: ItemId) => void }) {
  const items = trialItems(run)
  if (!items.length) return null
  return (
    <div className="somex-trial-items" role="group" aria-label="Items for this trial">
      {items.map((id) => {
        const reason = itemUnavailable(run, id)
        return (
          <button
            key={id}
            className="somex-use-item"
            disabled={Boolean(reason)}
            title={reason || ITEMS[id].description}
            onClick={() => onUse(id)}
          >
            <span aria-hidden="true">{ITEMS[id].symbol}</span>
            Use {ITEMS[id].name} <small>({run.inventory[id]})</small>
            {reason && <span className="sr-only"> · {reason}</span>}
          </button>
        )
      })}
    </div>
  )
}

function AdventureMap({
  run,
  onChoose,
}: {
  run: AdventureRun
  onChoose: (node: AdventureNode) => void
}) {
  const available = availableNodes(run).map((node) => node.id)
  return (
    <div className="somex-route-map" aria-label="Branching adventure route">
      <svg
        viewBox={`0 0 300 ${ADVENTURE_STOPS * 96}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {run.map.flatMap((from) =>
          run.map
            .filter((to) => connected(from, to))
            .map((to) => {
              const traveled = run.path.includes(from.id) && run.path.includes(to.id)
              return (
                <path
                  key={`${from.id}:${to.id}`}
                  className={traveled ? 'traveled' : ''}
                  d={`M${from.lane * 100 + 50},${from.row * 96 + 48} C${from.lane * 100 + 50},${from.row * 96 + 96} ${to.lane * 100 + 50},${to.row * 96} ${to.lane * 100 + 50},${to.row * 96 + 48}`}
                />
              )
            }),
        )}
      </svg>
      {run.map.map((node) => {
        const Icon = nodeIcons[node.kind]
        const result = run.outcomes[node.id]
        return (
          <button
            key={node.id}
            className={`somex-route-node ${available.includes(node.id) ? 'reachable' : ''} ${result || ''} ${run.encounter?.nodeId === node.id ? 'current' : ''}`}
            style={{ gridRow: node.row + 1, gridColumn: node.lane + 1 }}
            onClick={() => onChoose(node)}
            disabled={!available.includes(node.id)}
            aria-label={`${NODE_LABELS[node.kind]}, stop ${node.row + 1}${available.includes(node.id) ? ', available' : result ? `, ${result}` : ''}`}
          >
            <Icon size={21} aria-hidden="true" />
            <span>{NODE_LABELS[node.kind]}</span>
            {result && <small>{result === 'cleared' ? '✓' : '×'}</small>}
          </button>
        )
      })}
    </div>
  )
}
