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
async function seedCapitals(page: Page, active = false) {
  await page.addInitScript((active) => {
    if (!localStorage.getItem('somewhere.capitals.v1'))
      localStorage.setItem(
        'somewhere.capitals.v1',
        JSON.stringify({
          version: 2,
          mode: 'capitals',
          revealed: false,
          answer: 'FRA',
          guesses: [],
        }),
      )
    if (active && !localStorage.getItem('somewhere.mode.v1'))
      localStorage.setItem('somewhere.mode.v1', 'capitals')
  }, active)
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
  await expect(
    page.getByRole('list', { name: 'Guesses, closest first' }).locator('li'),
  ).toHaveCount(1)
  await page.reload()
  await expect(page.getByRole('button', { name: /1\. Japan.*kilometers/ })).toBeVisible()
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('somewhere.round.v1')!).answer),
  ).toBe('FRA')
  await guess(page, 'France', 'France')
  await expect(page.getByRole('dialog', { name: 'You found the mystery country' })).toBeVisible({
    timeout: 8000,
  })
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
  await expect(
    page.getByRole('list', { name: 'Guesses, closest first' }).locator('li'),
  ).toHaveCount(1)
  await page.getByRole('button', { name: 'New round' }).click()
  await expect(page.getByRole('dialog', { name: 'Start a new round?' })).toBeVisible()
  await page.getByRole('button', { name: 'Keep exploring this round' }).click()
  await expect(
    page.getByRole('list', { name: 'Guesses, closest first' }).locator('li'),
  ).toHaveCount(1)
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

test('mobile-safe layout, help dialog, drag and map taps never select guesses', async ({
  page,
}) => {
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
  await expect(page.getByRole('combobox')).toHaveValue('')
  await expect(page.locator('[data-guessed="true"]')).toHaveCount(0)
})

test('small islands and a failed globe load are handled', async ({ page }) => {
  await seed(page)
  await page.route('**/data/world.json', (route) => route.abort())
  await page.goto('/')
  await expect(page.getByText('The globe couldn’t load.')).toBeVisible()
  await guess(page, 'Tuvalu', 'Tuvalu')
  await expect(
    page.getByRole('list', { name: 'Guesses, closest first' }).locator('li'),
  ).toHaveCount(1)
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
  await expect(
    page.getByRole('list', { name: 'Guesses, closest first' }).locator('li'),
  ).toHaveCount(1)
  await page.reload()
  await expect(
    page.getByRole('list', { name: 'Guesses, closest first' }).locator('li'),
  ).toHaveCount(1)
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
    page.getByRole('list', { name: 'Guesses, closest first', includeHidden: true }).locator('li'),
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
  await expect(page.locator('.guess-country-blink, .guess-marker-blink')).toHaveCount(0)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await guess(page, 'Tuvalu', 'Tuvalu')
  const marker = page.locator('circle[data-country="798"]')
  await expect(marker).toBeVisible()
  expect(Number(await marker.getAttribute('cx'))).toBeCloseTo(300, 3)
  expect(Number(await marker.getAttribute('cy'))).toBeCloseTo(300, 3)
  await expect(page.locator('.guess-country-blink, .guess-marker-blink')).toHaveCount(0)
})

test('adjacent guesses get the hottest feedback and the closest stays highlighted first', async ({
  page,
}) => {
  await seed(page)
  await page.goto('/')
  await expect(page.getByTestId('globe')).toHaveAttribute('data-ready', 'true')
  await guess(page, 'Germany', 'Germany')
  await guess(page, 'Japan', 'Japan')
  await guess(page, 'UK', 'United Kingdom')
  const list = page.getByRole('list', { name: 'Guesses, closest first' })
  const rows = list.locator('li')
  await expect(rows).toHaveCount(3)
  await expect(rows.nth(0).getByRole('button')).toHaveAccessibleName(
    /1\. Germany.*Adjacent.*Closest guess/,
  )
  await expect(rows.nth(1)).toContainText('United Kingdom')
  await expect(rows.nth(2)).toContainText('Japan')
  expect(await rows.first().evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(
    await rows.nth(1).evaluate((el) => getComputedStyle(el).backgroundColor),
  )
  await expect(page.locator('[data-country="276"]').first()).toHaveAttribute('fill', '#9e2439')
  await expect(page.locator('[data-country="250"]').first()).toHaveAttribute('fill', '#bcc6b6')
  await page.reload()
  await expect(rows.nth(0).getByRole('button')).toHaveAccessibleName(
    /1\. Germany.*Adjacent.*Closest guess/,
  )
  const a11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
  expect(a11y.violations).toEqual([])
})

test('capital mode uses cities, preserves both rounds, and supports win and replay', async ({
  page,
}) => {
  await seed(page)
  await seedCapitals(page)
  await page.goto('/')
  await guess(page, 'Germany', 'Germany')
  await page.getByRole('button', { name: 'Capitals', exact: true }).click()
  await expect(page.getByRole('combobox')).toHaveAttribute('placeholder', 'Search for a capital…')
  await expect(page.getByRole('list', { name: 'Guesses, closest first' })).toHaveCount(0)
  await expect(page.locator('circle[data-capital="FRA"]')).toHaveCount(0)
  await guess(page, 'London', 'London')
  const list = page.getByRole('list', { name: 'Guesses, closest first' })
  await expect(list.getByRole('button')).toHaveAccessibleName(
    /1\. London, United Kingdom, 34\d kilometers, Hot/,
  )
  await guess(page, 'London', 'London')
  await expect(page.getByRole('alert')).toContainText('different capital')
  await expect(list.locator('li')).toHaveCount(1)
  await expect(page.locator('circle[data-capital="GBR"]')).toBeVisible()
  await expect
    .poll(async () => Number(await page.locator('circle[data-capital="GBR"]').getAttribute('cx')))
    .toBeCloseTo(300, 3)
  await page.getByRole('button', { name: 'Countries', exact: true }).click()
  await expect(list.getByRole('button')).toHaveAccessibleName(/1\. Germany.*Adjacent/)
  await expect(page.getByRole('combobox')).toHaveAttribute('placeholder', 'Search for a country…')
  await page.getByRole('button', { name: 'Capitals', exact: true }).click()
  await expect(list).toContainText('London')
  await page.reload()
  await expect(page.getByRole('button', { name: 'Capitals', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(list).toContainText('London')
  await guess(page, 'Berlin', 'Berlin')
  await expect(list.locator('li').first()).toContainText('London')
  await expect(list.getByRole('button', { name: /Berlin.*Adjacent/ })).toBeVisible()
  await expect(page.locator('[data-country="250"]').first()).toHaveAttribute('fill', '#bcc6b6')
  await expect(page.locator('circle[data-capital="FRA"]')).toHaveCount(0)
  await guess(page, 'Paris', 'Paris')
  await expect(page.getByRole('dialog', { name: 'You found the mystery capital' })).toBeVisible({
    timeout: 8000,
  })
  await expect(page.getByRole('dialog')).toContainText('Paris')
  await expect(page.getByRole('dialog')).toContainText('3 curious guesses')
  await page.getByRole('button', { name: 'Close dialog' }).click()
  await expect(page.getByRole('button', { name: 'Give up and reveal answer' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Explore another round' }).click()
  await expect(page.getByRole('combobox')).toHaveAttribute('placeholder', 'Search for a capital…')
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('somewhere.capitals.v1')!),
  )
  expect(saved).toMatchObject({ mode: 'capitals', revealed: false, guesses: [] })
  expect(saved.answer).not.toBe('FRA')
  const a11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
  expect(a11y.violations).toEqual([])
})

for (const mode of ['countries', 'capitals'] as const) {
  test(`giving up a ${mode} round reveals the answer without inventing a win`, async ({ page }) => {
    await seed(page)
    await seedCapitals(page, mode === 'capitals')
    await page.goto('/')
    await expect(page.getByTestId('globe')).toHaveAttribute('data-ready', 'true')
    const button = page.getByRole('button', { name: 'Give up and reveal answer', exact: true })
    const footer = (await page.locator('footer').boundingBox())!
    const revealButton = (await button.boundingBox())!
    expect(revealButton.y).toBeGreaterThanOrEqual(footer.y + footer.height)
    await guess(
      page,
      mode === 'capitals' ? 'Tokyo' : 'Japan',
      mode === 'capitals' ? 'Tokyo' : 'Japan',
    )
    await expect(page.locator('[data-revealed="true"]')).toHaveCount(0)
    await button.click()
    await expect(page.getByRole('dialog', { name: 'Answer revealed' })).toBeVisible()
    const answer = mode === 'capitals' ? 'Paris' : 'France'
    await expect(page.getByRole('dialog')).toContainText(answer)
    await expect(page.getByRole('dialog')).toContainText('Answer revealed after 1')
    await expect(page.locator('path[data-country="250"]')).toHaveAttribute('data-guessed', 'false')
    await expect(page.locator('path[data-country="250"]')).toHaveAttribute('data-revealed', 'true')
    await expect(page.locator('path[data-country="250"]')).toHaveAttribute('fill', '#a77332')
    const key = mode === 'capitals' ? 'somewhere.capitals.v1' : 'somewhere.round.v1'
    const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), key)
    expect(saved).toMatchObject({ revealed: true, guesses: ['JPN'], answer: 'FRA', mode })
    const a11y = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze()
    expect(a11y.violations).toEqual([])
    await page.getByRole('button', { name: 'Close dialog' }).click()
    await expect(page.getByRole('combobox')).toHaveCount(0)
    await expect(button).toHaveCount(0)
    await page.reload()
    await expect(page.getByRole('heading', { name: `The answer was ${answer}.` })).toBeVisible()
    await expect(
      page.getByRole('list', { name: 'Guesses, closest first' }).locator('li'),
    ).toHaveCount(1)
    await page.getByRole('button', { name: 'Explore another round' }).click()
    await expect(page.getByRole('combobox')).toBeVisible()
    await expect(page.locator('[data-revealed="true"]')).toHaveCount(0)
    await expect(button).toBeVisible()
  })
}

test('giving up without guesses works and mode switching cancels a pending result', async ({
  page,
}) => {
  await seed(page)
  await seedCapitals(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Give up and reveal answer' }).click()
  await page.getByRole('button', { name: 'Capitals', exact: true }).click()
  await page.waitForTimeout(1500)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('combobox')).toHaveAttribute('placeholder', 'Search for a capital…')
  await page.getByRole('button', { name: 'Countries', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'The answer was France.' })).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Every adventure starts somewhere.' }),
  ).toBeVisible()
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('somewhere.round.v1')!).guesses),
  ).toEqual([])
})

for (const mode of ['countries', 'capitals'] as const) {
  test(`${mode} blink starts after arrival, uses heat feedback and stops on its own`, async ({
    page,
  }) => {
    await seed(page)
    await seedCapitals(page, mode === 'capitals')
    await page.goto('/')
    await expect(page.getByTestId('globe')).toHaveAttribute('data-ready', 'true')
    await page.getByRole('combobox').fill(mode === 'capitals' ? 'Tokyo' : 'Japan')
    await page.getByRole('option', { name: /Tokyo|Japan/ }).click()
    const observed = await page.evaluate(async () => {
      const path = document.querySelector<SVGPathElement>('path[data-country="392"]')!
      const before = path.getAttribute('d')
      let movementBeforeBlink = false
      document.querySelector<HTMLButtonElement>('.guess-button')!.click()
      const deadline = performance.now() + 5000
      while (!path.classList.contains('guess-country-blink') && performance.now() < deadline) {
        if (path.getAttribute('d') !== before) movementBeforeBlink = true
        await new Promise(requestAnimationFrame)
      }
      const blinkStarted = path.classList.contains('guess-country-blink')
      const arrivedPath = path.getAttribute('d')
      await new Promise((resolve) => setTimeout(resolve, 180))
      return { movementBeforeBlink, blinkStarted, arrivedPath, laterPath: path.getAttribute('d') }
    })
    expect(observed.movementBeforeBlink).toBe(true)
    expect(observed.blinkStarted).toBe(true)
    // Geometry is already settled while the blink is running.
    expect(observed.laterPath).toBe(observed.arrivedPath)
    const path = page.locator('path[data-country="392"]')
    await expect(path).toHaveAttribute('fill', '#576ca6')
    await expect
      .poll(() => path.evaluate((el) => getComputedStyle(el).fill))
      .not.toBe('rgb(87, 108, 166)')
    await expect(page.locator('path[data-country="250"]')).not.toHaveClass(/guess-country-blink/)
    if (mode === 'capitals') {
      const marker = page.locator('circle[data-capital="JPN"]')
      await expect(marker).toHaveClass('guess-marker-blink')
      expect(Number(await marker.getAttribute('cx'))).toBeCloseTo(300, 3)
      expect(Number(await marker.getAttribute('cy'))).toBeCloseTo(300, 3)
      await expect
        .poll(() => marker.evaluate((el) => Number(getComputedStyle(el).fillOpacity)))
        .toBeLessThan(0.9)
    }
    await expect(page.locator('.guess-country-blink, .guess-marker-blink')).toHaveCount(0, {
      timeout: 6500,
    })
    await expect(path).toHaveCSS('fill', 'rgb(87, 108, 166)')
    if (mode === 'capitals')
      await expect(page.locator('circle[data-capital="JPN"]')).toHaveCSS('fill-opacity', '1')
  })
}

test('another guess replaces the blink and manual controls cancel it', async ({ page }) => {
  await seed(page)
  await page.goto('/')
  await expect(page.getByTestId('globe')).toHaveAttribute('data-ready', 'true')
  await guess(page, 'Japan', 'Japan')
  await expect(page.locator('path[data-country="392"]')).toHaveClass(/guess-country-blink/)
  await guess(page, 'Germany', 'Germany')
  await expect(page.locator('path[data-country="392"]')).not.toHaveClass(/guess-country-blink/)
  await expect(page.locator('path[data-country="276"]')).toHaveClass(/guess-country-blink/)
  await expect(page.locator('path[data-country="276"]')).toHaveAttribute('fill', '#9e2439')
  await page.getByRole('button', { name: 'Reset globe view' }).click()
  await expect(page.locator('.guess-country-blink, .guess-marker-blink')).toHaveCount(0)
  await page.waitForTimeout(1500)
  await expect(page.locator('.guess-country-blink, .guess-marker-blink')).toHaveCount(0)
})
