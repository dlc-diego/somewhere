import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Check, ChevronDown, Flame, Lightbulb, Sparkles, Trophy, X } from 'lucide-react'
import type { CelebrationRequest } from '../lib/celebrations'
import {
  answerTrivia,
  guessMystery,
  isPerfectRound,
  isTriviaCorrect,
  loadSomething,
  mysteryById,
  mysteryEnded,
  mysterySolved,
  newMysterySession,
  newTriviaSession,
  nextMysteryClue,
  nextTriviaQuestion,
  presentedChoices,
  questionById,
  revealMystery,
  triviaCelebrations,
  triviaScore,
  triviaStreak,
  TRIVIA_LENGTH,
  TRIVIA_KEY,
  MYSTERY_KEY,
  SOMETHING_MODE_KEY,
  type SomethingMode,
} from '../lib/something'

export default function Something({
  onCelebrate,
}: {
  onCelebrate: (requests: CelebrationRequest[]) => void
}) {
  const [initial] = useState(loadSomething)
  const [mode, setMode] = useState<SomethingMode>(initial.mode)
  const [trivia, setTrivia] = useState(initial.trivia)
  const [mystery, setMystery] = useState(initial.mystery)
  const [warning, setWarning] = useState(initial.warning)
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const triviaRef = useRef(trivia)
  const mysteryRef = useRef(mystery)
  triviaRef.current = trivia
  mysteryRef.current = mystery
  const feedback = useRef<HTMLDivElement>(null)
  const questionHeading = useRef<HTMLHeadingElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const t = trivia.round
  const item = questionById.get(t.ids[Math.min(t.index, TRIVIA_LENGTH - 1)])!
  const answered = t.responses.length > t.index
  const score = triviaScore(t)
  const streak = triviaStreak(t)
  const complete = t.index === TRIVIA_LENGTH
  const r = mystery.round
  const clue = mysteryById.get(r.id)!
  const ended = mysteryEnded(r)
  const solved = mysterySolved(r)

  useEffect(() => {
    try {
      localStorage.setItem(TRIVIA_KEY, JSON.stringify(trivia))
      localStorage.setItem(MYSTERY_KEY, JSON.stringify(mystery))
      localStorage.setItem(SOMETHING_MODE_KEY, mode)
    } catch {
      setWarning('Browser storage is unavailable. These rounds may not survive a refresh.')
    }
  }, [trivia, mystery, mode])

  function answer(choice: number) {
    const current = triviaRef.current
    const round = answerTrivia(current.round, choice)
    if (round === current.round) return
    const next = { ...current, round }
    triviaRef.current = next
    setTrivia(next)
    onCelebrate(triviaCelebrations(round))
    const correct = isTriviaCorrect(round, round.index)
    setNotice(
      correct
        ? `Correct! ${triviaScore(round)} correct. ${triviaStreak(round) >= 3 ? `On Fire! ${triviaStreak(round)} in a row.` : ''}`
        : `Not quite. The answer is ${questionById.get(round.ids[round.index])!.answer}. Your streak resets to zero.`,
    )
    requestAnimationFrame(() => feedback.current?.focus({ preventScroll: true }))
  }
  function nextQuestion() {
    const current = triviaRef.current
    const round = nextTriviaQuestion(current.round)
    triviaRef.current = { ...current, round }
    setTrivia(triviaRef.current)
    setNotice(
      round.index === TRIVIA_LENGTH
        ? `Round complete. ${triviaScore(round)} out of ${TRIVIA_LENGTH}.`
        : `Question ${round.index + 1} of ${TRIVIA_LENGTH}.`,
    )
    requestAnimationFrame(() => questionHeading.current?.focus({ preventScroll: true }))
  }
  function restartTrivia() {
    const next = newTriviaSession(triviaRef.current)
    triviaRef.current = next
    setTrivia(next)
    setNotice('A fresh General Trivia round is ready. Ten questions, no timer.')
    requestAnimationFrame(() => questionHeading.current?.focus({ preventScroll: true }))
  }
  function submitMystery(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const current = mysteryRef.current
    const result = guessMystery(current.round, query)
    if (result.error) {
      setError(result.error)
      return
    }
    const next = { ...current, round: result.round }
    mysteryRef.current = next
    setMystery(next)
    setQuery('')
    setError('')
    if (mysterySolved(result.round)) {
      onCelebrate([{ effect: 'normal' }])
      setNotice(
        `You found it! ${clue.answer}. ${result.round.guesses.length} guesses and ${result.round.cluesShown} clues.`,
      )
    } else setNotice('Not quite. Try another answer, or reveal another clue.')
  }
  function showClue() {
    const current = mysteryRef.current
    const next = { ...current, round: nextMysteryClue(current.round) }
    mysteryRef.current = next
    setMystery(next)
    setNotice(`Clue ${next.round.cluesShown}: ${clue.clues[next.round.cluesShown - 1]}`)
  }
  function giveUp() {
    const current = mysteryRef.current
    const next = { ...current, round: revealMystery(current.round) }
    mysteryRef.current = next
    setMystery(next)
    setError('')
    setNotice(`Answer revealed: ${clue.answer}. This mystery is complete.`)
  }
  function restartMystery() {
    const next = newMysterySession(mysteryRef.current)
    mysteryRef.current = next
    setMystery(next)
    setQuery('')
    setError('')
    setNotice('A fresh What am I mystery is ready.')
  }

  return (
    <section
      className="something-games"
      id="something-games"
      tabIndex={-1}
      aria-labelledby="something-title"
    >
      <div className="something-toolbar">
        <div className="mode-selector">
          <Sparkles size={18} aria-hidden="true" />
          <label className="sr-only" htmlFor="something-mode">
            Something game mode
          </label>
          <select
            id="something-mode"
            value={mode}
            onChange={(event) => {
              setMode(event.target.value as SomethingMode)
              setError('')
              setNotice('')
            }}
          >
            <option value="trivia">General Trivia</option>
            <option value="mystery">What am I</option>
          </select>
          <ChevronDown size={17} aria-hidden="true" />
        </div>
      </div>
      {warning && (
        <p className="storage-warning" role="status">
          {warning}
        </p>
      )}
      <div className="something-layout">
        <div className="trivia-card">
          <div className="trivia-card-heading">
            <h2 id="something-title">{mode === 'trivia' ? 'General Trivia' : 'What am I'}</h2>
            <span>
              {mode === 'trivia'
                ? complete
                  ? 'Round complete'
                  : `${t.index + 1} / ${TRIVIA_LENGTH}`
                : `${r.cluesShown} / ${clue.clues.length} clues`}
            </span>
          </div>
          {mode === 'trivia' ? (
            <>
              <div
                className="trivia-progress"
                role="progressbar"
                aria-label="Questions answered"
                aria-valuemin={0}
                aria-valuemax={TRIVIA_LENGTH}
                aria-valuenow={t.responses.length}
              >
                {t.ids.map((id, i) => (
                  <i
                    key={id}
                    className={
                      i < t.responses.length
                        ? isTriviaCorrect(t, i)
                          ? 'progress-correct'
                          : 'progress-wrong'
                        : i === t.index
                          ? 'progress-current'
                          : ''
                    }
                  />
                ))}
              </div>
              {complete ? (
                <div className="trivia-summary">
                  <Trophy size={38} strokeWidth={1.3} aria-hidden="true" />
                  <h3 ref={questionHeading} tabIndex={-1}>
                    {isPerfectRound(t) ? 'A perfect little round.' : 'A little more discovered.'}
                  </h3>
                  <p className="trivia-score">
                    {score}
                    <span> / {TRIVIA_LENGTH}</span>
                  </p>
                  <p className="trivia-summary-note">
                    {isPerfectRound(t)
                      ? 'Ten out of ten. Beautifully done.'
                      : 'Every answer comes with a new discovery.'}
                  </p>
                  <button className="primary" onClick={restartTrivia}>
                    Play another round <ArrowRight size={18} />
                  </button>
                </div>
              ) : (
                <>
                  <p className="eyebrow question-category">{item.category}</p>
                  <h3
                    className="trivia-question"
                    id="trivia-question"
                    ref={questionHeading}
                    tabIndex={-1}
                  >
                    {item.question}
                  </h3>
                  <div className="trivia-choices" role="group" aria-labelledby="trivia-question">
                    {presentedChoices(t).map((choice, index) => {
                      const correct = answered && choice === item.answer
                      const selected = answered && t.responses[t.index] === index
                      return (
                        <button
                          key={choice}
                          disabled={answered}
                          className={`trivia-choice${correct ? ' answer-correct' : ''}${selected && !correct ? ' answer-wrong' : ''}`}
                          onClick={() => answer(index)}
                        >
                          <span className="choice-letter">{String.fromCharCode(65 + index)}</span>
                          <span>{choice}</span>
                          {correct ? (
                            <Check size={18} aria-hidden="true" />
                          ) : selected ? (
                            <X size={18} aria-hidden="true" />
                          ) : null}
                          {correct && <span className="sr-only">Correct answer</span>}
                          {selected && <span className="sr-only">Your answer</span>}
                        </button>
                      )
                    })}
                  </div>
                  {answered && (
                    <div
                      ref={feedback}
                      className={`answer-feedback ${isTriviaCorrect(t, t.index) ? 'feedback-correct' : 'feedback-wrong'}`}
                      tabIndex={-1}
                    >
                      <strong>
                        {isTriviaCorrect(t, t.index)
                          ? 'Correct!'
                          : `Not quite. The answer is ${item.answer}.`}
                      </strong>
                      <p>{item.explanation}</p>
                      {isPerfectRound(t) && (
                        <p>
                          <Trophy size={16} aria-hidden="true" /> Perfect round — 10 out of 10!
                        </p>
                      )}
                      <button className="primary" onClick={nextQuestion}>
                        {t.index === TRIVIA_LENGTH - 1 ? 'See your results' : 'Next question'}{' '}
                        <ArrowRight size={18} />
                      </button>
                    </div>
                  )}
                </>
              )}
            </>
          ) : (
            <>
              <p className="eyebrow question-category">{clue.category}</p>
              {ended && (
                <div className="mystery-result">
                  <h3>
                    {solved ? `You found it. ${clue.answer}!` : `The answer was ${clue.answer}.`}
                  </h3>
                  <p>{clue.explanation}</p>
                </div>
              )}
              <ol className="mystery-clues" aria-label="Mystery clues">
                {clue.clues.slice(0, ended ? clue.clues.length : r.cluesShown).map((text, i) => (
                  <li key={text}>
                    <span aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                    <p>{text}</p>
                  </li>
                ))}
              </ol>
              {!ended ? (
                <>
                  <button
                    className="text-button next-clue"
                    onClick={showClue}
                    disabled={r.cluesShown >= clue.clues.length}
                  >
                    <Lightbulb size={16} />
                    {r.cluesShown < clue.clues.length
                      ? 'Reveal another clue'
                      : 'All clues revealed'}
                  </button>
                  <form className="mystery-form" onSubmit={submitMystery}>
                    <label htmlFor="mystery-answer">Your answer</label>
                    <div className={`search-control ${error ? 'has-error' : ''}`}>
                      <input
                        ref={input}
                        id="mystery-answer"
                        value={query}
                        maxLength={100}
                        autoComplete="off"
                        spellCheck={false}
                        aria-invalid={Boolean(error)}
                        aria-describedby={error ? 'mystery-error' : undefined}
                        placeholder="Type your answer…"
                        onChange={(event) => {
                          setQuery(event.target.value)
                          setError('')
                        }}
                      />
                    </div>
                    {error && (
                      <p className="input-error" id="mystery-error" role="alert">
                        {error}
                      </p>
                    )}
                    <button className="primary guess-button" type="submit" disabled={!query.trim()}>
                      Make a guess <ArrowRight size={18} />
                    </button>
                  </form>
                  {r.guesses.length > 0 && (
                    <p className="mystery-encouragement">
                      Not quite yet. Keep guessing, or reveal another clue.
                    </p>
                  )}
                </>
              ) : (
                <button className="primary" onClick={restartMystery}>
                  Try another mystery <ArrowRight size={18} />
                </button>
              )}
            </>
          )}
        </div>
        <aside
          className="something-history"
          aria-label={mode === 'trivia' ? 'Your trivia round' : 'Your mystery guesses'}
        >
          {mode === 'trivia' ? (
            <>
              <div className="something-history-heading">
                <h3>Your round</h3>
                <span>{score} correct</span>
              </div>
              <div
                className={`streak-badge ${streak >= 3 ? 'on-fire' : ''}`}
                role="status"
                aria-label={`${streak >= 3 ? 'On Fire. ' : ''}${streak} correct ${streak === 1 ? 'answer' : 'answers'} in a row`}
              >
                {streak >= 3 ? (
                  <span aria-hidden="true">{'🔥'.repeat(Math.min(3, Math.floor(streak / 3)))}</span>
                ) : (
                  <Flame size={19} aria-hidden="true" />
                )}
                <span>
                  <strong>{streak >= 3 ? 'On Fire' : 'Hot streak'}</strong>
                  <small>{streak} in a row</small>
                </span>
              </div>
              {t.responses.length === 0 ? (
                <p className="something-empty">Your discoveries will appear here.</p>
              ) : (
                <ol className="trivia-review" aria-label="Trivia answers">
                  {t.responses.map((response, index) => {
                    const q = questionById.get(t.ids[index])!
                    const correct = isTriviaCorrect(t, index)
                    return (
                      <li key={q.id}>
                        <details>
                          <summary>
                            <span className={correct ? 'review-correct' : 'review-wrong'}>
                              {correct ? <Check size={15} /> : <X size={15} />}
                            </span>
                            <span>
                              <small>
                                {index + 1}. {q.category}
                              </small>
                              {q.answer}
                            </span>
                            <ChevronDown size={13} />
                          </summary>
                          <p>{q.question}</p>
                          {!correct && <p>Your answer: {presentedChoices(t, index)[response]}</p>}
                          <p>{q.explanation}</p>
                        </details>
                      </li>
                    )
                  })}
                </ol>
              )}
            </>
          ) : (
            <>
              <div className="something-history-heading">
                <h3>Your guesses</h3>
                <span>
                  {r.guesses.length} {r.guesses.length === 1 ? 'guess' : 'guesses'}
                </span>
              </div>
              {r.guesses.length === 0 ? (
                <p className="something-empty">Every mystery starts with a hunch.</p>
              ) : (
                <ol className="mystery-guesses" aria-label="Mystery guesses">
                  {r.guesses.map((guess, i) => (
                    <li key={i}>
                      <span>{String(i + 1).padStart(2, '0')}</span>
                      <strong>{guess}</strong>
                      {solved && i === r.guesses.length - 1 && (
                        <Check size={16} aria-label="Correct answer" />
                      )}
                    </li>
                  ))}
                </ol>
              )}
              {ended && (
                <p className="something-empty">
                  {solved ? 'Mystery solved' : 'Answer revealed'} with {r.cluesShown}{' '}
                  {r.cluesShown === 1 ? 'clue' : 'clues'} used.
                </p>
              )}
            </>
          )}
        </aside>
      </div>
      {mode === 'mystery' && !ended && (
        <div className="give-up-area">
          <button className="give-up-button" onClick={giveUp}>
            Give up and reveal answer
          </button>
        </div>
      )}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {notice}
      </div>
    </section>
  )
}
