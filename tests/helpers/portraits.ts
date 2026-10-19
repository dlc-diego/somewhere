// Synthetic metadata for validator tests only. These are not real photographs or public assets.
import { people } from '../../src/data/people'
import type { Portrait } from '../../src/lib/identify'
export function portraitFixture(): { version: 1; images: Portrait[] } {
  return {
    version: 1,
    images: people.map((person, index) => ({
      id: `portrait-${String(index + 1).padStart(3, '0')}`,
      personId: person.id,
      file: `portrait-${String(index + 1).padStart(3, '0')}.webp`,
      title: 'Synthetic metadata for a test illustration',
      creator: 'Test fixture creator',
      credit: 'Test-only synthetic fixture',
      attribution: '',
      sourceUrl: `https://commons.wikimedia.org/wiki/File:Test_${index}.svg`,
      originalUrl: `https://upload.wikimedia.org/test-${index}.svg`,
      downloadUrl: `https://upload.wikimedia.org/test-${index}.svg`,
      license: {
        name: 'CC BY-SA 4.0',
        url: 'https://creativecommons.org/licenses/by-sa/4.0/',
        code: 'CC-BY-SA-4.0',
        attributionRequired: true,
      },
      changes: 'Test fixture only; no production image.',
      restrictions: '',
      verifiedAt: '2026-10-19T00:00:00Z',
      width: 400,
      height: 500,
      sha256: 'a'.repeat(64),
      sourceSha256: 'b'.repeat(64),
      commonsSha1: 'c'.repeat(40),
    })),
  }
}
