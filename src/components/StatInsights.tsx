import type { statistics } from '../lib/playerData'
type Row = ReturnType<typeof statistics>[number]
const number = (value: number | null) =>
  value === null ? '—' : new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value)
export default function StatInsights({ row }: { row: Row }) {
  if (!row.trackedClueWins && !row.trackedHintWins && !row.trackedJourneyWins) return null
  return (
    <p className="stats-insights">
      {row.trackedClueWins > 0 && (
        <span>
          {number(row.averageClues)} average {row.mode === 'identify' ? 'text clues' : 'clues'} on{' '}
          {row.trackedClueWins} tracked {row.trackedClueWins === 1 ? 'win' : 'wins'} ·{' '}
          {row.firstClueWins} {row.mode === 'identify' ? 'portrait-only wins' : 'first-clue wins'}
        </span>
      )}
      {row.trackedHintWins > 0 && (
        <span>
          {row.noHintWins}/{row.trackedHintWins} tracked wins without a continent hint
        </span>
      )}
      {row.trackedJourneyWins > 0 && (
        <span>
          {row.optimalJourneys}/{row.trackedJourneyWins} optimal routes ·{' '}
          {number(row.averageExtraCrossings)} average extra crossings
        </span>
      )}
    </p>
  )
}
