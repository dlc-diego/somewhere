import { people } from '../data/people'
import { createMysteryGame } from './mystery'

export const IDENTIFY_KEY = 'someone.identify.v1'
export interface Portrait {
  id: string
  personId: string
  file: string
  title: string
  creator: string
  credit: string
  attribution: string
  sourceUrl: string
  originalUrl: string
  downloadUrl: string
  license: { name: string; url: string; code: string; attributionRequired: boolean }
  changes: string
  restrictions: string
  verifiedAt: string
  width: number
  height: number
  sha256: string
  sourceSha256: string
  commonsSha1: string
}
export function validatePortraits(value: unknown): Portrait[] {
  const fail = () => {
    throw new Error('The licensed portrait collection is unavailable. Please try again later.')
  }
  if (!value || typeof value !== 'object') return fail()
  const bank = value as { version?: unknown; images?: unknown }
  if (bank.version !== 1 || !Array.isArray(bank.images) || bank.images.length !== 80) return fail()
  const personIds = new Set(people.map((person) => person.id))
  const ids = new Set<string>()
  const owners = new Set<string>()
  for (const raw of bank.images) {
    if (!raw || typeof raw !== 'object') return fail()
    const p = raw as Portrait
    if (
      !/^portrait-\d{3}$/.test(p.id) ||
      p.file !== `${p.id}.webp` ||
      !personIds.has(p.personId) ||
      ids.has(p.id) ||
      owners.has(p.personId)
    )
      return fail()
    if (
      ![p.title, p.creator, p.changes, p.verifiedAt, p.sha256, p.sourceSha256].every(
        (text) => typeof text === 'string' && text.length > 0,
      )
    )
      return fail()
    if (
      ![p.credit, p.attribution, p.restrictions, p.commonsSha1].every(
        (text) => typeof text === 'string',
      )
    )
      return fail()
    if (
      !/^[a-f0-9]{64}$/.test(p.sha256) ||
      !/^[a-f0-9]{64}$/.test(p.sourceSha256) ||
      !Number.isFinite(Date.parse(p.verifiedAt))
    )
      return fail()
    if (
      !Number.isInteger(p.width) ||
      !Number.isInteger(p.height) ||
      p.width < 180 ||
      p.height < 180 ||
      p.width > 640 ||
      p.height > 800
    )
      return fail()
    try {
      if (
        new URL(p.sourceUrl).origin !== 'https://commons.wikimedia.org' ||
        !new URL(p.sourceUrl).pathname.startsWith('/wiki/File:')
      )
        return fail()
      if (
        new URL(p.originalUrl).origin !== 'https://upload.wikimedia.org' ||
        !['https://upload.wikimedia.org', 'https://thumb.wikimedia.org'].includes(
          new URL(p.downloadUrl).origin,
        )
      )
        return fail()
      if (
        !p.license ||
        typeof p.license.name !== 'string' ||
        typeof p.license.attributionRequired !== 'boolean'
      )
        return fail()
      const cc = /^CC-(BY|BY-SA)-(1\.0|2\.0|2\.5|3\.0|4\.0)$/.exec(p.license.code)
      if (cc) {
        if (
          !p.license.attributionRequired ||
          p.license.url !== `https://creativecommons.org/licenses/${cc[1].toLowerCase()}/${cc[2]}/`
        )
          return fail()
      } else if (p.license.code === 'CC0-1.0') {
        if (
          p.license.url !== 'https://creativecommons.org/publicdomain/zero/1.0/' ||
          p.license.attributionRequired
        )
          return fail()
      } else if (p.license.code === 'Public-Domain') {
        if (p.license.url !== p.sourceUrl + '#Licensing' || p.license.attributionRequired)
          return fail()
      } else return fail()
    } catch {
      return fail()
    }
    ids.add(p.id)
    owners.add(p.personId)
  }
  return bank.images as Portrait[]
}
export async function fetchPortraits(signal?: AbortSignal): Promise<Portrait[]> {
  const response = await fetch(`${import.meta.env.BASE_URL}portraits/manifest.json`, { signal })
  if (!response.ok) throw new Error('The portrait collection could not load. Please try again.')
  return validatePortraits(await response.json())
}
export function identifyGame(portraits: readonly Portrait[]) {
  const byPerson = new Map(people.map((person) => [person.id, person]))
  return createMysteryGame(
    portraits.map((portrait) => {
      const person = byPerson.get(portrait.personId)!
      return {
        ...person,
        id: portrait.id,
        clues: ['Identify the person in the portrait.', person.clues[3]],
      }
    }),
  )
}
export function loadIdentify(game: ReturnType<typeof identifyGame>) {
  try {
    const raw = localStorage.getItem(IDENTIFY_KEY)
    const session = game.parseSession(raw)
    return {
      session: session || game.newSession(),
      warning:
        raw && !session
          ? 'The saved Identify Me round could not be read. A fresh portrait is ready.'
          : '',
    }
  } catch {
    return {
      session: game.newSession(),
      warning: 'Browser storage is unavailable. This round may not survive a refresh.',
    }
  }
}
