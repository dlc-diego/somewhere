import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const mode = (page: Page) => page.getByRole('combobox', { name: 'Game mode', exact: true })
const search = (page: Page) =>
  page.getByRole('combobox', { name: 'Search for a country', exact: true })
const history = (page: Page) => page.getByRole('list', { name: 'Route, in travel order' })
async function seed(page: Page, guesses: string[] = [], start = 'PRT') {
  await page.addInitScript(
    ({ guesses, start }) => {
      if (!localStorage.getItem('somewhere.journey.v1'))
        localStorage.setItem(
          'somewhere.journey.v1',
          JSON.stringify({
            version: 2,
            mode: 'journey',
            start,
            answer: 'ITA',
            guesses,
            revealed: false,
          }),
        )
      if (!localStorage.getItem('somewhere.mode.v1'))
        localStorage.setItem('somewhere.mode.v1', 'journey')
    },
    { guesses, start },
  )
}
async function cross(page: Page, name: string) {
  await search(page).fill(name)
  await page
    .getByRole('listbox')
    .getByRole('option', { name: new RegExp(name) })
    .first()
    .click()
  await page.getByRole('button', { name: 'Cross the border' }).click()
}

test('border journey validates crossings, backtracks, saves, switches modes and celebrates arrival', async ({
  page,
}) => {
  await seed(page)
  await page.goto('/')
  await expect(mode(page)).toHaveValue('journey')
  await expect(page.getByTestId('globe')).toHaveAttribute('data-ready', 'true')
  await expect(page.locator('.journey-challenge')).toContainText('Portugal')
  await expect(page.locator('.journey-challenge')).toContainText('Italy')
  await expect(history(page).locator('li')).toHaveCount(1)
  await expect(page.locator('path[data-country="380"]')).toHaveAttribute('fill', '#e2bc67')
  const destination = page.getByRole('button', {
    name: 'Destination: Italy. Show on globe.',
    exact: true,
  })
  await destination.click()
  await expect(page.locator('path[data-country="380"]')).toHaveClass(/guess-country-blink/)
  await expect(history(page).locator('li')).toHaveCount(1)
  await expect(search(page)).toBeEnabled()
  await expect(page.locator('.victory-celebration')).toHaveCount(0)
  await cross(page, 'Italy')
  await expect(page.getByRole('alert')).toContainText(
    'does not share a continuous mainland border with Portugal',
  )
  await expect(history(page).locator('li')).toHaveCount(1)
  await cross(page, 'Portugal')
  await expect(page.getByRole('alert')).toContainText('already in Portugal')
  await cross(page, 'Spain')
  await expect(page.locator('.journey-instruction')).toContainText('You’re in Spain')
  await expect(page.getByTestId('traveled-route')).toHaveAttribute('d', /M/)
  await expect(page.locator('path[data-country="724"]')).toHaveClass(/guess-country-blink/)
  await cross(page, 'Portugal')
  await cross(page, 'Spain')
  await page.reload()
  await expect(history(page).locator('li')).toHaveCount(4)
  await expect(page.locator('.journey-instruction')).toContainText('You’re in Spain')
  await mode(page).selectOption('countries')
  await expect(page.locator('.journey-challenge')).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Your journey' })).toContainText('0 guesses')
  await mode(page).selectOption('journey')
  await expect(history(page).locator('li')).toHaveCount(4)
  await page.getByRole('button', { name: 'Switch to dark mode' }).click()
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([])
  await cross(page, 'France')
  await cross(page, 'Italy')
  const celebration = page.locator('.victory-celebration')
  await expect(celebration).toHaveCount(1)
  const original = (await celebration.elementHandle())!
  await expect(page.locator('.journey-instruction')).toContainText(
    'Destination reached in 5 crossings!',
  )
  await expect(page.locator('.journey-instruction')).toContainText(
    'shortest starting route takes 3 crossings',
  )
  await expect(page.locator('path[data-country="380"]')).toHaveAttribute('fill', '#28755b')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(history(page).locator('li')).toHaveCount(6)
  await page.getByRole('button', { name: 'Explore another round' }).click()
  expect(await original.evaluate((el) => el.isConnected)).toBe(true)
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('somewhere.journey.v1')!))
  expect(saved.answer).not.toBe('ITA')
  expect(saved.guesses).toEqual([])
  await expect(history(page).locator('li')).toHaveCount(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

for (const guesses of [[], ['ESP']]) {
  test(`reveal offers a valid remaining route after ${guesses.length} crossings without a win`, async ({
    page,
  }) => {
    await seed(page, guesses)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    await page.getByRole('button', { name: 'Give up and reveal answer' }).click()
    const revealed = page.getByRole('list', { name: 'Revealed route' })
    await expect(revealed.locator('li')).toHaveCount(guesses.length ? 3 : 4)
    await expect(revealed).toContainText('Spain')
    await expect(revealed).toContainText('France')
    await expect(revealed).toContainText('Italy')
    await expect(page.locator('path[data-country="380"]')).toHaveAttribute('fill', '#28755b')
    await expect(page.getByTestId('revealed-route')).toHaveAttribute('d', /M/)
    await expect(page.locator('.victory-celebration')).toHaveCount(0)
    await expect(history(page).locator('li')).toHaveCount(guesses.length + 1)
    await page.reload()
    await expect(revealed.locator('li')).toHaveCount(guesses.length ? 3 : 4)
    await expect(page.getByRole('button', { name: 'Give up and reveal answer' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Explore another round' }).click()
    await expect(search(page)).toBeVisible()
    await expect(revealed).toHaveCount(0)
  })
}

test('corrupt island route recovers and journey works from a repository subpath', async ({
  page,
}) => {
  await seed(page, [], 'JPN')
  await page.goto('http://127.0.0.1:4174/wep-app/')
  await expect(
    page.getByText('Your saved round could not be read. A fresh round is ready.'),
  ).toBeVisible()
  await expect(mode(page)).toHaveValue('journey')
  await expect(search(page)).toBeEnabled()
  await expect(page.getByTestId('globe')).toHaveAttribute('data-ready', 'true')
  await page.getByRole('button', { name: 'How to play' }).click()
  await expect(page.getByRole('dialog')).toContainText('Border Journey')
  await expect(page.getByRole('dialog')).toContainText('land border')
  await page.getByRole('button', { name: 'Let’s explore' }).click()
  const before = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('somewhere.journey.v1')!),
  )
  await page.reload()
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('somewhere.journey.v1')!)),
  ).toEqual(before)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

for (const fixture of [
  { start: 'CAN', answer: 'DNK', name: 'Denmark', mainland: 'United States', mainlandId: 'USA' },
  { start: 'FRA', answer: 'ITA', name: 'Brazil', mainland: 'Spain', mainlandId: 'ESP' },
  { start: 'ESP', answer: 'ITA', name: 'Morocco', mainland: 'France', mainlandId: 'FRA' },
]) {
  test(`mainland-only crossings reject ${fixture.start} to ${fixture.name}`, async ({ page }) => {
    await page.addInitScript(({ start, answer }) => {
      // CAN→DNK would now be an invalid saved round. Use a reachable destination
      // so this checks a rejected crossing during play instead of save recovery.
      localStorage.setItem('somewhere.mode.v1', 'journey')
      localStorage.setItem(
        'somewhere.journey.v1',
        JSON.stringify({
          version: 2,
          mode: 'journey',
          start,
          answer: start === 'CAN' ? 'BRA' : answer,
          guesses: [],
          revealed: false,
        }),
      )
    }, fixture)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    await cross(page, fixture.name)
    await expect(page.getByRole('alert')).toContainText(
      'does not share a continuous mainland border',
    )
    await expect(history(page).locator('li')).toHaveCount(1)
    await cross(page, fixture.mainland)
    await expect(history(page).locator('li')).toHaveCount(2)
    expect(
      await page.evaluate(() => JSON.parse(localStorage.getItem('somewhere.journey.v1')!).guesses),
    ).toEqual([fixture.mainlandId])
  })
}

test('legacy transatlantic routes recover instead of preserving an ocean jump', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('somewhere.mode.v1', 'journey')
    localStorage.setItem(
      'somewhere.journey.v1',
      JSON.stringify({
        version: 2,
        mode: 'journey',
        start: 'CAN',
        answer: 'FRA',
        guesses: ['DNK', 'DEU'],
        revealed: false,
      }),
    )
  })
  await page.goto('/')
  await expect(
    page.getByText('Your saved round could not be read. A fresh round is ready.'),
  ).toBeVisible()
  await expect(history(page).locator('li')).toHaveCount(1)
  const round = await page.evaluate(() => JSON.parse(localStorage.getItem('somewhere.journey.v1')!))
  expect(round.guesses).toEqual([])
  expect(round.start === 'CAN' && round.answer === 'FRA').toBe(false)
})

test('Malaysia destination focus and arrival stay on the peninsula', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('somewhere.mode.v1', 'journey')
    localStorage.setItem(
      'somewhere.journey.v1',
      JSON.stringify({
        version: 2,
        mode: 'journey',
        start: 'THA',
        answer: 'MYS',
        guesses: [],
        revealed: false,
      }),
    )
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await expect(page.getByTestId('globe')).toHaveAttribute('data-ready', 'true')
  await page
    .getByRole('button', { name: 'Destination: Malaysia. Show on globe.', exact: true })
    .click()
  const marker = page.locator('circle[data-country="458"]')
  await expect.poll(async () => Number(await marker.getAttribute('cx'))).toBeCloseTo(300, 3)
  await expect.poll(async () => Number(await marker.getAttribute('cy'))).toBeCloseTo(300, 3)
  await expect(history(page).locator('li')).toHaveCount(1)
  await cross(page, 'Malaysia')
  await expect(page.locator('.journey-instruction')).toContainText(
    'Destination reached in 1 crossing!',
  )
  await expect(marker).toHaveAttribute('fill', '#28755b')
  await expect.poll(async () => Number(await marker.getAttribute('cx'))).toBeCloseTo(300, 3)
  await expect.poll(async () => Number(await marker.getAttribute('cy'))).toBeCloseTo(300, 3)
})
