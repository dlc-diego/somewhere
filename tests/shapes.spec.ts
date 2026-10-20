import { changeTheme } from './helpers/menu'
import { expect, test, type Page, type Route } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

async function seed(page: Page, answer = 'FRA', guesses: string[] = []) {
  await page.addInitScript(
    ({ answer, guesses }) => {
      for (const mode of ['countries', 'capitals', 'flags', 'shapes']) {
        const key = mode === 'countries' ? 'somewhere.round.v1' : `somewhere.${mode}.v1`
        if (!localStorage.getItem(key))
          localStorage.setItem(
            key,
            JSON.stringify({
              version: 2,
              mode,
              answer,
              revealed: false,
              guesses: mode === 'shapes' ? guesses : [],
              ...(['flags', 'shapes'].includes(mode) ? { hintUsed: false } : {}),
            }),
          )
      }
      if (!localStorage.getItem('somewhere.mode.v1'))
        localStorage.setItem('somewhere.mode.v1', 'shapes')
    },
    { answer, guesses },
  )
}
async function guess(page: Page, name: string) {
  await page.getByRole('combobox', { name: /^Search for a / }).fill(name)
  await page
    .getByRole('option', { name: new RegExp(name) })
    .first()
    .click()
  await page.getByRole('button', { name: 'Make a guess' }).click()
}
async function loadedShape(page: Page, name = 'Mystery country shape') {
  const image = page.getByRole('img', { name, exact: true })
  await expect(image).toBeVisible()
  await expect
    .poll(() => image.evaluate((el) => (el as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0)
  return image
}

test('shape journey: dropdown modes, neutral clue, hint, duplicates, persistence and a celebrated win', async ({
  page,
}) => {
  await seed(page)
  await page.goto('/')
  await expect(page.getByTestId('globe')).toHaveAttribute('data-ready', 'true')
  const modes = page.getByRole('combobox', { name: 'Game mode', exact: true }).locator('option')
  expect((await modes.allTextContents()).map((s) => s.trim())).toEqual([
    'Countries',
    'Capitals',
    'Flags',
    'Shapes',
    'Border Journey',
  ])
  const image = await loadedShape(page)
  await expect(image).toHaveAttribute('src', /\/shapes\/FRA\.svg$/)
  await expect(page.getByRole('img', { name: /France/ })).toHaveCount(0)
  await expect(page.locator('path[data-country="250"]')).toHaveAttribute('fill', '#bcc6b6')
  await page.getByRole('button', { name: 'Hint: reveal continent' }).click()
  await expect(page.locator('.continent-hint')).toHaveText('Continent: Europe')
  await expect(page.getByRole('region', { name: 'Your journey' })).toContainText('0 guesses')
  await guess(page, 'Germany')
  await expect(page.getByRole('list', { name: 'Guesses, closest first' })).toContainText('Adjacent')
  await guess(page, 'Germany')
  await expect(page.getByRole('alert')).toContainText('Already explored')
  await page.reload()
  await loadedShape(page)
  await expect(page.getByRole('combobox', { name: 'Game mode', exact: true })).toHaveValue('shapes')
  await expect(page.locator('.continent-hint')).toContainText('Europe')
  for (const mode of ['Countries', 'Capitals', 'Flags']) {
    await page
      .getByRole('combobox', { name: 'Game mode', exact: true })
      .selectOption({ label: mode })
    await expect(page.getByRole('region', { name: 'Your journey' })).toContainText('0 guesses')
  }
  await page
    .getByRole('combobox', { name: 'Game mode', exact: true })
    .selectOption({ label: 'Shapes' })
  await expect(page.getByRole('region', { name: 'Your journey' })).toContainText('1 guess')
  await changeTheme(page, 'dark')
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([])
  await guess(page, 'France')
  const celebration = page.locator('.victory-celebration')
  await expect(celebration).toHaveCount(1)
  const original = (await celebration.elementHandle())!
  await expect(page.locator('path[data-country="250"]')).toHaveClass(/guess-country-blink/)
  await expect(page.locator('path[data-country="250"]')).toHaveAttribute('fill', '#28755b')
  await loadedShape(page, 'France shape')
  await expect(page.getByRole('heading', { name: 'You found your somewhere.' })).toBeVisible()
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('somewhere.shapes.v1')!))
  expect(saved).toMatchObject({
    mode: 'shapes',
    answer: 'FRA',
    hintUsed: true,
    revealed: false,
    guesses: ['DEU', 'FRA'],
  })
  await page.getByRole('button', { name: 'Explore another round' }).click()
  expect(await original.evaluate((el) => el.isConnected)).toBe(true)
  await expect(
    page.getByRole('img', { name: 'Mystery country shape', exact: true }),
  ).not.toHaveAttribute('src', /\/FRA\.svg$/)
  await expect(page.getByRole('button', { name: 'Hint: reveal continent' })).toBeVisible()
  await expect(page.locator('.continent-hint')).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('shape loading and retry preserve the round and continent hint', async ({ page }) => {
  await seed(page)
  let pending: Route | undefined
  await page.route('**/shapes/FRA.svg', (route) => {
    pending = route
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('Drawing the mystery shape…')).toBeVisible()
  await expect.poll(() => Boolean(pending)).toBe(true)
  await pending!.abort()
  await expect(page.getByText('The shape couldn’t load.')).toBeVisible()
  await page.getByRole('button', { name: 'Hint: reveal continent' }).click()
  await guess(page, 'Japan')
  await page.unroute('**/shapes/FRA.svg')
  await page.getByRole('button', { name: 'Try shape again' }).click()
  await loadedShape(page)
  await expect(page.locator('.continent-hint')).toHaveText('Continent: Europe')
  await expect(page.getByRole('region', { name: 'Your journey' })).toContainText('1 guess')
  await expect(page.locator('.victory-celebration')).toHaveCount(0)
})

for (const guesses of [[], ['JPN']]) {
  test(`revealing a shape after ${guesses.length} guesses preserves the result and supports replay`, async ({
    page,
  }) => {
    await seed(page, 'FRA', guesses)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    await page.getByRole('button', { name: 'Hint: reveal continent' }).click()
    await page.getByRole('button', { name: 'Give up and reveal answer' }).click()
    await loadedShape(page, 'France shape')
    await expect(page.locator('.search-card')).toContainText('The answer was France.')
    await expect(page.locator('.continent-hint')).toContainText('Europe')
    await expect(page.locator('path[data-country="250"]')).toHaveAttribute('data-revealed', 'true')
    await expect(page.locator('path[data-country="250"]')).toHaveAttribute('fill', '#28755b')
    await expect(page.locator('.victory-celebration')).toHaveCount(0)
    await page.reload()
    await loadedShape(page, 'France shape')
    const saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('somewhere.shapes.v1')!),
    )
    expect(saved).toMatchObject({ mode: 'shapes', guesses, revealed: true, hintUsed: true })
    await page.getByRole('button', { name: 'Explore another round' }).click()
    await expect(page.getByRole('combobox', { name: /^Search for a / })).toBeVisible()
    await expect(page.locator('.continent-hint')).toHaveCount(0)
  })
}

test('tiny-island silhouettes render real pixels from a repository subpath', async ({ page }) => {
  await seed(page, 'TUV')
  await page.goto('http://127.0.0.1:4174/wep-app/')
  const image = await loadedShape(page)
  expect(new URL(await image.evaluate((el) => (el as HTMLImageElement).src)).pathname).toBe(
    '/wep-app/shapes/TUV.svg',
  )
  const painted = await image.evaluate((el) => {
    const canvas = document.createElement('canvas')
    canvas.width = 320
    canvas.height = 220
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(el as HTMLImageElement, 0, 0, 320, 220)
    return ctx.getImageData(0, 0, 320, 220).data.filter((value, i) => i % 4 === 3 && value > 20)
      .length
  })
  expect(painted).toBeGreaterThan(3)
  await page.getByRole('button', { name: 'Hint: reveal continent' }).click()
  await expect(page.locator('.continent-hint')).toContainText('Oceania')
  await guess(page, 'Tuvalu')
  await expect(page.getByRole('heading', { name: 'You found your somewhere.' })).toBeVisible()
})
