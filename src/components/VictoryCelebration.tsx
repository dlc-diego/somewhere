import { useEffect, useRef } from 'react'
import { CELEBRATION_DURATION_MS, type Celebration } from '../lib/celebrations'

const colors = ['#f47759', '#f1b63d', '#52ad8a', '#709de0', '#d480b7', '#9c8cdb']
const emojis = ['🎉', '🥳', '💖', '🌍', '✨', '🎈']
const tau = Math.PI * 2
const random = (min: number, max: number) => min + Math.random() * (max - min)

function heart(ctx: CanvasRenderingContext2D, size: number) {
  ctx.beginPath()
  ctx.moveTo(0, size * 0.7)
  ctx.bezierCurveTo(-size * 1.6, -size * 0.3, -size * 0.5, -size * 1.4, 0, -size * 0.5)
  ctx.bezierCurveTo(size * 0.5, -size * 1.4, size * 1.6, -size * 0.3, 0, size * 0.7)
  ctx.fill()
}

function star(ctx: CanvasRenderingContext2D, size: number) {
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const angle = (i * Math.PI) / 5 - Math.PI / 2
    const radius = i % 2 ? size * 0.42 : size
    ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius)
  }
  ctx.closePath()
  ctx.fill()
}

function createScene(effect: Celebration, mobile: boolean) {
  // All particles are allocated once. Frames only update drawing, never React state.
  const count = effect === 'emoji-parade' ? (mobile ? 28 : 42) : mobile ? 100 : 160
  const particles = Array.from({ length: count }, (_, i) => ({
    x: Math.random(),
    y: Math.random(),
    size: random(4, 10),
    speed: random(0.7, 1.4),
    phase: random(0, tau),
    delay: random(0, 1.4),
    color: colors[i % colors.length],
    group: i % 5,
  }))
  const bursts = Array.from({ length: 5 }, (_, i) => ({
    x: random(0.14, 0.86),
    y: random(0.12, 0.55),
    start: 0.22 + i * 0.48,
  }))

  return (ctx: CanvasRenderingContext2D, width: number, height: number, seconds: number) => {
    const fade = Math.min(1, Math.max(0, (CELEBRATION_DURATION_MS / 1000 - seconds) / 0.7))
    const spread = Math.min(width, height)
    ctx.clearRect(0, 0, width, height)
    particles.forEach((p, i) => {
      const age = seconds - p.delay
      if (age < 0 && effect !== 'fireworks') return
      ctx.save()
      ctx.globalAlpha = fade
      ctx.fillStyle = p.color
      ctx.strokeStyle = p.color

      if (effect === 'confetti') {
        const y = -30 + age * (height + 140) * 0.32 * p.speed
        const x = p.x * width + Math.sin(age * 2.5 + p.phase) * 40
        ctx.translate(x, y)
        ctx.rotate(p.phase + age * p.speed * 3)
        ctx.scale(1, Math.cos(age * 6 + p.phase) * 0.8 || 0.1)
        ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.65)
      } else if (effect === 'fireworks') {
        const burst = bursts[p.group]
        const t = seconds - burst.start
        const cx = burst.x * width
        const cy = burst.y * height
        if (t >= 0 && t < 0.48 && i < 5) {
          // A short rocket trail leads into each bloom, with no flashing backdrop.
          const y = height + (cy - height) * (t / 0.48)
          ctx.globalAlpha *= t / 0.48
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.moveTo(cx, y + 40)
          ctx.lineTo(cx, y)
          ctx.stroke()
        }
        const life = t - 0.48
        if (life >= 0 && life < 1.9) {
          const angle = p.phase
          const radius = spread * 0.27 * p.speed * (1 - Math.exp(-life * 2))
          const x = cx + Math.cos(angle) * radius
          const y = cy + Math.sin(angle) * radius + life * life * 32
          ctx.globalAlpha *= (1 - life / 1.9) * 0.9
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.moveTo(x - Math.cos(angle) * 12, y - Math.sin(angle) * 12)
          ctx.lineTo(x, y)
          ctx.stroke()
          ctx.beginPath()
          ctx.arc(x, y, p.size * 0.3, 0, tau)
          ctx.fill()
        }
      } else if (effect === 'emoji-parade') {
        const x = p.x * width + Math.sin(age * 2 + p.phase) * 28
        const y = height + 50 - age * (height + 180) * 0.35 * p.speed
        ctx.translate(x, y)
        ctx.rotate(Math.sin(age * 2 + p.phase) * 0.3)
        ctx.font = `${p.size * 3 + 12}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(emojis[i % emojis.length], 0, 0)
      } else if (effect === 'heart-fountains') {
        const direction = i % 2 ? -1 : 1
        const x =
          (direction === 1 ? width * 0.06 : width * 0.94) + direction * age * width * 0.23 * p.speed
        const y = height + 15 - age * height * 0.85 * p.speed + age * age * height * 0.19
        ctx.translate(x, y)
        ctx.rotate(Math.sin(age * 2 + p.phase) * 0.6)
        ctx.fillStyle = ['#e76d89', '#f49b91', '#e6b849', '#68aa8b'][i % 4]
        heart(ctx, p.size)
      } else if (effect === 'shooting-stars') {
        const progress = age * 0.55 * p.speed
        const x = p.x * width - width * 0.55 + progress * width
        const y = p.y * height - height * 0.55 + progress * height
        const tail = 25 + p.size * 4
        const gradient = ctx.createLinearGradient(x - tail, y - tail, x, y)
        gradient.addColorStop(0, 'transparent')
        gradient.addColorStop(1, p.color)
        ctx.strokeStyle = gradient
        ctx.lineWidth = p.size * 0.4
        ctx.beginPath()
        ctx.moveTo(x - tail, y - tail)
        ctx.lineTo(x, y)
        ctx.stroke()
        ctx.translate(x, y)
        ctx.rotate(age + p.phase)
        star(ctx, p.size)
      } else {
        const life = age / (2.1 + p.speed)
        if (life < 1) {
          const x = p.x * width + Math.sin(age * 1.6 + p.phase) * 30
          const y = height + 40 - life * (height + 100)
          const radius = p.size * 2.4
          if (life < 0.87) {
            ctx.globalAlpha *= 0.65
            ctx.lineWidth = 1.8
            ctx.beginPath()
            ctx.arc(x, y, radius, 0, tau)
            ctx.stroke()
            ctx.globalAlpha *= 0.2
            ctx.fill()
            ctx.globalAlpha = fade * 0.65
            ctx.beginPath()
            ctx.arc(x - radius * 0.25, y - radius * 0.25, radius * 0.45, Math.PI, Math.PI * 1.55)
            ctx.stroke()
          } else {
            const pop = (life - 0.87) / 0.13
            ctx.globalAlpha *= 1 - pop
            for (let j = 0; j < 6; j++) {
              const angle = (j * tau) / 6
              ctx.beginPath()
              ctx.arc(
                x + Math.cos(angle) * radius * (1 + pop),
                y + Math.sin(angle) * radius * (1 + pop),
                2,
                0,
                tau,
              )
              ctx.fill()
            }
          }
        }
      }
      ctx.restore()
    })
  }
}

export default function VictoryCelebration({
  effect,
  onComplete,
}: {
  effect: Celebration
  onComplete: () => void
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const node = canvas.current!
    const ctx = node.getContext('2d')
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (!ctx || motion.matches || document.hidden) {
      onComplete()
      return
    }
    const draw = createScene(effect, window.innerWidth < 821)
    let width = 0
    let height = 0
    let frame = 0
    let stopped = false
    function resize() {
      width = window.innerWidth
      height = window.innerHeight
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5)
      node.width = Math.round(width * ratio)
      node.height = Math.round(height * ratio)
      ctx!.setTransform(ratio, 0, 0, ratio, 0, 0)
    }
    function stop() {
      if (stopped) return
      stopped = true
      cancelAnimationFrame(frame)
      onComplete()
    }
    function preferenceChanged() {
      if (motion.matches) stop()
    }
    function visibilityChanged() {
      if (document.hidden) stop()
    }
    resize()
    const started = performance.now()
    function tick(now: number) {
      if (now - started >= CELEBRATION_DURATION_MS) {
        stop()
        return
      }
      draw(ctx!, width, height, (now - started) / 1000)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    window.addEventListener('resize', resize)
    motion.addEventListener('change', preferenceChanged)
    document.addEventListener('visibilitychange', visibilityChanged)
    return () => {
      stopped = true
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
      motion.removeEventListener('change', preferenceChanged)
      document.removeEventListener('visibilitychange', visibilityChanged)
    }
  }, [effect, onComplete])

  return (
    <canvas ref={canvas} className="victory-celebration" data-effect={effect} aria-hidden="true" />
  )
}
