import { useEffect, useId, useRef, useState } from 'react'
import { ArrowRight, Check, ChevronDown, Search, X } from 'lucide-react'
import {
  exactLocation,
  locationFor,
  searchLocations,
  type Country,
  type GameMode,
} from '../lib/countries'

export default function GuessSearch({
  mode,
  onGuess,
  guessed,
  disabled,
}: {
  mode: GameMode
  onGuess: (country: Country) => string | undefined
  guessed: string[]
  disabled: boolean
}) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Country | null>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const container = useRef<HTMLFormElement>(null)
  const id = useId()
  const matches = searchLocations(query, mode)
  const item = mode === 'capitals' ? 'capital' : 'country'

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [])

  function pick(country: Country) {
    setQuery(locationFor(country, mode).name)
    setSelected(country)
    setOpen(false)
    setError('')
    input.current?.focus()
  }
  function submit(country?: Country) {
    const choice = country || selected || exactLocation(query, mode)
    if (!choice) {
      setError(`Select a ${item} from the suggestions first.`)
      setOpen(Boolean(query))
      input.current?.focus()
      return
    }
    if (guessed.includes(choice.id)) {
      setError(`Already explored! Try a different ${item}.`)
      setOpen(false)
      return
    }
    const failure = onGuess(choice)
    if (failure) {
      setError(failure)
      return
    }
    setQuery('')
    setSelected(null)
    setOpen(false)
    setError('')
    setActive(0)
  }

  return (
    <form
      ref={container}
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      className="guess-form"
    >
      <label className="search-label" htmlFor={`${id}-search`}>
        {mode === 'capitals' ? 'Which capital do you think it is?' : 'Where do you think it is?'}
      </label>
      <div className={`search-control ${error ? 'has-error' : ''}`}>
        <Search size={19} aria-hidden="true" />
        <input
          ref={input}
          id={`${id}-search`}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open && matches.length > 0}
          aria-controls={open && matches.length ? `${id}-list` : undefined}
          aria-activedescendant={open && matches[active] ? `${id}-option-${active}` : undefined}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : `${id}-hint`}
          placeholder={`Search for a ${item}…`}
          value={query}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          disabled={disabled}
          onChange={(e) => {
            setQuery(e.target.value)
            setSelected(null)
            setOpen(true)
            setActive(0)
            setError('')
          }}
          onFocus={() => {
            if (query && !selected) setOpen(true)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setOpen(false)
              return
            }
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault()
              setOpen(true)
              setActive((i) =>
                Math.max(0, Math.min(matches.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1))),
              )
            }
            if (e.key === 'Enter' && open && matches[active]) {
              e.preventDefault()
              pick(matches[active])
            }
          }}
        />
        {query && !disabled ? (
          <button
            type="button"
            className="clear-search"
            aria-label={`Clear ${item} search`}
            onClick={() => {
              setQuery('')
              setSelected(null)
              setOpen(false)
              setError('')
              input.current?.focus()
            }}
          >
            <X size={16} />
          </button>
        ) : (
          <ChevronDown size={16} aria-hidden="true" />
        )}
      </div>
      {open && query && (
        <div className={`autocomplete ${matches.length ? '' : 'no-match-container'}`}>
          {matches.length ? (
            <ul
              id={`${id}-list`}
              role="listbox"
              aria-label={mode === 'capitals' ? 'Capital suggestions' : 'Country suggestions'}
            >
              {matches.map((country, i) => (
                <li
                  id={`${id}-option-${i}`}
                  key={country.id}
                  role="option"
                  aria-selected={active === i}
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => pick(country)}
                  onMouseMove={() => setActive(i)}
                >
                  <span className="country-flag" aria-hidden="true">
                    {country.flag}
                  </span>
                  <span>
                    {locationFor(country, mode).name}
                    <small>{mode === 'capitals' ? country.name : country.region}</small>
                  </span>
                  {guessed.includes(country.id) && (
                    <span className="already-guessed">
                      <Check size={13} /> Guessed
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="no-results">
              {mode === 'capitals'
                ? 'No capitals found. Try a city name, such as “Paris” or “Tokyo”.'
                : 'No countries found. Try another name or an alias like “UK”.'}
            </p>
          )}
        </div>
      )}
      {error && (
        <p className="input-error" id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
      <button className="primary guess-button" type="submit" disabled={disabled || !query.trim()}>
        Make a guess <ArrowRight size={18} />
      </button>
      <p className="search-hint" id={`${id}-hint`}>
        A little intuition. A little geography.
      </p>
    </form>
  )
}
