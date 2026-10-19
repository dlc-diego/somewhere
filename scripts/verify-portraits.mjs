// Production gate: assets and primary-source licensing receipts must agree before deployment.
import { readFile, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
const root = new URL('../public/portraits/', import.meta.url)
const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'))
const roster = JSON.parse(
  await readFile(new URL('data/portrait-roster.json', import.meta.url), 'utf8'),
)
assert.equal(manifest.version, 1)
assert.equal(
  manifest.images.length,
  80,
  'Identify Me requires 80 verified portraits; no partial pack may deploy',
)
assert.equal(new Set(manifest.images.map((image) => image.id)).size, 80)
assert.equal(new Set(manifest.images.map((image) => image.personId)).size, 80)
const sourceById = new Map(roster.map((entry) => [entry.id, entry]))
for (const image of manifest.images) {
  assert.equal(sourceById.get(image.id)?.personId, image.personId)
  assert.match(image.id, /^portrait-\d{3}$/)
  assert.equal(image.file, `${image.id}.webp`)
  const bytes = await readFile(new URL(image.file, root))
  assert.equal(bytes.subarray(0, 4).toString(), 'RIFF')
  assert.equal(bytes.subarray(8, 12).toString(), 'WEBP')
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    image.sha256,
    `${image.id}: image changed without updating its record`,
  )
  assert.ok(
    image.creator && image.title && image.changes && Number.isFinite(Date.parse(image.verifiedAt)),
  )
  assert.match(image.sourceSha256, /^[a-f0-9]{64}$/)
  const receipt = JSON.parse(await readFile(new URL(`${image.id}.source.json`, root), 'utf8'))
  assert.equal(receipt.api, 'https://commons.wikimedia.org/w/api.php')
  assert.equal(receipt.retrievedAt, image.verifiedAt)
  const info = receipt.response.query.pages[0].imageinfo[0]
  assert.equal(receipt.response.query.pages[0].title, sourceById.get(image.id)?.commonsFile)
  assert.equal(info.descriptionurl, image.sourceUrl)
  assert.equal(info.url, image.originalUrl)
  assert.equal(info.sha1, image.commonsSha1)
  const metadata = info.extmetadata
  const name = metadata.LicenseShortName?.value
  const url = metadata.LicenseUrl?.value?.replace('http://', 'https://').replace(/\/$/, '')
  const cc = /^CC-(BY|BY-SA)-(1\.0|2\.0|2\.5|3\.0|4\.0)$/.exec(image.license.code)
  if (cc) {
    assert.equal(name, `CC ${cc[1]} ${cc[2]}`)
    assert.equal(
      image.license.url,
      `https://creativecommons.org/licenses/${cc[1].toLowerCase()}/${cc[2]}/`,
    )
    assert.equal(url, image.license.url.replace(/\/$/, ''))
    assert.ok(metadata.Artist?.value && image.license.attributionRequired)
  } else if (image.license.code === 'CC0-1.0') {
    assert.equal(name, 'CC0')
    assert.match(
      url,
      /^https:\/\/creativecommons.org\/publicdomain\/zero\/1\.0(?:\/(?:deed(?:\.[a-z-]+)?|legalcode(?:\.[a-z-]+)?))?$/,
    )
    assert.equal(image.license.url, 'https://creativecommons.org/publicdomain/zero/1.0/')
    assert.equal(image.license.attributionRequired, false)
  } else {
    assert.equal(image.license.code, 'Public-Domain')
    assert.equal(name.toLowerCase(), 'public domain')
    assert.equal(metadata.Copyrighted.value.toLowerCase(), 'false')
    assert.equal(image.license.url, image.sourceUrl + '#Licensing')
    assert.equal(image.license.attributionRequired, false)
  }
  assert.ok(image.width >= 180 && image.height >= 180 && image.width <= 640 && image.height <= 800)
}
const files = await readdir(root)
assert.equal(files.filter((file) => file.endsWith('.webp')).length, 80)
const credits = await readFile(new URL('CREDITS.md', root), 'utf8')
for (const image of manifest.images) {
  assert.ok(credits.includes(image.id))
  assert.ok(credits.includes(image.sourceUrl))
  assert.ok(credits.includes(image.license.url))
  assert.ok(credits.includes(image.creator))
}
console.log(
  'Verified 80 portraits: image hashes, licensing snapshots, source links and attribution records agree.',
)
