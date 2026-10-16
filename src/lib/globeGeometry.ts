import { geoBounds, geoDistance, geoGraticule10, geoOrthographic, geoPath } from 'd3-geo'
import type { FeatureCollection } from 'geojson'

const radians = Math.PI / 180

/** Angular radius enclosing the entire 600 × 600 projection viewport. */
export function viewportRadius(zoom: number) {
  return Math.asin(Math.min(1, Math.hypot(302, 302) / (265 * zoom)))
}

export function prepareGlobeFeatures(world: FeatureCollection) {
  return world.features.map((geometry, index) => {
    const [[west, south], [east, north]] = geoBounds(geometry)
    const span = east >= west ? east - west : east + 360 - west
    return {
      key: `${geometry.id ?? 'unmapped'}-${index}`,
      geometry,
      center: [west + span / 2, (south + north) / 2] as [number, number],
      // A conservative spherical cap: latitude/longitude travel bounds the
      // great-circle distance, including date-line crossings and polar regions.
      radius: Math.min(Math.PI, ((span + north - south) / 2) * radians),
    }
  })
}

export type GlobeCamera = { rotation: [number, number, number]; zoom: number }
export type GlobeFrame = GlobeCamera & { paths: string[]; graticule: string }
export type GlobeWorkerRequest =
  { type: 'world'; world: FeatureCollection } | ({ type: 'camera'; sequence: number } & GlobeCamera)
export type GlobeWorkerReply = { sequence: number; frame: GlobeFrame }

const graticule = geoGraticule10()

export function projectGlobe(
  prepared: ReturnType<typeof prepareGlobeFeatures>,
  camera: GlobeCamera,
): GlobeFrame {
  const { rotation, zoom } = camera
  const projection = geoOrthographic()
    .translate([300, 300])
    .scale(265 * zoom)
    .rotate(rotation)
    .clipAngle(Math.min(90, (viewportRadius(zoom) * 180) / Math.PI + 1))
    .clipExtent([
      [0, 0],
      [600, 600],
    ])
    .precision(0.6)
  const path = geoPath(projection).digits(1)
  return {
    ...camera,
    paths: prepared.map((f) =>
      isFeatureVisible(f, [-rotation[0], -rotation[1]], zoom) ? path(f.geometry) || '' : '',
    ),
    graticule: path(graticule) || '',
  }
}

export function isFeatureVisible(
  feature: ReturnType<typeof prepareGlobeFeatures>[number],
  center: [number, number],
  zoom: number,
) {
  return geoDistance(feature.center, center) <= feature.radius + viewportRadius(zoom) + 1e-6
}
