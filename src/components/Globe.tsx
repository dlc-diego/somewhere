import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { geoDistance, geoGraticule10, geoInterpolate, geoOrthographic, geoPath } from 'd3-geo'
import { feature } from 'topojson-client'
import type { FeatureCollection, Geometry } from 'geojson'
import type { GeometryCollection, Topology } from 'topojson-specification'
import { LocateFixed, Minus, Plus, RotateCcw, Move, RefreshCw } from 'lucide-react'
import { countryByNumeric, type Country, type GameMode, type Location } from '../lib/countries'
import { temperatures } from '../lib/geo'
import type { Guess } from '../lib/game'
import { GLOBE_FOCUS_DELAY_MS, GLOBE_FOCUS_DURATION_MS, prefersReducedMotion } from '../lib/motion'

const graticule = geoGraticule10()
const initialRotation: [number, number, number] = [-12, -18, 0]
type Atlas = Topology<{ countries: GeometryCollection }>
type Focus = { location: Location; sequence: number } | null
type RevealedLocation = { country: Country; location: Location }
const revealColor = '#a77332'

function Globe({
  guesses,
  focus,
  mode,
  answerReveal,
}: {
  guesses: Guess[]
  focus: Focus
  mode: GameMode
  answerReveal: RevealedLocation | null
}) {
  const [world, setWorld] = useState<FeatureCollection<Geometry> | null>(null)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [rotation, setRotation] = useState(initialRotation)
  const [zoom, setZoom] = useState(1)
  const rotationRef = useRef(rotation)
  rotationRef.current = rotation
  const flightFrame = useRef<number | null>(null)
  const flightDelay = useRef<number | null>(null)
  const cancelFlight = useCallback(() => {
    if (flightFrame.current !== null) cancelAnimationFrame(flightFrame.current)
    if (flightDelay.current !== null) window.clearTimeout(flightDelay.current)
    flightFrame.current = null
    flightDelay.current = null
  }, [])
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef({ multi: false, distance: 0 })
  const colors = useMemo(() => {
    const result = new Map(guesses.map((g) => [g.country.id, temperatures[g.temperature].color]))
    if (answerReveal) result.set(answerReveal.country.id, revealColor)
    return result
  }, [guesses, answerReveal])
  const markers = guesses
    .filter((g) => mode === 'capitals' || g.country.small || g.country.id === 'TUV')
    .map((g) => ({
      country: g.country,
      location: g.location,
      color: temperatures[g.temperature].color,
      revealed: false,
    }))
  if (answerReveal) markers.push({ ...answerReveal, color: revealColor, revealed: true })

  useEffect(() => {
    const controller = new AbortController()
    setError(false)
    fetch(`${import.meta.env.BASE_URL}data/world.json`, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error('Map unavailable')
        return r.json() as Promise<Atlas>
      })
      .then((atlas) => {
        const collection = feature(atlas, atlas.objects.countries)
        if (collection.type !== 'FeatureCollection' || collection.features.length < 190)
          throw new Error('Invalid map')
        setWorld(collection)
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true)
      })
    return () => controller.abort()
  }, [attempt])

  useEffect(() => {
    cancelFlight()
    if (!focus) {
      setRotation(initialRotation)
      setZoom(1)
      return
    }
    const target: [number, number, number] = [-focus.location.lng, -focus.location.lat, 0]
    if (prefersReducedMotion()) {
      setRotation(target)
      return
    }
    flightDelay.current = window.setTimeout(() => {
      flightDelay.current = null
      // Interpolate the viewing center over the shortest great-circle route,
      // including when a guess crosses the date line.
      const from = rotationRef.current
      const route = geoInterpolate([-from[0], -from[1]], [focus.location.lng, focus.location.lat])
      const started = performance.now()
      const frame = (now: number) => {
        const progress = Math.min(1, (now - started) / GLOBE_FOCUS_DURATION_MS)
        const eased = progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2
        const [lng, lat] = route(eased)
        setRotation(progress === 1 ? target : [-lng, -lat, 0])
        flightFrame.current = progress < 1 ? requestAnimationFrame(frame) : null
      }
      flightFrame.current = requestAnimationFrame(frame)
    }, GLOBE_FOCUS_DELAY_MS)
    return cancelFlight
  }, [focus, cancelFlight])

  const projection = useMemo(
    () =>
      geoOrthographic()
        .translate([300, 300])
        .scale(265 * zoom)
        .rotate(rotation)
        .clipAngle(90)
        .precision(0.6),
    [rotation, zoom],
  )
  const path = useMemo(() => geoPath(projection), [projection])
  const mapPaths = useMemo(
    () =>
      world?.features.map((f, index) => ({
        key: `${f.id ?? 'unmapped'}-${index}`,
        country: countryByNumeric.get(String(f.id).padStart(3, '0')),
        d: path(f) || '',
      })),
    [world, path],
  )
  const center: [number, number] = [-rotation[0], -rotation[1]]

  function reset() {
    cancelFlight()
    setRotation(initialRotation)
    setZoom(1)
  }
  function endPointer(id: number) {
    pointers.current.delete(id)
    if (!pointers.current.size) gesture.current.multi = false
  }

  return (
    <div className="globe-content">
      <div className="globe-heading">
        <span className="eyebrow">A world of possibilities</span>
        <span className="live-indicator">
          <span /> Free play
        </span>
      </div>
      <div className="globe-viewport" data-testid="globe" data-ready={Boolean(world)}>
        <span className="compass-n" aria-hidden="true">
          N
        </span>
        <div
          className="globe-keyboard"
          tabIndex={0}
          role="group"
          aria-label="Interactive globe. Drag to rotate, pinch to zoom. Keyboard: arrow keys rotate, plus and minus zoom, Home resets. Use country search to identify or guess countries."
          onKeyDown={(e) => {
            if (
              ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', 'Home'].includes(
                e.key,
              )
            )
              e.preventDefault()
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home'].includes(e.key))
              cancelFlight()
            if (e.key === 'ArrowLeft') setRotation((r) => [r[0] - 12, r[1], 0])
            if (e.key === 'ArrowRight') setRotation((r) => [r[0] + 12, r[1], 0])
            if (e.key === 'ArrowUp') setRotation((r) => [r[0], Math.min(85, r[1] + 12), 0])
            if (e.key === 'ArrowDown') setRotation((r) => [r[0], Math.max(-85, r[1] - 12), 0])
            if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(2.2, z + 0.2))
            if (e.key === '-') setZoom((z) => Math.max(1, z - 0.2))
            if (e.key === 'Home') reset()
          }}
        >
          <svg
            viewBox="0 0 600 600"
            className="globe-svg"
            role="img"
            aria-label="World globe. Guessed locations are colored. Answers are revealed only after a correct guess or giving up."
            onPointerDown={(e) => {
              if (e.pointerType === 'mouse' && e.button !== 0) return
              cancelFlight()
              e.currentTarget.setPointerCapture(e.pointerId)
              if (!pointers.current.size) gesture.current = { multi: false, distance: 0 }
              pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
              if (pointers.current.size >= 2) {
                gesture.current.multi = true
                const [a, b] = [...pointers.current.values()]
                gesture.current.distance = Math.hypot(a.x - b.x, a.y - b.y)
              }
            }}
            onPointerMove={(e) => {
              const previous = pointers.current.get(e.pointerId)
              if (!previous) return
              const dx = e.clientX - previous.x,
                dy = e.clientY - previous.y
              pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
              if (pointers.current.size === 1 && !gesture.current.multi) {
                setRotation((r) => [
                  (r[0] + (dx * 0.4) / zoom) % 360,
                  Math.max(-85, Math.min(85, r[1] - (dy * 0.4) / zoom)),
                  0,
                ])
              } else if (pointers.current.size >= 2) {
                const [a, b] = [...pointers.current.values()]
                const distance = Math.hypot(a.x - b.x, a.y - b.y)
                const ratio = gesture.current.distance ? distance / gesture.current.distance : 1
                setZoom((z) => Math.max(1, Math.min(2.2, z * ratio)))
                gesture.current.distance = distance
              }
            }}
            onPointerUp={(e) => endPointer(e.pointerId)}
            onPointerCancel={(e) => endPointer(e.pointerId)}
            onLostPointerCapture={(e) => pointers.current.delete(e.pointerId)}
          >
            <defs>
              <radialGradient id="ocean" cx="33%" cy="25%" r="80%">
                <stop offset="0" stopColor="#294c5e" />
                <stop offset="0.65" stopColor="#173747" />
                <stop offset="1" stopColor="#0b2535" />
              </radialGradient>
              <radialGradient id="shade" cx="36%" cy="28%" r="75%">
                <stop offset="0.4" stopColor="#001927" stopOpacity="0" />
                <stop offset="1" stopColor="#001927" stopOpacity="0.42" />
              </radialGradient>
              <clipPath id="globe-clip">
                <circle cx="300" cy="300" r={265 * zoom} />
              </clipPath>
            </defs>
            <circle className="orbit" cx="300" cy="300" r="285" />
            <circle cx="300" cy="300" r={265 * zoom} fill="url(#ocean)" />
            <g clipPath="url(#globe-clip)">
              <path
                d={path(graticule) || ''}
                fill="none"
                stroke="#7995a2"
                strokeOpacity="0.15"
                strokeWidth="0.7"
              />
              {mapPaths?.map((f) => (
                <path
                  key={f.key}
                  d={f.d}
                  data-country={f.country?.numeric}
                  data-guessed={
                    f.country ? guesses.some((g) => g.country.id === f.country!.id) : false
                  }
                  data-revealed={
                    answerReveal && f.country?.id === answerReveal.country.id ? true : undefined
                  }
                  fill={(f.country && colors.get(f.country.id)) || '#bcc6b6'}
                  stroke="#254553"
                  strokeWidth="0.65"
                  strokeLinejoin="round"
                  className={f.country ? 'country-path' : 'territory-path'}
                >
                  <title>{f.country?.name || 'Territory (not in the playable list)'}</title>
                </path>
              ))}
              <circle cx="300" cy="300" r={265 * zoom} fill="url(#shade)" pointerEvents="none" />
              {markers
                .filter((g) => geoDistance([g.location.lng, g.location.lat], center) < Math.PI / 2)
                .map((g) => {
                  const point = projection([g.location.lng, g.location.lat])!
                  return (
                    <circle
                      key={g.country.id}
                      cx={point[0]}
                      cy={point[1]}
                      r="5"
                      fill={g.color}
                      stroke="#fffaf1"
                      strokeWidth="1.5"
                      data-country={g.country.numeric}
                      data-capital={mode === 'capitals' ? g.country.id : undefined}
                      data-revealed={g.revealed || undefined}
                    >
                      <title>
                        {g.revealed ? 'Answer: ' : ''}
                        {g.location.name}
                        {mode === 'capitals' ? `, ${g.country.name}` : ''}
                      </title>
                    </circle>
                  )
                })}
            </g>
          </svg>
        </div>
        {!world && (
          <div className="map-status" role="status">
            {error ? (
              <>
                <p>The globe couldn’t load.</p>
                <button className="text-button" onClick={() => setAttempt((a) => a + 1)}>
                  <RefreshCw size={15} /> Try again
                </button>
                <small>You can still play using search.</small>
              </>
            ) : (
              <>
                <div className="loading-ring" />
                <p>Unfolding the world…</p>
              </>
            )}
          </div>
        )}
        <div className="globe-tools">
          <button
            className="icon-button"
            aria-label="Zoom in"
            disabled={zoom >= 2.2}
            onClick={() => setZoom((z) => Math.min(2.2, z + 0.2))}
          >
            <Plus size={18} />
          </button>
          <button
            className="icon-button"
            aria-label="Zoom out"
            disabled={zoom <= 1}
            onClick={() => setZoom((z) => Math.max(1, z - 0.2))}
          >
            <Minus size={18} />
          </button>
          <span />
          <button className="icon-button" aria-label="Reset globe view" onClick={reset}>
            <RotateCcw size={17} />
          </button>
        </div>
        <span className="globe-coordinate" aria-hidden="true">
          <LocateFixed size={13} /> The next stop is up to you
        </span>
      </div>
      <div className="globe-caption">
        <Move size={15} />
        <span>
          Drag to explore <span className="caption-dot">·</span> Use search to guess
        </span>
      </div>
    </div>
  )
}

export default memo(Globe)
