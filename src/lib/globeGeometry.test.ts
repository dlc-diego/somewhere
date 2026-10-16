import { readFileSync } from 'node:fs'
import { geoOrthographic, geoPath } from 'd3-geo'
import { feature } from 'topojson-client'
import type { FeatureCollection } from 'geojson'
import type { GeometryCollection, Topology } from 'topojson-specification'
import { describe, expect, it } from 'vitest'
import { isFeatureVisible, prepareGlobeFeatures } from './globeGeometry'

const atlas = JSON.parse(readFileSync('public/data/world.json', 'utf8')) as Topology<{
  countries: GeometryCollection
}>
const world = feature(atlas, atlas.objects.countries) as FeatureCollection
const prepared = prepareGlobeFeatures(world)

describe('globe viewport culling', () => {
  it.each([
    [2, 46],
    [103.8, 1.35],
    [179, -17],
    [-150, 60],
    [0, 89],
    [180, 0],
  ])('never culls a visible country at longitude %s, latitude %s', (lng, lat) => {
    for (const zoom of [1, 3, 16, 32]) {
      const path = geoPath(
        geoOrthographic()
          .translate([300, 300])
          .scale(265 * zoom)
          .rotate([-lng, -lat, 0])
          .clipAngle(90)
          .clipExtent([
            [0, 0],
            [600, 600],
          ]),
      )
      for (const entry of prepared) {
        if (!isFeatureVisible(entry, [lng, lat], zoom)) {
          expect(path(entry.geometry), `${entry.key}, zoom ${zoom}`).toBeNull()
        }
      }
    }
  })
  it('skips most offscreen shapes in a close-up without changing feature identities', () => {
    expect(prepared.filter((f) => isFeatureVisible(f, [103.8, 1.35], 16)).length).toBeLessThan(
      prepared.length / 4,
    )
    expect(prepared.filter((f) => String(f.geometry.id) === '036')).toHaveLength(2)
    expect(prepared.find((f) => String(f.geometry.id) === '702')?.geometry).toBeDefined()
  })
})
