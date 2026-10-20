import { useEffect, useRef, useState, type SubmitEvent } from 'react'
import { ArrowRight, Check, Lightbulb, RefreshCw } from 'lucide-react'
import type { CelebrationRequest } from '../lib/celebrations'
import {
  fetchPortraits,
  identifyGame,
  loadIdentify,
  IDENTIFY_KEY,
  type Portrait,
} from '../lib/identify'
import LicensedPortrait from './LicensedPortrait'

export default function IdentifyMe({
  onCelebrate,
}: {
  onCelebrate: (requests: CelebrationRequest[]) => void
}) {
  const [portraits, setPortraits] = useState<Portrait[] | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setError('')
    void fetchPortraits(controller.signal)
      .then(setPortraits)
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setError(error instanceof Error ? error.message : 'The pictures could not load.')
      })
    return () => controller.abort()
  }, [attempt])
  if (error)
    return (
      <div className="trivia-card">
        <h2 id="identify-title">Identify Me</h2>
        <p role="alert">{error}</p>
        <button className="secondary" onClick={() => setAttempt((value) => value + 1)}>
          Try loading portraits again <RefreshCw size={16} />
        </button>
      </div>
    )
  if (!portraits)
    return (
      <div className="trivia-card">
        <h2 id="identify-title">Identify Me</h2>
        <p className="something-loading" role="status">
          Loading the portrait collection…
        </p>
      </div>
    )
  return <PortraitRound portraits={portraits} onCelebrate={onCelebrate} />
}

function PortraitRound({
  portraits,
  onCelebrate,
}: {
  portraits: Portrait[]
  onCelebrate: (requests: CelebrationRequest[]) => void
}) {
  const [game] = useState(() => identifyGame(portraits))
  const [initial] = useState(() => loadIdentify(game))
  const [session, setSession] = useState(initial.session)
  const current = useRef(session)
  current.current = session
  const [warning, setWarning] = useState(initial.warning)
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const round = session.round
  const portrait = portraits.find((p) => p.id === round.id)!
  const person = game.byId.get(round.id)!
  const solved = game.solved(round)
  const ended = game.ended(round)
  const hintUsed = round.cluesShown > 1
  useEffect(() => {
    try {
      localStorage.setItem(IDENTIFY_KEY, JSON.stringify(session))
    } catch {
      setWarning('Browser storage is unavailable. This round may not survive a refresh.')
    }
  }, [session])
  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const result = game.guess(current.current.round, query)
    if (result.error) {
      setError(result.error)
      return
    }
    const next = { ...current.current, round: result.round }
    current.current = next
    setSession(next)
    setError('')
    setQuery('')
    if (game.solved(result.round)) {
      onCelebrate([{ effect: 'normal' }])
      setNotice(`You found them! ${person.answer}. ${result.round.guesses.length} guesses.`)
    } else setNotice('Not quite. Try another name, or reveal the clue.')
  }
  function hint() {
    const next = { ...current.current, round: game.nextClue(current.current.round) }
    current.current = next
    setSession(next)
    setNotice(person.clues[1])
  }
  function reveal() {
    const next = { ...current.current, round: game.reveal(current.current.round) }
    current.current = next
    setSession(next)
    setError('')
    setNotice(`Answer revealed: ${person.answer}.`)
  }
  function restart() {
    const next = game.newSession(current.current)
    current.current = next
    setSession(next)
    setQuery('')
    setError('')
    setNotice('A new portrait is ready.')
  }
  return (
    <>
      {warning && (
        <p className="storage-warning" role="status">
          {warning}
        </p>
      )}
      <div className="something-layout">
        <div className="trivia-card">
          <div className="trivia-card-heading">
            <h2 id="identify-title">Identify Me</h2>
            <span>
              {ended ? 'Portrait complete' : hintUsed ? 'Clue revealed' : 'One clue available'}
            </span>
          </div>
          {ended && (
            <div className="mystery-result">
              <h3>
                {solved ? `You found them. ${person.answer}!` : `The answer was ${person.answer}.`}
              </h3>
              <p>{person.explanation}</p>
            </div>
          )}
          <LicensedPortrait
            key={portrait.id}
            portrait={portrait}
            answer={ended ? person.answer : null}
          />
          {hintUsed || ended ? (
            <p className="portrait-hint" role="status">
              <Lightbulb size={16} />
              {person.clues[1]}
            </p>
          ) : (
            <button className="text-button next-clue" onClick={hint}>
              <Lightbulb size={16} /> Reveal a clue
            </button>
          )}
          {!ended ? (
            <form className="mystery-form" onSubmit={submit}>
              <label htmlFor="identify-answer">Your answer</label>
              <div className={`search-control ${error ? 'has-error' : ''}`}>
                <input
                  id="identify-answer"
                  value={query}
                  maxLength={100}
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? 'identify-error' : undefined}
                  placeholder="Type a name…"
                  onChange={(event) => {
                    setQuery(event.target.value)
                    setError('')
                  }}
                />
              </div>
              {error && (
                <p id="identify-error" className="input-error" role="alert">
                  {error}
                </p>
              )}
              <button className="primary guess-button" disabled={!query.trim()}>
                Make a guess <ArrowRight size={18} />
              </button>
            </form>
          ) : (
            <button className="primary" onClick={restart}>
              Try another portrait <ArrowRight size={18} />
            </button>
          )}
        </div>
        <aside className="something-history" aria-label="Your Identify Me guesses">
          <div className="something-history-heading">
            <h3>Your guesses</h3>
            <span>
              {round.guesses.length} {round.guesses.length === 1 ? 'guess' : 'guesses'}
            </span>
          </div>
          {!round.guesses.length ? (
            <p className="something-empty">A familiar face. A name on the tip of your tongue.</p>
          ) : (
            <ol className="mystery-guesses" aria-label="Identify Me guesses">
              {round.guesses.map((guess, index) => (
                <li key={index}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <strong>{guess}</strong>
                  {solved && index === round.guesses.length - 1 && (
                    <Check size={16} aria-label="Correct answer" />
                  )}
                </li>
              ))}
            </ol>
          )}
          {ended && (
            <p className="something-empty">
              {solved ? 'Portrait identified' : 'Answer revealed'}
              {hintUsed ? ' with the clue.' : ' without using the clue.'}
            </p>
          )}
        </aside>
      </div>
      {!ended && (
        <div className="give-up-area">
          <button className="give-up-button" onClick={reveal}>
            Give up and reveal answer
          </button>
        </div>
      )}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {notice}
      </div>
    </>
  )
}
