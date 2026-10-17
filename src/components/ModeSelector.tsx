import { ChevronDown, Compass } from 'lucide-react'
import type { GameMode } from '../lib/countries'

export default function ModeSelector({
  mode,
  onChange,
}: {
  mode: GameMode
  onChange: (mode: GameMode) => void
}) {
  return (
    <div className="mode-selector">
      <Compass size={18} aria-hidden="true" />
      <label className="sr-only" htmlFor="game-mode">
        Game mode
      </label>
      <select
        id="game-mode"
        value={mode}
        onChange={(event) => onChange(event.target.value as GameMode)}
      >
        <option value="countries">Countries</option>
        <option value="capitals">Capitals</option>
        <option value="flags">Flags</option>
        <option value="shapes">Shapes</option>
        <option value="journey">Border Journey</option>
      </select>
      <ChevronDown size={17} aria-hidden="true" />
    </div>
  )
}
