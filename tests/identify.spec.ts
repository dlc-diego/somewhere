import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { IDENTIFY_KEY } from '../src/lib/identify'
import type { MysteryRound, Session } from '../src/lib/mystery'
import manifest from '../public/portraits/manifest.json' with { type: 'json' }

async function seed(page: Page, id = 'portrait-001') {
  await page.addInitScript(
    ({ key, id }) => {
      if (!localStorage.getItem('somewhere.experience.v1'))
        localStorage.setItem('somewhere.experience.v1', 'someone')
      if (!localStorage.getItem('someone.mode.v1'))
        localStorage.setItem('someone.mode.v1', 'identify')
      if (!localStorage.getItem(key))
        localStorage.setItem(
          key,
          JSON.stringify({
            version: 1,
            seen: [],
            round: { version: 1, id, cluesShown: 1, guesses: [], revealed: false },
          }),
        )
    },
    { key: IDENTIFY_KEY, id },
  )
}
const answer = (page: Page) => page.getByRole('textbox', { name: 'Your answer', exact: true })
const saved = (page: Page): Promise<Session<MysteryRound>> =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), IDENTIFY_KEY)
async function guess(page: Page, name: string) {
  await answer(page).fill(name)
  await page.getByRole('button', { name: 'Make a guess', exact: true }).click()
}

test('portraits, free clue, aliases and duplicate handling persist independently from Who am I', async ({
  page,
}) => {
  await seed(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const photo = page.getByRole('img', { name: 'Mystery person to identify' })
  await expect(photo).toBeVisible()
  expect(
    await photo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
  ).toBe(true)
  await expect(photo).toHaveAttribute('src', /portrait-001.webp$/)
  await expect(page.locator('.portrait-hint')).toHaveCount(0)
  await guess(page, 'Wrong person')
  await guess(page, ' WRONG PERSON! ')
  await expect(page.getByRole('alert')).toContainText('already tried')
  await page.getByRole('button', { name: 'Reveal a clue', exact: true }).click()
  await expect(page.locator('.portrait-hint')).toBeVisible()
  expect((await saved(page)).round.guesses).toEqual(['Wrong person'])
  await page.reload()
  await expect(page.locator('.portrait-hint')).toBeVisible()
  await expect(page.getByRole('list', { name: 'Identify Me guesses' })).toContainText(
    'Wrong person',
  )
  await answer(page).fill('An unfinished portrait answer')
  const before = await saved(page)
  await page.getByRole('combobox', { name: 'Someone game mode' }).selectOption('who')
  await guess(page, 'Another wrong person')
  const other = await page.evaluate(() => localStorage.getItem('someone.who.v1'))
  await page.getByRole('combobox', { name: 'Someone game mode' }).selectOption('identify')
  await expect(answer(page)).toHaveValue('An unfinished portrait answer')
  expect(await saved(page)).toEqual(before)
  await guess(page, '  EINSTEIN! ')
  await expect(
    page.getByRole('heading', { name: 'You found them. Albert Einstein!' }),
  ).toBeVisible()
  await expect(page.getByRole('img', { name: 'Portrait of Albert Einstein' })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('someone.who.v1'))).toBe(other)
  await page.reload()
  await expect(
    page.getByRole('heading', { name: 'You found them. Albert Einstein!' }),
  ).toBeVisible()
  await expect(page.locator('.victory-celebration')).toHaveCount(0)
  await page.getByRole('button', { name: 'Try another portrait', exact: true }).click()
  await expect(answer(page)).toBeVisible()
  expect((await saved(page)).round.id).not.toBe('portrait-001')
  expect((await saved(page)).seen).toContain('portrait-001')
})

test('real asset credits include creator, source, license and changes and giving up never celebrates', async ({
  page,
}) => {
  const portrait = manifest.images.find((image) => image.license.code.startsWith('CC-BY-SA'))!
  await seed(page, portrait.id)
  await page.goto('/')
  const line = page.locator('.portrait-credit-line')
  await expect(line).toContainText(portrait.creator)
  await expect(line.getByRole('link')).toHaveAttribute('href', portrait.license.url)
  await page.getByRole('button', { name: 'Image credits', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Image credits' })
  await expect(dialog).toContainText(portrait.title)
  await expect(dialog).toContainText(portrait.creator)
  await expect(dialog).toContainText(portrait.changes)
  await expect(dialog).toContainText('shared under the same license')
  await expect(dialog.getByRole('link', { name: 'Wikimedia Commons file page' })).toHaveAttribute(
    'href',
    portrait.sourceUrl,
  )
  const credits = await page.request.get('/portraits/CREDITS.md')
  expect(credits.ok()).toBe(true)
  expect(await credits.text()).toContain(portrait.creator)
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click()
  await page.getByRole('button', { name: 'Give up and reveal answer', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Try another portrait', exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('img', { name: /^Portrait of / })).toBeVisible()
  expect((await saved(page)).round.revealed).toBe(true)
  await expect(page.locator('.victory-celebration')).toHaveCount(0)
  await page.reload()
  await expect(
    page.getByRole('button', { name: 'Try another portrait', exact: true }),
  ).toBeVisible()
  await expect(page.locator('.victory-celebration')).toHaveCount(0)
})

test('correct portraits celebrate immediately and continue across rounds and game switches', async ({
  page,
}) => {
  await seed(page)
  await page.goto('/')
  await expect(answer(page)).toBeVisible()
  await page.clock.install()
  await page.clock.pauseAt(new Date(Date.now() + 1000))
  await guess(page, 'Einstein')
  const canvas = page.locator('.victory-celebration')
  await expect(canvas).toHaveCount(1)
  const original = (await canvas.elementHandle())!
  await page.getByRole('button', { name: 'Try another portrait', exact: true }).click()
  await page.getByRole('combobox', { name: 'Someone game mode' }).selectOption('who')
  expect(await original.evaluate((el) => el.isConnected)).toBe(true)
  await page.getByRole('combobox', { name: 'Choose experience' }).selectOption('something')
  await page.clock.runFor(900)
  expect(await original.evaluate((el) => el.isConnected)).toBe(true)
  await page.clock.runFor(5000)
  await expect(canvas).toHaveCount(0)
})

test('portrait collection and image failures offer working retries without changing the round', async ({
  page,
}) => {
  await seed(page)
  let manifestFails = true
  let imageFails = true
  await page.route('**/portraits/manifest.json', (route) =>
    manifestFails ? route.fulfill({ status: 503, body: 'Unavailable' }) : route.continue(),
  )
  await page.route('**/portraits/portrait-001.webp*', (route) =>
    imageFails ? route.abort() : route.continue(),
  )
  await page.goto('/')
  await expect(page.getByRole('alert')).toContainText('collection could not load')
  manifestFails = false
  await page.getByRole('button', { name: 'Try loading portraits again' }).click()
  await expect(page.getByRole('alert')).toContainText('picture couldn’t load')
  imageFails = false
  await page.getByRole('button', { name: 'Try loading picture again' }).click()
  await expect(page.getByRole('img', { name: 'Mystery person to identify' })).toBeVisible()
  expect((await saved(page)).round.id).toBe('portrait-001')
  await guess(page, 'Einstein')
  await expect(
    page.getByRole('heading', { name: 'You found them. Albert Einstein!' }),
  ).toBeVisible()
})

test('all 80 real WebP portraits decode under a repository subpath without external image requests', async ({
  page,
}) => {
  await seed(page)
  const external: string[] = []
  page.on('request', (request) => {
    if (request.resourceType() === 'image' && !request.url().startsWith('http://127.0.0.1'))
      external.push(request.url())
  })
  await page.goto('http://127.0.0.1:4174/wep-app/')
  await expect(answer(page)).toBeVisible()
  await expect(page.locator('.portrait-frame img')).toHaveAttribute('src', /^\.\/portraits\//)
  const dimensions = await page.evaluate(
    async (files) => {
      const result: number[][] = []
      for (let start = 0; start < files.length; start += 4) {
        result.push(
          ...(await Promise.all(
            files.slice(start, start + 4).map(async (file) => {
              const image = new Image()
              image.src = `./portraits/${file}`
              await image.decode()
              return [image.naturalWidth, image.naturalHeight]
            }),
          )),
        )
      }
      return result
    },
    manifest.images.map((image) => image.file),
  )
  expect(dimensions).toEqual(manifest.images.map((image) => [image.width, image.height]))
  expect(external).toEqual([])
})

test('portrait game and credits remain accessible at 320px in both themes', async ({ page }) => {
  await seed(page)
  await page.setViewportSize({ width: 320, height: 740 })
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'light' })
  await page.goto('/')
  await expect(answer(page)).toBeVisible()
  for (const theme of ['light', 'dark']) {
    if (theme === 'dark') await page.getByRole('button', { name: 'Switch to dark mode' }).click()
    await page.getByRole('button', { name: 'Image credits', exact: true }).click()
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([])
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click()
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.getByRole('button', { name: 'How to play', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'How to play Someone' })).toContainText(
    'Identify Me',
  )
})
