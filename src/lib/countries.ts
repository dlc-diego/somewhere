import data from '../data/countries.json'

export interface Country {
  id: string
  numeric: string
  name: string
  flag: string
  region: string
  lat: number
  lng: number
  small: boolean
  aliases: string[]
}

export const countries: Country[] = data
export const countryById = new Map(countries.map((c) => [c.id, c]))
export const countryByNumeric = new Map(countries.map((c) => [c.numeric, c]))

export function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

const searchIndex = countries.map((country) => ({
  country,
  names: [...new Set([country.name, ...country.aliases].map(normalizeName))],
}))

export function searchCountries(query: string, limit = 8): Country[] {
  const normalized = normalizeName(query)
  if (!normalized) return []
  return searchIndex
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
    .sort((a, b) => a.rank - b.rank || a.country.name.localeCompare(b.country.name))
    .slice(0, limit)
    .map((c) => c.country)
}

export function exactCountry(query: string): Country | undefined {
  const normalized = normalizeName(query)
  return searchIndex.find(({ names }) => names.includes(normalized))?.country
}
