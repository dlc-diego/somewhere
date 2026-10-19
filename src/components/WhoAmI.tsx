import { useEffect, useRef, useState, type SubmitEvent } from 'react'
import { ArrowRight, Check, Lightbulb } from 'lucide-react'
import type { CelebrationRequest } from '../lib/celebrations'
import {
  SOMEONE_KEY,
  loadSomeone,
  personById,
  personEnded,
  personSolved,
  guessPerson,
  newWhoSession,
  nextPersonClue,
  revealPerson,
} from '../lib/someone'

export default function WhoAmI({
  onCelebrate,
}: {
  onCelebrate: (requests: CelebrationRequest[]) => void
}) {
  const [initial] = useState(loadSomeone)
  const [session, setSession] = useState(initial.session)
  const current = useRef(session)
  current.current = session
  const [warning, setWarning] = useState(initial.warning)
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const round = session.round
  const person = personById.get(round.id)!
  const ended = personEnded(round)
  const solved = personSolved(round)
  useEffect(() => {
    try {
      localStorage.setItem(SOMEONE_KEY, JSON.stringify(session))
    } catch {
      setWarning('Browser storage is unavailable. This round may not survive a refresh.')
    }
  }, [session])

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const result = guessPerson(current.current.round, query)
    if (result.error) {
      setError(result.error)
      return
    }
    const next = { ...current.current, round: result.round }
    current.current = next
    setSession(next)
    setQuery('')
    setError('')
    if (personSolved(result.round)) {
      onCelebrate([{ effect: 'normal' }])
      setNotice(
        `You found them! ${person.answer}. ${result.round.guesses.length} guesses and ${result.round.cluesShown} clues.`,
      )
    } else setNotice('Not quite. Try another name, or reveal another clue.')
  }
  function showClue() {
    const next = { ...current.current, round: nextPersonClue(current.current.round) }
    current.current = next
    setSession(next)
    setError('')
    setNotice(`Clue ${next.round.cluesShown}: ${person.clues[next.round.cluesShown - 1]}`)
  }
  function giveUp() {
    const next = { ...current.current, round: revealPerson(current.current.round) }
    current.current = next
    setSession(next)
    setError('')
    setNotice(`Answer revealed: ${person.answer}. This mystery is complete.`)
  }
  function restart() {
    const next = newWhoSession(current.current)
    current.current = next
    setSession(next)
    setQuery('')
    setError('')
    setNotice('A fresh Who am I mystery is ready.')
  }

  return (
    <div>
      {warning && (
        <p className="storage-warning" role="status">
          {warning}
        </p>
      )}
      <div className="something-layout">
        <div className="trivia-card">
          <div className="trivia-card-heading">
            <h2 id="someone-title">Who am I</h2>
            <span>
              {round.cluesShown} / {person.clues.length} clues
            </span>
          </div>
          <p className="eyebrow question-category">{person.category}</p>
          {ended && (
            <div className="mystery-result">
              <h3>
                {solved ? `You found them. ${person.answer}!` : `The answer was ${person.answer}.`}
              </h3>
              <p>{person.explanation}</p>
            </div>
          )}
          <ol className="mystery-clues" aria-label="Who am I clues">
            {person.clues
              .slice(0, ended ? person.clues.length : round.cluesShown)
              .map((text, index) => (
                <li key={text}>
                  <span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                  <p>{text}</p>
                </li>
              ))}
          </ol>
          {!ended ? (
            <>
              <button
                className="text-button next-clue"
                onClick={showClue}
                disabled={round.cluesShown >= person.clues.length}
              >
                <Lightbulb size={16} aria-hidden="true" />
                {round.cluesShown < person.clues.length
                  ? 'Reveal another clue'
                  : 'All clues revealed'}
              </button>
              <form className="mystery-form" onSubmit={submit}>
                <label htmlFor="someone-answer">Your answer</label>
                <div className={`search-control ${error ? 'has-error' : ''}`}>
                  <input
                    id="someone-answer"
                    value={query}
                    maxLength={100}
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? 'someone-error' : undefined}
                    placeholder="Type a name…"
                    onChange={(event) => {
                      setQuery(event.target.value)
                      setError('')
                    }}
                  />
                </div>
                {error && (
                  <p className="input-error" id="someone-error" role="alert">
                    {error}
                  </p>
                )}
                <button className="primary guess-button" type="submit" disabled={!query.trim()}>
                  Make a guess <ArrowRight size={18} />
                </button>
              </form>
              {round.guesses.length > 0 && (
                <p className="mystery-encouragement">
                  Not quite yet. Keep guessing, or reveal another clue.
                </p>
              )}
            </>
          ) : (
            <button className="primary" onClick={restart}>
              Try another person <ArrowRight size={18} />
            </button>
          )}
        </div>
        <aside className="something-history" aria-label="Your Who am I guesses">
          <div className="something-history-heading">
            <h3>Your guesses</h3>
            <span>
              {round.guesses.length} {round.guesses.length === 1 ? 'guess' : 'guesses'}
            </span>
          </div>
          {!round.guesses.length ? (
            <p className="something-empty">Every familiar face starts with a hunch.</p>
          ) : (
            <ol className="mystery-guesses" aria-label="Who am I guesses">
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
              {solved ? 'Mystery solved' : 'Answer revealed'} with {round.cluesShown}{' '}
              {round.cluesShown === 1 ? 'clue' : 'clues'} used.
            </p>
          )}
        </aside>
      </div>
      {!ended && (
        <div className="give-up-area">
          <button className="give-up-button" onClick={giveUp}>
            Give up and reveal answer
          </button>
        </div>
      )}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {notice}
      </div>
    </div>
  )
}
