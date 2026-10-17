import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { geoDistance, geoInterpolate, geoOrthographic, geoPath } from 'd3-geo'
import { feature } from 'topojson-client'
import type { FeatureCollection, Geometry } from 'geojson'
import type { GeometryCollection, Topology } from 'topojson-specification'
import { LocateFixed, Move, RefreshCw } from 'lucide-react'
import {
  countryById,
  countryByNumeric,
  locationFor,
  type Country,
  type GameMode,
  type Location,
} from '../lib/countries'
import { journeyColors } from '../lib/journey'
import { temperatures } from '../lib/geo'
import { useGlobeFrame } from '../lib/useGlobeFrame'
import type { Guess } from '../lib/game'
import {
  GLOBE_FOCUS_DELAY_MS,
  GLOBE_FOCUS_DURATION_MS,
  GUESS_BLINK_CYCLES,
  GUESS_BLINK_DURATION_MS,
  GUESS_BLINK_PERIOD_MS,
  MIN_GLOBE_ZOOM,
  MAX_GLOBE_ZOOM,
  GLOBE_ZOOM_STEP,
  focusZoomForArea,
  prefersReducedMotion,
} from '../lib/motion'

const initialRotation: [number, number, number] = [-12, -18, 0]
type Atlas = Topology<{ countries: GeometryCollection }>
export type JourneyMap = {
  start: string
  destination: string
  route: string[]
  remaining: string[]
}
type Focus = { countryId: string; location: Location; sequence: number } | null
type RevealedLocation = { country: Country; location: Location }
const revealColor = temperatures.found.color

function Globe({
  guesses,
  focus,
  mode,
  answerReveal,
  journey = null,
}: {
  guesses: Guess[]
  focus: Focus
  mode: GameMode
  answerReveal: RevealedLocation | null
  journey?: JourneyMap | null
}) {
  const [world, setWorld] = useState<FeatureCollection<Geometry> | null>(null)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [rotation, setRotation] = useState(initialRotation)
  const [zoom, setZoom] = useState(1)
  const [blinkingCountryId, setBlinkingCountryId] = useState<string | null>(null)
  const pendingBlink = useRef<{
    sequence: number
    countryId: string
    rotation: [number, number, number]
    zoom: number
  } | null>(null)
  const blinkStopTimer = useRef<number | null>(null)
  const blinkableIds = useRef(new Set<string>())
  blinkableIds.current = new Set(guesses.map((g) => g.country.id))
  if (answerReveal) blinkableIds.current.add(answerReveal.country.id)
  if (journey)
    for (const id of [...journey.route, journey.destination, ...journey.remaining])
      blinkableIds.current.add(id)
  const rotationRef = useRef(rotation)
  rotationRef.current = rotation
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom
  const flightFrame = useRef<number | null>(null)
  const flightDelay = useRef<number | null>(null)
  const cancelMotion = useCallback(() => {
    if (flightFrame.current !== null) cancelAnimationFrame(flightFrame.current)
    if (flightDelay.current !== null) window.clearTimeout(flightDelay.current)
    if (blinkStopTimer.current !== null) window.clearTimeout(blinkStopTimer.current)
    pendingBlink.current = null
    flightFrame.current = null
    flightDelay.current = null
    blinkStopTimer.current = null
    setBlinkingCountryId(null)
  }, [])
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef({ multi: false, distance: 0 })
  const colors = useMemo(() => {
    const result = new Map(guesses.map((g) => [g.country.id, temperatures[g.temperature].color]))
    if (journey) {
      result.clear()
      for (const id of [...journey.route, ...journey.remaining])
        result.set(id, journeyColors.visited)
      result.set(journey.route.at(-1)!, journeyColors.current)
      result.set(
        journey.destination,
        journey.route.at(-1) === journey.destination
          ? journeyColors.arrived
          : journeyColors.destination,
      )
    }
    if (answerReveal) result.set(answerReveal.country.id, revealColor)
    return result
  }, [guesses, answerReveal, journey])
  let markers = guesses
    .filter((g) => mode === 'capitals' || g.country.small || g.country.id === 'TUV')
    .map((g) => ({
      country: g.country,
      location: g.location,
      color: temperatures[g.temperature].color,
      revealed: false,
    }))
  if (journey)
    markers = [...new Set([...journey.route, journey.destination, ...journey.remaining])].map(
      (id) => ({
        country: countryById.get(id)!,
        location: locationFor(countryById.get(id)!, 'journey'),
        color: colors.get(id)!,
        revealed: Boolean(answerReveal && id === journey.destination),
      }),
    )
  else if (answerReveal) markers.push({ ...answerReveal, color: revealColor, revealed: true })

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
    cancelMotion()
    if (!focus) {
      setRotation(initialRotation)
      setZoom(1)
      return
    }
    const target: [number, number, number] = [-focus.location.lng, -focus.location.lat, 0]
    const targetZoom = focusZoomForArea(countryById.get(focus.countryId)?.area ?? 0)
    if (prefersReducedMotion()) {
      setRotation(target)
      setZoom(targetZoom)
      return
    }
    flightDelay.current = window.setTimeout(() => {
      flightDelay.current = null
      // Interpolate the viewing center over the shortest great-circle route,
      // including when a guess crosses the date line.
      const from = rotationRef.current
      const fromZoom = zoomRef.current
      const route = geoInterpolate([-from[0], -from[1]], [focus.location.lng, focus.location.lat])
      const started = performance.now()
      const frame = (now: number) => {
        const progress = Math.min(1, (now - started) / GLOBE_FOCUS_DURATION_MS)
        const eased = progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2
        const [lng, lat] = route(eased)
        setRotation(progress === 1 ? target : [-lng, -lat, 0])
        setZoom(progress === 1 ? targetZoom : fromZoom * (targetZoom / fromZoom) ** eased)
        if (progress < 1) flightFrame.current = requestAnimationFrame(frame)
        else {
          flightFrame.current = null
          // The worker must finish displaying this camera before the cue begins.
          pendingBlink.current = {
            sequence: focus.sequence,
            countryId: focus.countryId,
            rotation: target,
            zoom: targetZoom,
          }
        }
      }
      flightFrame.current = requestAnimationFrame(frame)
    }, GLOBE_FOCUS_DELAY_MS)
    return cancelMotion
  }, [focus, cancelMotion])

  const camera = useMemo(() => ({ rotation, zoom }), [rotation, zoom])
  const rendered = useGlobeFrame(world, camera)
  const renderedRotation = rendered?.rotation ?? rotation
  const renderedZoom = rendered?.zoom ?? zoom

  useEffect(() => {
    const pending = pendingBlink.current
    if (!pending || !rendered || pending.sequence !== focus?.sequence) return
    if (
      rendered.zoom !== pending.zoom ||
      rendered.rotation.some((value, i) => value !== pending.rotation[i])
    )
      return
    pendingBlink.current = null
    if (!blinkableIds.current.has(pending.countryId) || prefersReducedMotion()) return
    setBlinkingCountryId(pending.countryId)
    blinkStopTimer.current = window.setTimeout(() => {
      setBlinkingCountryId(null)
      blinkStopTimer.current = null
    }, GUESS_BLINK_DURATION_MS)
  }, [rendered, focus])

  const projection = useMemo(
    () =>
      geoOrthographic()
        .translate([300, 300])
        .scale(265 * renderedZoom)
        .rotate(renderedRotation),
    [renderedRotation, renderedZoom],
  )
  const features = useMemo(
    () =>
      world?.features.map((f, index) => ({
        key: `${f.id ?? 'unmapped'}-${index}`,
        country: countryByNumeric.get(String(f.id).padStart(3, '0')),
      })) ?? [],
    [world],
  )
  const mapPaths = useMemo(
    () =>
      features.map((f, i) => ({
        ...f,
        d: rendered?.paths[i] ?? '',
      })),
    [features, rendered],
  )
  const center: [number, number] = [-renderedRotation[0], -renderedRotation[1]]

  function changeZoom(factor: number) {
    cancelMotion()
    setZoom((z) => Math.max(MIN_GLOBE_ZOOM, Math.min(MAX_GLOBE_ZOOM, z * factor)))
  }

  function reset() {
    cancelMotion()
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
      <div className="globe-viewport" data-testid="globe" data-ready={Boolean(world && rendered)}>
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
              cancelMotion()
            if (e.key === 'ArrowLeft') setRotation((r) => [r[0] - 12 / zoom, r[1], 0])
            if (e.key === 'ArrowRight') setRotation((r) => [r[0] + 12 / zoom, r[1], 0])
            if (e.key === 'ArrowUp') setRotation((r) => [r[0], Math.min(85, r[1] + 12 / zoom), 0])
            if (e.key === 'ArrowDown')
              setRotation((r) => [r[0], Math.max(-85, r[1] - 12 / zoom), 0])
            if (e.key === '+' || e.key === '=') changeZoom(GLOBE_ZOOM_STEP)
            if (e.key === '-') changeZoom(1 / GLOBE_ZOOM_STEP)
            if (e.key === 'Home') reset()
          }}
        >
          <svg
            viewBox="0 0 600 600"
            className="globe-svg"
            role="img"
            aria-label={
              journey
                ? 'World globe. The starting country, destination and crossed borders are marked.'
                : 'World globe. Guessed locations are colored. Answers are revealed only after a correct guess or giving up.'
            }
            onPointerDown={(e) => {
              if (e.pointerType === 'mouse' && e.button !== 0) return
              cancelMotion()
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
                setZoom((z) => Math.max(MIN_GLOBE_ZOOM, Math.min(MAX_GLOBE_ZOOM, z * ratio)))
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
                <circle cx="300" cy="300" r={265 * renderedZoom} />
              </clipPath>
            </defs>
            <circle className="orbit" cx="300" cy="300" r="285" />
            <circle cx="300" cy="300" r={265 * renderedZoom} fill="url(#ocean)" />
            <g clipPath="url(#globe-clip)">
              <path
                d={rendered?.graticule ?? ''}
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
                  className={
                    f.country
                      ? `country-path${f.country.id === blinkingCountryId ? ' guess-country-blink' : ''}`
                      : 'territory-path'
                  }
                  style={
                    f.country?.id === blinkingCountryId
                      ? ({
                          '--guess-heat-color': colors.get(blinkingCountryId),
                          animationDuration: `${GUESS_BLINK_PERIOD_MS}ms`,
                          animationIterationCount: GUESS_BLINK_CYCLES,
                        } as CSSProperties)
                      : undefined
                  }
                >
                  <title>{f.country?.name || 'Territory (not in the playable list)'}</title>
                </path>
              ))}
              <circle
                cx="300"
                cy="300"
                r={265 * renderedZoom}
                fill="url(#shade)"
                pointerEvents="none"
              />
              {journey &&
                [journey.route, journey.remaining].map(
                  (route, index) =>
                    route.length > 1 && (
                      <path
                        key={`route:${index}`}
                        className="journey-map-route"
                        data-testid={index === 0 ? 'traveled-route' : 'revealed-route'}
                        d={
                          geoPath(projection)({
                            type: 'LineString',
                            coordinates: route.map((id) => {
                              const point = locationFor(countryById.get(id)!, 'journey')
                              return [point.lng, point.lat]
                            }),
                          }) || ''
                        }
                        fill="none"
                        stroke="#fffaf1"
                        strokeWidth="2"
                        strokeDasharray={index === 1 ? '3 6' : '6 4'}
                        strokeLinecap="round"
                        pointerEvents="none"
                      />
                    ),
                )}
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
                      className={
                        g.country.id === blinkingCountryId ? 'guess-marker-blink' : undefined
                      }
                      style={
                        g.country.id === blinkingCountryId
                          ? {
                              animationDuration: `${GUESS_BLINK_PERIOD_MS}ms`,
                              animationIterationCount: GUESS_BLINK_CYCLES,
                            }
                          : undefined
                      }
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
        {(!world || !rendered) && (
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
