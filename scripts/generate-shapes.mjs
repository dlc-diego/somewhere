// Offline silhouettes from the ODbL outlines bundled with world-countries.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { geoArea, geoBounds, geoAzimuthalEqualArea, geoPath } from 'd3-geo'

// Simplify only after projection: 0.25 SVG units is below a display pixel.
// Keep each island as a closed polygon, including sub-pixel atolls.
function simplifyRing(points) {
  const keep = new Set([0, points.length - 1])
  const stack = [[0, points.length - 1]]
  while (stack.length) {
    const [first, last] = stack.pop()
    const a = points[first],
      b = points[last]
    const dx = b[0] - a[0],
      dy = b[1] - a[1]
    let maximum = 0.25 ** 2,
      index = -1
    for (let i = first + 1; i < last; i++) {
      const p = points[i]
      const t =
        dx || dy
          ? Math.max(
              0,
              Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)),
            )
          : 0
      const distance = (p[0] - a[0] - t * dx) ** 2 + (p[1] - a[1] - t * dy) ** 2
      if (distance > maximum) {
        maximum = distance
        index = i
      }
    }
    if (index !== -1) {
      keep.add(index)
      stack.push([first, index], [index, last])
    }
  }
  if (keep.size < 4) {
    keep.add(Math.floor((points.length - 1) / 3))
    keep.add(Math.floor((2 * (points.length - 1)) / 3))
  }
  return [...keep].sort((a, b) => a - b).map((i) => points[i])
}

const countries = JSON.parse(readFileSync('src/data/countries.json', 'utf8'))
mkdirSync('public/shapes', { recursive: true })
const outlines = []
for (const country of countries) {
  const source = JSON.parse(
    readFileSync(`node_modules/world-countries/data/${country.id.toLowerCase()}.geo.json`, 'utf8'),
  )
  // D3 uses clockwise exterior rings for polygons smaller than a hemisphere.
  // Normalize each polygon independently (the upstream South Sudan outline differs).
  for (const feature of source.features) {
    const geometry = feature.geometry
    if (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon')
      throw new Error(`Unsupported outline: ${country.id}`)
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
    for (const coordinates of polygons) {
      if (geoArea({ type: 'Polygon', coordinates }) > 2 * Math.PI) {
        for (const ring of coordinates) ring.reverse()
      }
    }
  }
  const [[west, south], [east, north]] = geoBounds(source)
  const span = east >= west ? east - west : east + 360 - west
  const longitude = ((west + span / 2 + 540) % 360) - 180
  // A local, north-up projection preserves disconnected regions and wraps the date line.
  const projection = geoAzimuthalEqualArea()
    .rotate([-longitude, -(south + north) / 2, 0])
    .precision(0.2)
    .fitExtent(
      [
        [14, 14],
        [306, 206],
      ],
      source,
    )
  const path = geoPath(projection).digits(2)
  const d = source.features
    .flatMap(({ geometry }) => {
      const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
      return polygons.flatMap((polygon) =>
        polygon.map(
          (ring) =>
            'M' +
            simplifyRing(ring.map((point) => projection(point)))
              .map((point) => point.map((value) => +value.toFixed(2)).join(','))
              .join('L') +
            'Z',
        ),
      )
    })
    .join('')
  const area = geoArea(source)
  const bounds = path.bounds(source)
  if (!d || /NaN|Infinity/.test(d) || !(area > 0 && area < 2 * Math.PI))
    throw new Error(`Invalid silhouette: ${country.id}`)
  writeFileSync(
    `public/shapes/${country.id}.svg`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 220"><path fill="#e4ece8" stroke="#e4ece8" stroke-width="0.65" stroke-linejoin="round" d="${d}"/></svg>\n`,
  )
  outlines.push({ id: country.id, path: d, bounds, area })
}
// Publish the adapted outline database for attribution, inspection and reuse.
writeFileSync('public/shapes/outlines.json', JSON.stringify(outlines))
writeFileSync(
  'public/shapes/ODbL.txt',
  readFileSync('node_modules/world-countries/LICENSE', 'utf8')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+$/gm, ''),
)
writeFileSync(
  'public/shapes/README.txt',
  'Country silhouettes derived from world-countries (https://github.com/mledoze/countries), whose GeoJSON outlines originate from thematicmapping.org/world_borders. Adapted database: outlines.json; license: ODbL.txt. North-up local azimuthal equal-area projection, individually scaled to fit. Disconnected regions are preserved. Generalized, historical boundaries may differ from the globe and modern borders; no statement of sovereignty is implied.\n',
)
console.log(`Generated ${outlines.length} country silhouettes and the reusable outline database.`)
