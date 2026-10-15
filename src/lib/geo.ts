export type Coordinates = { lat: number; lng: number }
const radians = (degrees: number) => (degrees * Math.PI) / 180

/** Great-circle distance between representative centers on a mean-radius Earth. */
export function distanceKm(a: Coordinates, b: Coordinates): number {
  const deltaLat = radians(b.lat - a.lat)
  const deltaLng = radians(b.lng - a.lng)
  const h =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(deltaLng / 2) ** 2
  return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, h))))
}

export type Temperature = 'found' | 'hot' | 'warm' | 'cool' | 'cold'
export const temperatures: Record<Temperature, { label: string; color: string; symbol: string }> = {
  found: { label: 'Found it!', color: '#28755b', symbol: '✓' },
  hot: { label: 'Hot', color: '#c64e33', symbol: '●' },
  warm: { label: 'Warm', color: '#d78a36', symbol: '◕' },
  cool: { label: 'Cool', color: '#4e919f', symbol: '◑' },
  cold: { label: 'Cold', color: '#576ca6', symbol: '○' },
}
export function temperatureFor(distance: number, correct = false): Temperature {
  if (correct) return 'found'
  if (distance < 1000) return 'hot'
  if (distance < 3000) return 'warm'
  if (distance < 7000) return 'cool'
  return 'cold'
}
export function formatDistance(distance: number): string {
  if (distance > 0 && distance < 1) return '<1'
  return Math.round(distance).toLocaleString('en-US')
}
