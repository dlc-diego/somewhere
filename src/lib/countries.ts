import data from '../data/countries.json'

export type GameMode = 'countries' | 'capitals'
export interface Location {
  name: string
  lat: number
  lng: number
}

export interface Country {
  id: string
  numeric: string
  name: string
  flag: string
  region: string
  lat: number
  lng: number
  small: boolean
  borders: string[]
  aliases: string[]
  capital: Location & { aliases: string[] }
}

export const countries: Country[] = data
export const countryById = new Map(countries.map((c) => [c.id, c]))
export const countryByNumeric = new Map(countries.map((c) => [c.numeric, c]))

export function areAdjacent(a: Country, b: Country): boolean {
  return a.id !== b.id && (a.borders.includes(b.id) || b.borders.includes(a.id))
}

export function locationFor(country: Country, mode: GameMode): Location {
  return mode === 'capitals' ? country.capital : country
}

export function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

const countryIndex = countries.map((country) => ({
  country,
  names: [...new Set([country.name, ...country.aliases].map(normalizeName))],
}))
const capitalIndex = countries.map((country) => ({
  country,
  names: [...new Set([country.capital.name, ...country.capital.aliases].map(normalizeName))],
}))

export function searchCountries(query: string, limit = 8): Country[] {
  return searchLocations(query, 'countries', limit)
}

export function searchLocations(query: string, mode: GameMode, limit = 8): Country[] {
  const normalized = normalizeName(query)
  if (!normalized) return []
  return (mode === 'capitals' ? capitalIndex : countryIndex)
    .map(({ country, names }) => ({
      country,
      rank: names.some((n) => n === normalized)
        ? 0
        : names.some((n) => n.startsWith(normalized))
          ? 1
          : names.some((n) => n.includes(normalized))
            ? 2
            : 3,
    }))
    .filter((c) => c.rank < 3)
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        locationFor(a.country, mode).name.localeCompare(locationFor(b.country, mode).name),
    )
    .slice(0, limit)
    .map((c) => c.country)
}

export function exactCountry(query: string): Country | undefined {
  return exactLocation(query, 'countries')
}

export function exactLocation(query: string, mode: GameMode): Country | undefined {
  const normalized = normalizeName(query)
  return (mode === 'capitals' ? capitalIndex : countryIndex).find(({ names }) =>
    names.includes(normalized),
  )?.country
}
