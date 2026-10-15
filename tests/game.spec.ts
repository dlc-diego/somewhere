import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

async function seed(page: Page, answer = 'FRA') {
  await page.addInitScript((answer) => {
    if (!localStorage.getItem('somewhere.round.v1'))
      localStorage.setItem(
        'somewhere.round.v1',
        JSON.stringify({ version: 1, answer, guesses: [] }),
      )
  }, answer)
}
async function guess(page: Page, query: string, name: string) {
  await page.getByRole('combobox').fill(query)
  await page
    .getByRole('option', { name: new RegExp(name) })
    .first()
    .click()
  await page.getByRole('button', { name: 'Make a guess' }).click()
}

test('complete journey: input, distance, duplicates, persistence, win and replay', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await seed(page)
  await page.goto('/')
  await expect(page.getByTestId('globe')).toHaveAttribute('data-ready', 'true')
  await expect(page.locator('[data-country="250"]').first()).toHaveAttribute('fill', '#bcc6b6')
  await expect(page.locator('[data-guessed="true"]')).toHaveCount(0)
  await page.getByRole('combobox').fill('Atlantis')
  await expect(page.getByText('No countries found.')).toBeVisible()
  await page.getByRole('button', { name: 'Make a guess' }).click()
  await expect(page.getByRole('alert')).toContainText('Select a country')
  await guess(page, 'Japan', 'Japan')
  await expect(page.getByRole('button', { name: /1\. Japan.*kilometers, Cold/ })).toBeVisible()
  await expect(page.locator('[data-country="392"]').first()).toHaveAttribute('data-guessed', 'true')
  await expect(page.locator('[data-country="250"]').first()).toHaveAttribute('fill', '#bcc6b6')
  await guess(page, 'Japan', 'Japan')
  await expect(page.getByRole('alert')).toContainText('Already explored')
  await expect(page.getByRole('list', { name: 'Guesses, newest first' }).locator('li')).toHaveCount(
    1,
  )
  await page.reload()
  await expect(page.getByRole('button', { name: /1\. Japan.*kilometers/ })).toBeVisible()
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('somewhere.round.v1')!).answer),
  ).toBe('FRA')
  await guess(page, 'France', 'France')
  await expect(page.getByRole('dialog', { name: 'You found the mystery country' })).toBeVisible()
  await expect(page.getByText('2 curious guesses.')).toBeVisible()
  await page.getByRole('button', { name: 'Close dialog' }).click()
  await expect(page.getByRole('heading', { name: 'You found your somewhere.' })).toBeVisible()
  await expect(page.getByRole('combobox')).toHaveCount(0)
  await expect(page.locator('[data-country="250"]').first()).toHaveAttribute('fill', '#28755b')
  await page.reload()
  await expect(page.getByRole('heading', { name: 'You found your somewhere.' })).toBeVisible()
  await page.getByRole('button', { name: 'Explore another round' }).click()
  await expect(page.getByRole('combobox')).toBeVisible()
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('somewhere.round.v1')!).answer),
  ).not.toBe('FRA')
  await expect(page.locator('[data-guessed="true"]')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('keyboard autocomplete, aliases, safe restart and keyboard globe', async ({ page }) => {
  await seed(page)
  await page.goto('/')
  const input = page.getByRole('combobox')
  await input.fill('UK')
  await input.press('Enter')
  await expect(input).toHaveValue('United Kingdom')
  await input.press('Enter')
  await expect(page.getByRole('list', { name: 'Guesses, newest first' }).locator('li')).toHaveCount(
    1,
  )
  await page.getByRole('button', { name: 'New round' }).click()
  await expect(page.getByRole('dialog', { name: 'Start a new round?' })).toBeVisible()
  await page.getByRole('button', { name: 'Keep exploring this round' }).click()
  await expect(page.getByRole('list', { name: 'Guesses, newest first' }).locator('li')).toHaveCount(
    1,
  )
  const globe = page.getByRole('group', { name: /Interactive globe/ })
  await expect(page.getByTestId('globe')).toHaveAttribute('data-ready', 'true')
  const before = await page.locator('[data-country="250"]').first().getAttribute('d')
  await globe.focus()
  await globe.press('ArrowRight')
  expect(await page.locator('[data-country="250"]').first().getAttribute('d')).not.toBe(before)
  await page.getByRole('button', { name: 'New round' }).click()
  await page.getByRole('button', { name: 'Start a fresh round' }).click()
  await expect(
    page.getByRole('heading', { name: 'Every adventure starts somewhere.' }),
  ).toBeVisible()
})

test('mobile-safe layout, help dialog, drag and map selection', async ({ page }) => {
  await seed(page)
  await page.goto('/')
  await expect(page.getByTestId('globe')).toHaveAttribute('data-ready', 'true')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('button', { name: 'How to play' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: 'Let’s explore' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  const france = page.locator('[data-country="250"]').first()
  const before = await france.getAttribute('d')
  const svg = page.locator('.globe-svg')
  await svg.scrollIntoViewIfNeeded()
  const box = (await svg.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 65, box.y + box.height / 2, { steps: 8 })
  await page.mouse.up()
  expect(await france.getAttribute('d')).not.toBe(before)
  await expect(page.getByRole('combobox')).toHaveValue('')
  await page.getByRole('button', { name: 'Reset globe view' }).click()
  // D3 projects Egypt's interior to a stable visible point in the initial view.
  const module = await import('d3-geo')
  const point = module.geoOrthographic().translate([300, 300]).scale(265).rotate([-12, -18, 0])([
    30, 27,
  ])!
  await page.mouse.click(
    box.x + (point[0] / 600) * box.width,
    box.y + (point[1] / 600) * box.height,
  )
  await expect(page.getByRole('combobox')).toHaveValue('Egypt')
  await expect(page.locator('[data-guessed="true"]')).toHaveCount(0)
})

test('small islands and a failed globe load are handled', async ({ page }) => {
  await seed(page)
  await page.route('**/data/world.json', (route) => route.abort())
  await page.goto('/')
  await expect(page.getByText('The globe couldn’t load.')).toBeVisible()
  await guess(page, 'Tuvalu', 'Tuvalu')
  await expect(page.getByRole('list', { name: 'Guesses, newest first' }).locator('li')).toHaveCount(
    1,
  )
  await page.unroute('**/data/world.json')
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByTestId('globe')).toHaveAttribute('data-ready', 'true')
  await expect(page.locator('circle[data-country="798"]')).toBeVisible()
})

test('corrupt saved data recovers without crashing', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('somewhere.round.v1', 'not-json'))
  await page.goto('/')
  await expect(
    page.getByText('Your saved round could not be read. A fresh round is ready.'),
  ).toBeVisible()
  await expect(page.getByRole('combobox')).toBeVisible()
})

test('production assets work from a repository subdirectory', async ({ page }) => {
  await seed(page)
  await page.goto('http://127.0.0.1:4174/wep-app/')
  await expect(page.getByTestId('globe')).toHaveAttribute('data-ready', 'true')
  await guess(page, 'Spain', 'Spain')
  await expect(page.getByRole('list', { name: 'Guesses, newest first' }).locator('li')).toHaveCount(
    1,
  )
  await page.reload()
  await expect(page.getByRole('list', { name: 'Guesses, newest first' }).locator('li')).toHaveCount(
    1,
  )
})

test('core screens have no automated accessibility violations', async ({ page }) => {
  await seed(page)
  await page.goto('/')
  await expect(page.getByTestId('globe')).toHaveAttribute('data-ready', 'true')
  async function check() {
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze()
    expect(result.violations).toEqual([])
  }
  await check()
  await page.getByRole('combobox').fill('United')
  await check()
  await guess(page, 'Spain', 'Spain')
  await check()
  await page.getByRole('button', { name: 'How to play' }).click()
  await check()
})

test('pinch gestures zoom without recording a guess', async ({ page, context }) => {
  await seed(page)
  await page.goto('/')
  await expect(page.getByTestId('globe')).toHaveAttribute('data-ready', 'true')
  const svg = page.locator('.globe-svg')
  await svg.scrollIntoViewIfNeeded()
  const box = (await svg.boundingBox())!
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  const cdp = await context.newCDPSession(page)
  const points = (spread: number) => [
    { x: center.x - spread, y: center.y, id: 1 },
    { x: center.x + spread, y: center.y, id: 2 },
  ]
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(30) })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(65) })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await expect
    .poll(async () => Number(await page.locator('circle[fill="url(#ocean)"]').getAttribute('r')))
    .toBeGreaterThan(265)
  await expect(page.getByRole('combobox')).toHaveValue('')
  await expect(page.locator('[data-guessed="true"]')).toHaveCount(0)
  await cdp.detach()
})

test('unavailable browser storage warns but does not prevent gameplay', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new Error('Storage disabled')
    }
    Storage.prototype.setItem = () => {
      throw new Error('Storage disabled')
    }
  })
  await page.goto('/')
  await expect(page.getByText('Browser storage is unavailable.', { exact: false })).toBeVisible()
  await guess(page, 'Japan', 'Japan')
  // A randomly selected Japan answer may win; history remains underneath the dialog.
  await expect(
    page.getByRole('list', { name: 'Guesses, newest first', includeHidden: true }).locator('li'),
  ).toHaveCount(1)
})

test('compact Val layout, animated guess arrival and mobile globe centering', async ({
  page,
  isMobile,
}) => {
  await seed(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Built for Val', level: 1 })).toBeVisible()
  await expect(page.locator('footer')).toContainText('Built for Val')
  await expect(page.getByText('A hunch is a good start.')).toHaveCount(0)
  await expect(page.getByText('Follow your curiosity')).toHaveCount(0)
  await expect(page.getByTestId('globe')).toHaveAttribute('data-ready', 'true')
  const search = (await page.getByRole('region', { name: 'Country search' }).boundingBox())!
  const map = (await page.getByRole('region', { name: 'Explore the world' }).boundingBox())!
  if (isMobile) expect(search.y + search.height).toBeLessThan(map.y)
  else expect(map.x + map.width).toBeLessThan(search.x)

  const france = page.locator('[data-country="250"]').first()
  await page.getByRole('combobox').fill('Tuvalu')
  await page.getByRole('option', { name: /Tuvalu/ }).click()
  // Record actual projected geometry around the guess: there should be a short
  // pause followed by intermediate frames, rather than an instant camera jump.
  const samples = await page.evaluate(async () => {
    const path = () => document.querySelector('[data-country="250"]')!.getAttribute('d')
    const before = path()
    document.querySelector<HTMLButtonElement>('.guess-button')!.click()
    await new Promise((resolve) => setTimeout(resolve, 120))
    const paused = path()
    await new Promise((resolve) => setTimeout(resolve, 530))
    return { before, paused, midway: path() }
  })
  expect(samples.paused).toBe(samples.before)
  expect(samples.midway).not.toBe(samples.before)
  const marker = page.locator('circle[data-country="798"]')
  await expect(marker).toBeVisible()
  await expect.poll(async () => Number(await marker.getAttribute('cx'))).toBeCloseTo(300, 3)
  await expect.poll(async () => Number(await marker.getAttribute('cy'))).toBeCloseTo(300, 3)
  expect(await france.getAttribute('d')).not.toBe(samples.midway)
  if (isMobile) {
    await expect
      .poll(async () =>
        page.getByTestId('globe').evaluate((el) => {
          const bounds = el.getBoundingClientRect()
          return Math.abs(bounds.top + bounds.height / 2 - innerHeight / 2)
        }),
      )
      .toBeLessThan(5)
    expect(await page.getByRole('combobox').evaluate((el) => el === document.activeElement)).toBe(
      false,
    )
  }
})

test('manual globe controls cancel a pending flight and reduced motion skips it', async ({
  page,
}) => {
  await seed(page)
  await page.goto('/')
  await expect(page.getByTestId('globe')).toHaveAttribute('data-ready', 'true')
  const france = page.locator('[data-country="250"]').first()
  const initial = await france.getAttribute('d')
  await guess(page, 'Japan', 'Japan')
  await page.getByRole('button', { name: 'Reset globe view' }).click()
  // A canceled flight must stay canceled even after its original finish time.
  await page.waitForTimeout(1350)
  await expect(france).toHaveAttribute('d', initial!)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await guess(page, 'Tuvalu', 'Tuvalu')
  const marker = page.locator('circle[data-country="798"]')
  await expect(marker).toBeVisible()
  expect(Number(await marker.getAttribute('cx'))).toBeCloseTo(300, 3)
  expect(Number(await marker.getAttribute('cy'))).toBeCloseTo(300, 3)
})
