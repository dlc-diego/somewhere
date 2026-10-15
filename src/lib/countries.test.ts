import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { countries, countryByNumeric } from './countries'

const atlas = JSON.parse(readFileSync('public/data/world.json', 'utf8')) as {
  objects: { countries: { geometries: { id?: string; type: string }[] } }
}
const shapes = atlas.objects.countries.geometries

describe('bundled boundary identity matching', () => {
  it('matches every playable country except the documented Tuvalu marker fallback', () => {
    const ids = new Set(shapes.map((s) => String(s.id).padStart(3, '0')))
    expect(countries.filter((c) => !ids.has(c.numeric)).map((c) => c.id)).toEqual(['TUV'])
  })
  it('uses numeric identity, including leading zeroes and multi-part regions', () => {
    expect(countryByNumeric.get('036')?.id).toBe('AUS')
    expect(countryByNumeric.get('250')?.id).toBe('FRA')
    expect(shapes.filter((s) => s.id === '036')).toHaveLength(2)
    expect(shapes.some((s) => s.id === '360' && s.type === 'MultiPolygon')).toBe(true)
  })
  it('leaves unmapped disputed features outside the playable set', () => {
    expect(shapes.filter((s) => !s.id).length).toBeGreaterThan(0)
    expect(countryByNumeric.has('undefined')).toBe(false)
    expect(countryByNumeric.has('-99')).toBe(false)
  })
})
