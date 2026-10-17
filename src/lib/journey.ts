import exclusions from '../data/journey-border-exclusions.json'
import { areAdjacent, countries, countryById } from './countries'

export const journeyColors = {
  visited: '#6b95bd',
  current: 'var(--logo-accent)',
  destination: '#e2bc67',
  arrived: '#28755b',
}

// One primary, connected land area per country. Political borders on overseas
// territories, detached exclaves and other islands cannot teleport the traveler.
const edgeKey = (a: string, b: string) => [a, b].sort().join(':')
const excludedEdges = new Set(exclusions.map(({ countries: [a, b] }) => edgeKey(a, b)))

export function canCrossBorder(a: string, b: string): boolean {
  const from = countryById.get(a)
  const to = countryById.get(b)
  return Boolean(from && to && areAdjacent(from, to) && !excludedEdges.has(edgeKey(a, b)))
}

const neighbors = new Map(
  countries.map((country) => [
    country.id,
    countries.filter((other) => canCrossBorder(country.id, other.id)).map((other) => other.id),
  ]),
)

export function landConnectionFor(id: string): string {
  const country = countryById.get(id)
  if (!country) return ''
  if (!neighbors.get(id)?.length) return country.name
  if (id === 'DOM' || id === 'HTI') return 'Hispaniola'
  return country.continent === 'North America' || country.continent === 'South America'
    ? 'Americas'
    : 'Africa–Eurasia'
}

export function shortestBorderRoute(start: string, destination: string): string[] | null {
  if (!countryById.has(start) || !countryById.has(destination)) return null
  const parents = new Map<string, string | null>([[start, null]])
  const queue = [start]
  for (let index = 0; index < queue.length; index++) {
    const current = queue[index]
    if (current === destination) {
      const route: string[] = []
      for (let at: string | null = current; at !== null; at = parents.get(at)!) route.push(at)
      return route.reverse()
    }
    for (const next of neighbors.get(current)!) {
      if (parents.has(next)) continue
      parents.set(next, current)
      queue.push(next)
    }
  }
  return null
}

// Three to six crossings give some exploration without asking for an epic expedition.
const routes = countries.flatMap((start) => {
  const distances = new Map([[start.id, 0]])
  const queue = [start.id]
  for (let index = 0; index < queue.length; index++) {
    const current = queue[index]
    const distance = distances.get(current)!
    if (distance === 6) continue
    for (const next of neighbors.get(current)!) {
      if (distances.has(next)) continue
      distances.set(next, distance + 1)
      queue.push(next)
    }
  }
  return [...distances]
    .filter(([, distance]) => distance >= 3)
    .map(([destination]) => ({ start: start.id, destination }))
})

export function randomBorderJourney(previousDestination?: string) {
  const pool = routes.filter((route) => route.destination !== previousDestination)
  const sample = new Uint32Array(1)
  const ceiling = Math.floor(2 ** 32 / pool.length) * pool.length
  do {
    crypto.getRandomValues(sample)
  } while (sample[0] >= ceiling)
  return pool[sample[0] % pool.length]
}
