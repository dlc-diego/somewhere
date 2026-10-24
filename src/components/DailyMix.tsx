import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { ArrowRight, CalendarDays, Check, Lightbulb, Share2, Trophy } from 'lucide-react'
import { usePlayer } from '../lib/PlayerProvider'
import { CENTRAL_ZONE, nextStreakNoon, streakDay } from '../lib/streak'
import { countryById, locationFor, type Country, type Location } from '../lib/countries'
import { guessDetails } from '../lib/game'
import { questionById } from '../lib/something'
import {
  answerDaily,
  dailyChoices,
  dailyCorrect,
  dailyEnded,
  dailyGeoRound,
  dailyLimit,
  DAILY_LABELS,
  dailyShare,
  dailyStats,
  dailyStorageKey,
  dailySummary,
  dailyTextItem,
  dailyTrackingId,
  guessDaily,
  hintDaily,
  loadDaily,
  nextDaily,
  revealDaily,
  startDaily,
  type DailySession,
} from '../lib/daily'
import { useDailyBoard } from '../lib/useDailyBoard'
import type { CelebrationRequest } from '../lib/celebrations'
import GuessSearch from './GuessSearch'
import GuessHistory from './GuessHistory'
import VisualChallenge from './VisualChallenge'
import DailyLeaderboard from './DailyLeaderboard'

const Globe = lazy(() => import('./Globe'))
export default function DailyMix({
  onCelebrate,
}: {
  onCelebrate: (requests: CelebrationRequest[]) => void
}) {
  const player = usePlayer()
  return <DailyGame key={player.user?.uid || 'guest'} onCelebrate={onCelebrate} />
}
function DailyGame({ onCelebrate }: { onCelebrate: (requests: CelebrationRequest[]) => void }) {
  const player = usePlayer(),
    uid = player.user?.uid || null
  const [now, setNow] = useState(Date.now),
    day = streakDay(now)
  const [initial] = useState(() => loadDaily(uid, day))
  const [session, setSession] = useState(initial.session),
    current = useRef(session)
  const [warning, setWarning] = useState(initial.warning),
    [error, setError] = useState(''),
    [query, setQuery] = useState(''),
    [copied, setCopied] = useState(false)
  const [focus, setFocus] = useState<{
    countryId: string
    location: Location
    sequence: number
  } | null>(null)
  const sequence = useRef(0)
  const summary = dailySummary(session),
    board = useDailyBoard(player.user, day, session.started, summary)
  const remote = board.entries.find((entry) => entry.uid === uid)
  const result = remote?.status === 'finished' ? remote : summary
  const remoteFinished = remote?.status === 'finished'
  const elsewhere = !!remote && !session.started
  const trial = session.trials[session.index]
  const ended = !!trial && dailyEnded(trial, day),
    complete = result.status === 'finished'
  const geo = trial ? dailyGeoRound(trial) : null,
    guesses = geo ? guessDetails(geo) : []
  const item =
    trial && (trial.kind === 'who' || trial.kind === 'mystery') ? dailyTextItem(trial) : null
  const question = trial?.kind === 'trivia' ? questionById.get(trial.id)! : null
  const nextNoon = nextStreakNoon(now)
  useEffect(() => {
    const refresh = () => setNow(Date.now())
    const timer = setTimeout(refresh, Math.max(10, Math.min(60000, nextNoon - Date.now() + 10)))
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('pageshow', refresh)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('pageshow', refresh)
    }
  }, [now, nextNoon])
  useEffect(() => {
    if (session.day === day) return
    const loaded = loadDaily(uid, day)
    current.current = loaded.session
    setSession(loaded.session)
    setWarning(loaded.warning)
    setQuery('')
    setError('')
    setFocus(null)
    setCopied(false)
  }, [day, uid, session.day])
  function commit(next: DailySession) {
    if (next.day !== streakDay()) {
      setNow(Date.now())
      setError('A new Daily Mix is ready. Open today’s mix to continue.')
      return
    }
    const before = current.current,
      beforeTrial = before.trials[before.index]
    current.current = next
    setSession(next)
    setError('')
    setCopied(false)
    try {
      localStorage.setItem(dailyStorageKey(uid), JSON.stringify(next))
    } catch {
      setWarning(
        'Browser storage is unavailable. Keep this page open to preserve your daily attempt.',
      )
    }
    if (next.started) player.recordGame(dailyTrackingId(day), 'daily', dailyStats(next))
    const after = next.trials[before.index]
    if (
      before.started &&
      beforeTrial &&
      !dailyEnded(beforeTrial, day) &&
      dailyCorrect(after, day)
    ) {
      const events: CelebrationRequest[] = [{ effect: 'normal' }]
      if (dailySummary(next).status === 'finished' && dailySummary(next).score === 500)
        events.push({ effect: 'perfect-round' })
      onCelebrate(events)
    }
  }
  function apply(change: { session: DailySession; error?: string }) {
    if (change.error) {
      setError(change.error)
      return change.error
    }
    commit(change.session)
  }
  function focusCountry(country: Country, location: Location = country) {
    setFocus({ countryId: country.id, location, sequence: ++sequence.current })
  }
  function submitCountry(country: Country) {
    const change = guessDaily(current.current, country)
    const failure = apply(change)
    if (!failure) {
      setQuery('')
      focusCountry(country, locationFor(country, geo!.mode))
    }
    return failure
  }
  function next() {
    commit(nextDaily(current.current))
    setQuery('')
    setFocus(null)
    document.getElementById('daily-challenge')?.focus({ preventScroll: true })
  }
  async function share() {
    const base = window.location.origin + window.location.pathname
    const text =
      remoteFinished && (summary.status !== 'finished' || summary.score !== remote.score)
        ? 'Daily Mix · ' + result.solved + '/5 solved · ' + result.score + '/500 points\n' + base
        : dailyShare(current.current, base)
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      setError(
        'Copying is unavailable. Your result: ' +
          result.solved +
          '/5 solved · ' +
          result.score +
          '/500 points.',
      )
    }
  }
  const date = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' }).format(
    day * 86400000,
  )
  const reset = new Intl.DateTimeFormat('en-US', {
    timeZone: CENTRAL_ZONE,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(nextNoon)
  return (
    <section id="daily-content" className="daily-mix" tabIndex={-1} aria-labelledby="daily-title">
      <div className="daily-heading">
        <p className="eyebrow">
          <CalendarDays size={16} aria-hidden="true" />
          {date} · Daily Mix
        </p>
        <h2 id="daily-title">Five little discoveries.</h2>
        <p>Same challenges. A little friendly competition. No timer.</p>
        <small>Next mix: {reset}</small>
      </div>
      {warning && (
        <p className="storage-warning" role="status">
          {warning}
        </p>
      )}
      {player.error && (
        <p className="input-error" role="alert">
          {player.error}
        </p>
      )}
      {error && (
        <p className="input-error" role="alert">
          {error}
        </p>
      )}
      <div className="daily-layout">
        <div className="trivia-card daily-challenges">
          {(!remoteFinished || summary.status === 'finished') && (
            <ol className="daily-progress" aria-label="Daily challenge progress">
              {session.trials.map((t, i) => (
                <li
                  key={t.kind}
                  aria-current={session.started && i === session.index ? 'step' : undefined}
                  className={
                    dailyEnded(t, day)
                      ? dailyCorrect(t, day)
                        ? 'is-correct'
                        : 'is-missed'
                      : i === session.index
                        ? 'is-current'
                        : ''
                  }
                >
                  <span>{dailyEnded(t, day) ? (dailyCorrect(t, day) ? '✓' : '×') : i + 1}</span>
                  <small>{DAILY_LABELS[t.kind]}</small>
                </li>
              ))}
            </ol>
          )}
          {!session.started && !remoteFinished ? (
            <div className="daily-welcome">
              <Trophy size={36} strokeWidth={1.3} aria-hidden="true" />
              <h3>Today’s mix is ready.</h3>
              <p>
                Solve five challenges for up to 500 points. Each solved challenge starts at 100;
                misses cost 2 points and hints cost 1 on that challenge. Unsolved challenges earn
                zero.
              </p>
              <p className="daily-note">
                Progress stays on the device where you begin. Your flame check-in is separate.
              </p>
              {elsewhere ? (
                <p role="status">
                  You started today’s mix on another installation. Return there to continue the same
                  attempt.
                </p>
              ) : (
                <button
                  className="primary"
                  disabled={!!uid && !board.ready}
                  onClick={() => commit(startDaily(current.current))}
                >
                  Start today’s mix <ArrowRight size={18} />
                </button>
              )}
            </div>
          ) : complete &&
            (session.index === 5 || (remoteFinished && summary.status !== 'finished')) ? (
            <div className="daily-finish">
              <Trophy size={42} strokeWidth={1.3} aria-hidden="true" />
              <h3>
                {result.score === 500 ? 'A perfect daily mix.' : 'Today’s discoveries, collected.'}
              </h3>
              <strong className="daily-result-score">
                {result.score}
                <small> / 500</small>
              </strong>
              <p>{result.solved} of 5 challenges solved.</p>
              <button className="primary" onClick={() => void share()}>
                {copied ? <Check size={18} /> : <Share2 size={18} />}{' '}
                {copied ? 'Copied result' : 'Copy answer-free result'}
              </button>
              <p className="daily-note">
                A fresh mix arrives at noon Central. Your other games are ready whenever you are.
              </p>
            </div>
          ) : (
            trial && (
              <div id="daily-challenge" tabIndex={-1}>
                <div className="trivia-card-heading">
                  <h3>{DAILY_LABELS[trial.kind]}</h3>
                  <span>
                    {session.index + 1}/5 ·{' '}
                    {trial.kind === 'trivia'
                      ? 'one answer'
                      : trial.guesses.length + '/' + dailyLimit(trial) + ' guesses'}
                  </span>
                </div>
                {question ? (
                  <>
                    <p className="eyebrow question-category">{question.category}</p>
                    <h4 className="trivia-question">{question.question}</h4>
                    <div className="trivia-choices" role="group" aria-label={question.question}>
                      {dailyChoices(trial, day).map((choice, i) => (
                        <button
                          key={choice}
                          className={
                            'trivia-choice' +
                            (ended && choice === question.answer ? ' answer-correct' : '') +
                            (trial.choice === i && choice !== question.answer
                              ? ' answer-wrong'
                              : '')
                          }
                          disabled={ended || remoteFinished}
                          onClick={() => apply(answerDaily(current.current, i))}
                        >
                          <span className="choice-letter">{String.fromCharCode(65 + i)}</span>
                          <span>{choice}</span>
                        </button>
                      ))}
                    </div>
                    {ended && (
                      <p className="answer-feedback">
                        The answer is {question.answer}. {question.explanation}
                      </p>
                    )}
                  </>
                ) : geo ? (
                  <>
                    <p className="daily-note">
                      Find the mystery {trial.kind === 'capitals' ? 'capital' : 'country'} within
                      five guesses.
                    </p>
                    {(trial.kind === 'flags' || trial.kind === 'shapes') && (
                      <VisualChallenge
                        key={trial.id}
                        mode={trial.kind}
                        country={countryById.get(trial.id)!}
                        hintUsed={trial.hintUsed}
                        ended={ended}
                        onHint={() => apply(hintDaily(current.current))}
                      />
                    )}
                    {!ended && !remoteFinished && (
                      <GuessSearch
                        disabled={false}
                        key={day + ':' + session.index}
                        mode={geo.mode}
                        guessed={trial.guesses}
                        onGuess={submitCountry}
                      />
                    )}
                    <div className="daily-globe">
                      <Suspense
                        fallback={
                          <p className="something-loading" role="status">
                            Getting the world ready…
                          </p>
                        }
                      >
                        <Globe
                          guesses={guesses}
                          focus={focus}
                          mode={geo.mode}
                          journey={null}
                          answerReveal={
                            trial.revealed
                              ? {
                                  country: countryById.get(trial.id)!,
                                  location: locationFor(countryById.get(trial.id)!, geo.mode),
                                }
                              : null
                          }
                        />
                      </Suspense>
                    </div>
                    {guesses.length > 0 && (
                      <GuessHistory
                        idPrefix="daily-"
                        guesses={guesses}
                        mode={geo.mode}
                        onFocus={focusCountry}
                      />
                    )}
                  </>
                ) : item ? (
                  <>
                    <ol className="mystery-clues" aria-label="Daily mystery clues">
                      {item.clues.slice(0, ended ? 5 : trial.cluesShown).map((clue, i) => (
                        <li key={clue}>
                          <span>{String(i + 1).padStart(2, '0')}</span>
                          <p>{clue}</p>
                        </li>
                      ))}
                    </ol>
                    {!ended && !remoteFinished && (
                      <>
                        <button
                          className="text-button next-clue"
                          disabled={trial.cluesShown >= 5}
                          onClick={() => apply(hintDaily(current.current))}
                        >
                          <Lightbulb size={16} />
                          Reveal another clue
                        </button>
                        <form
                          className="mystery-form"
                          onSubmit={(event) => {
                            event.preventDefault()
                            const change = guessDaily(current.current, query)
                            if (!apply(change)) setQuery('')
                          }}
                        >
                          <label htmlFor="daily-answer">Your answer</label>
                          <div className="search-control">
                            <input
                              id="daily-answer"
                              value={query}
                              maxLength={100}
                              autoComplete="off"
                              spellCheck={false}
                              onChange={(e) => {
                                setQuery(e.target.value)
                                setError('')
                              }}
                              placeholder="Type your answer…"
                            />
                          </div>
                          <button className="primary guess-button" disabled={!query.trim()}>
                            Make a guess <ArrowRight size={18} />
                          </button>
                        </form>
                      </>
                    )}
                    {trial.guesses.length > 0 && (
                      <ol className="mystery-guesses" aria-label="Daily mystery guesses">
                        {trial.guesses.map((g, i) => (
                          <li key={g}>
                            <span>{i + 1}</span>
                            <strong>{g}</strong>
                          </li>
                        ))}
                      </ol>
                    )}
                    {ended && (
                      <p className="answer-feedback">
                        The answer is {item.answer}. {item.explanation}
                      </p>
                    )}
                  </>
                ) : null}
                {ended ? (
                  <div className="daily-trial-result" role="status">
                    <strong>
                      {dailyCorrect(trial, day) ? 'Discovery made.' : 'A little more learned.'}
                    </strong>
                    <button className="primary" onClick={next}>
                      {session.index === 4 ? 'See daily results' : 'Next discovery'}{' '}
                      <ArrowRight size={18} />
                    </button>
                  </div>
                ) : (
                  !remoteFinished && (
                    <button
                      className="give-up-button"
                      onClick={() => apply(revealDaily(current.current))}
                    >
                      Give up and reveal answer
                    </button>
                  )
                )}
              </div>
            )
          )}
        </div>
        <DailyLeaderboard
          {...board}
          uid={uid}
          signIn={player.signIn}
          signInDisabled={!player.ready || player.busy}
        />
      </div>
    </section>
  )
}
