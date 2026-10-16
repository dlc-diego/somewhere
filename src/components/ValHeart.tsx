import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Heart } from 'lucide-react'

const HOLD_MS = 650
const REVEAL_MS = 3600

/** A quiet long-press surprise, independent of rounds and winning celebrations. */
export default function ValHeart() {
  const button = useRef<HTMLButtonElement>(null)
  const holdTimer = useRef<number | null>(null)
  const resetTimer = useRef<number | null>(null)
  const press = useRef<{ kind: 'pointer' | 'keyboard'; x: number; y: number } | null>(null)
  const playing = useRef(false)
  const [bloom, setBloom] = useState<CSSProperties | null>(null)

  function cancelHold() {
    if (holdTimer.current !== null) window.clearTimeout(holdTimer.current)
    holdTimer.current = null
    press.current = null
  }

  function startHold(kind: 'pointer' | 'keyboard', x = 0, y = 0) {
    if (playing.current || press.current) return
    press.current = { kind, x, y }
    holdTimer.current = window.setTimeout(() => {
      holdTimer.current = null
      press.current = null
      if (!button.current || document.hidden) return
      const rect = button.current.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      playing.current = true
      setBloom({
        '--heart-x': `${cx}px`,
        '--heart-y': `${cy}px`,
        '--heart-duration': `${REVEAL_MS}ms`,
      } as CSSProperties)
      resetTimer.current = window.setTimeout(() => {
        playing.current = false
        resetTimer.current = null
        setBloom(null)
      }, REVEAL_MS)
    }, HOLD_MS)
  }

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) cancelHold()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelHold()
      if (resetTimer.current !== null) window.clearTimeout(resetTimer.current)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return (
    <>
      <button
        ref={button}
        type="button"
        className={`val-heart-button${bloom ? ' is-beating' : ''}`}
        aria-label="A heart for Val"
        style={bloom ?? undefined}
        onPointerDown={(event) => {
          if (!event.isPrimary || event.button !== 0) return
          event.currentTarget.setPointerCapture(event.pointerId)
          startHold('pointer', event.clientX, event.clientY)
        }}
        onPointerMove={(event) => {
          const current = press.current
          if (
            current?.kind === 'pointer' &&
            Math.hypot(event.clientX - current.x, event.clientY - current.y) > 12
          )
            cancelHold()
        }}
        onPointerUp={cancelHold}
        onPointerCancel={cancelHold}
        onLostPointerCapture={cancelHold}
        onKeyDown={(event) => {
          if (event.key !== ' ' && event.key !== 'Enter') return
          event.preventDefault()
          if (!event.repeat) startHold('keyboard')
        }}
        onKeyUp={(event) => {
          if (event.key !== ' ' && event.key !== 'Enter') return
          event.preventDefault()
          cancelHold()
        }}
        onBlur={cancelHold}
        onContextMenu={(event) => event.preventDefault()}
      >
        <Heart className="title-heart" aria-hidden="true" strokeWidth={1.5} />
      </button>
      {bloom &&
        createPortal(
          <div className="val-heart-backdrop" style={bloom} aria-hidden="true" />,
          document.body,
        )}
    </>
  )
}
