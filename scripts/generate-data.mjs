// Deterministic, offline data preparation. Run again only when updating sources.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs'
import countries from 'world-countries'
import { presimplify, simplify, quantile } from 'topojson-simplify'
import { quantize } from 'topojson-client'

const extraAliases = {
  USA: ['USA', 'US', 'America', 'United States of America'],
  GBR: ['UK', 'Britain', 'Great Britain', 'United Kingdom'],
  ARE: ['UAE', 'Emirates'],
  KOR: ['South Korea', 'Republic of Korea'],
  PRK: ['North Korea', 'DPRK'],
  COD: ['DR Congo', 'DRC', 'Congo Kinshasa'],
  COG: ['Republic of the Congo', 'Congo Brazzaville'],
  CIV: ['Ivory Coast', 'Cote d Ivoire'],
  CPV: ['Cape Verde'],
  SWZ: ['Swaziland'],
  CZE: ['Czech Republic'],
  VAT: ['Vatican', 'Vatican City', 'Holy See'],
  TLS: ['East Timor'],
  TUR: ['Turkey', 'Türkiye'],
  MMR: ['Burma'],
  MKD: ['Macedonia', 'North Macedonia'],
  PSE: ['Palestine', 'State of Palestine'],
}
const names = { COG: 'Republic of the Congo', COD: 'DR Congo', VAT: 'Vatican City' }
const playable = countries
  .filter((c) => c.unMember || ['VAT', 'PSE'].includes(c.cca3))
  .map((c) => ({
    id: c.cca3,
    numeric: c.ccn3,
    name: names[c.cca3] || c.name.common,
    flag: c.flag,
    region: c.region,
    lat: c.latlng[0],
    lng: c.latlng[1],
    small: c.area < 2500,
    aliases: [
      ...new Set([
        c.name.common,
        c.name.official,
        c.cca2,
        c.cca3,
        ...c.altSpellings,
        ...(extraAliases[c.cca3] || []),
      ]),
    ],
  }))
  .sort((a, b) => a.name.localeCompare(b.name, 'en'))
if (playable.length !== 195) throw new Error('Check country membership before updating data')
mkdirSync('src/data', { recursive: true })
mkdirSync('public/data', { recursive: true })
writeFileSync('src/data/countries.json', JSON.stringify(playable))
// Serve the derivative metadata database and its license for reuse and attribution.
writeFileSync('public/data/countries.json', JSON.stringify(playable))
copyFileSync('node_modules/world-countries/LICENSE', 'public/data/ODbL.txt')
copyFileSync('node_modules/world-atlas/LICENSE', 'public/data/world-atlas-LICENSE.txt')
const original = JSON.parse(readFileSync('node_modules/world-atlas/countries-50m.json', 'utf8'))
const weighted = presimplify(original)
const atlas = quantize(simplify(weighted, quantile(weighted, 0.8)), 1e5)
delete atlas.objects.land
writeFileSync('public/data/world.json', JSON.stringify(atlas))
console.log(
  `Generated ${playable.length} countries; world boundaries: ${JSON.stringify(atlas).length.toLocaleString()} bytes`,
)
