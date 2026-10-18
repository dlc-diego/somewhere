import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

async function seed(page: Page, perfectRound = false) {
  await page.addInitScript((perfectRound) => {
    const values = {
      'somewhere.experience.v1': 'something',
      'somewhere.theme.v1': 'dark',
      'something.mode.v1': perfectRound ? 'trivia' : 'mystery',
      'somewhere.round.v1': JSON.stringify({
        version: 2,
        mode: 'countries',
        answer: 'FRA',
        guesses: ['DEU'],
        revealed: false,
      }),
      'something.trivia.v1': JSON.stringify({
        version: 1,
        seen: [],
        round: {
          version: 1,
          ids: Array.from({ length: 10 }, (_, i) => `animal-${i + 11}`),
          orders: Array.from({ length: 10 }, () => [0, 1, 2, 3]),
          responses: perfectRound ? Array(9).fill(0) : [0, 0],
          index: perfectRound ? 9 : 1,
        },
      }),
      'something.mystery.v1': JSON.stringify({
        version: 1,
        seen: [],
        round: { version: 1, id: 'aurora', cluesShown: 3, guesses: ['rainbow'], revealed: false },
      }),
    }
    for (const [key, value] of Object.entries(values))
      if (!localStorage.getItem(key)) localStorage.setItem(key, value)
  }, perfectRound)
}
const checkButton = (page: Page) =>
  page.getByRole('button', { name: 'Check for updates', exact: true })
const ready = (page: Page) =>
  expect(page.getByRole('heading', { name: 'What am I', exact: true })).toBeVisible()
const savedState = (page: Page) =>
  page.evaluate(() =>
    Object.fromEntries(
      Object.entries(localStorage).filter(
        ([key]) => key.startsWith('somewhere.') || key.startsWith('something.'),
      ),
    ),
  )

test('header icon checks the matching build without reloading or touching saved games', async ({
  page,
  request,
}) => {
  const { version } = await (await request.get('/version.json')).json()
  await seed(page)
  const checks: string[] = []
  await page.route(/\/version\.json(?:\?|$)/, (route) => {
    checks.push(route.request().url())
    return route.fulfill({ json: { version } })
  })
  await page.goto('/')
  await ready(page)
  await expect.poll(() => checks.length).toBe(1)
  await expect(
    page.locator('header').getByRole('button', { name: 'Check for updates', exact: true }),
  ).toBeVisible()
  await expect(page.locator('footer .update-button')).toHaveCount(0)
  await expect(checkButton(page)).toHaveText('')
  await expect(checkButton(page)).toHaveCSS('color', 'rgb(155, 166, 171)')
  const before = await savedState(page)
  let navigations = 0
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) navigations++
  })
  await checkButton(page).click()
  await expect(page.getByRole('status').filter({ hasText: 'You’re up to date.' })).toBeVisible()
  expect(checks).toHaveLength(2)
  expect(checks[0]).not.toBe(checks[1])
  expect(await savedState(page)).toEqual(before)
  expect(navigations).toBe(0)
  await page.getByRole('button', { name: 'Switch to light mode' }).click()
  await expect(checkButton(page)).toHaveCSS('color', 'rgb(116, 126, 131)')
})

test('resuming detects an update without reloading; downloading preserves every saved mode at a subpath', async ({
  page,
  request,
}) => {
  const { version } = await (await request.get('/version.json')).json()
  await seed(page)
  let latest = version
  let checks = 0
  await page.route(/\/version\.json(?:\?|$)/, (route) => {
    checks++
    return route.fulfill({ json: { version: latest } })
  })
  await page.goto('http://127.0.0.1:4174/wep-app/?hello=Val#game')
  await ready(page)
  await expect.poll(() => checks).toBe(1)
  await page.clock.install()
  await page.clock.fastForward(61_000)
  latest = 'next-deployed-build'
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  expect(checks).toBe(1)
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: false, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  const download = page.getByRole('button', { name: 'Download update', exact: true })
  await expect(download).toBeVisible()
  await expect(page.locator('.update-feedback')).toContainText('An update is available.')
  expect(checks).toBe(2)
  await page.evaluate(() => window.dispatchEvent(new Event('pageshow')))
  expect(checks).toBe(2)
  expect(page.url()).not.toContain('_app_update')
  const before = await savedState(page)
  await page.clock.resume()
  const freshDocument = page.waitForRequest(
    (req) => req.isNavigationRequest() && new URL(req.url()).searchParams.has('_app_update'),
  )
  await download.click()
  const url = new URL((await freshDocument).url())
  expect(url.pathname).toBe('/wep-app/')
  expect(url.searchParams.get('_app_update')).toBe(latest)
  expect(url.searchParams.get('hello')).toBe('Val')
  await ready(page)
  await expect(page).toHaveURL('http://127.0.0.1:4174/wep-app/?hello=Val#game')
  expect(await savedState(page)).toEqual(before)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.getByRole('list', { name: 'Mystery clues' }).locator('li')).toHaveCount(3)
  await expect(page.getByRole('list', { name: 'Mystery guesses' })).toContainText('rainbow')
})

test('offline checks fail quietly in the background and allow a manual retry', async ({
  page,
  request,
}) => {
  const { version } = await (await request.get('/version.json')).json()
  await seed(page)
  let offline = true
  await page.route(/\/version\.json(?:\?|$)/, (route) =>
    offline ? route.abort() : route.fulfill({ json: { version } }),
  )
  await page.goto('/')
  await ready(page)
  await expect(page.getByText(/Couldn’t check for updates/)).toHaveCount(0)
  const before = await savedState(page)
  await checkButton(page).click()
  await expect(page.getByText(/Couldn’t check for updates/)).toBeVisible()
  await expect(checkButton(page)).toBeEnabled()
  expect(await savedState(page)).toEqual(before)
  offline = false
  await checkButton(page).click()
  await expect(page.getByText('You’re up to date.', { exact: true })).toBeVisible()
})

test('an update waits for both queued perfect-round celebrations before loading', async ({
  page,
  request,
}) => {
  const { version } = await (await request.get('/version.json')).json()
  await seed(page, true)
  let latest = version
  await page.route(/\/version\.json(?:\?|$)/, (route) =>
    route.fulfill({ json: { version: latest } }),
  )
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'General Trivia', exact: true })).toBeVisible()
  await page.clock.install()
  await page.clock.pauseAt(new Date(Date.now() + 1000))
  await page.locator('.trivia-choice').first().click()
  const canvas = page.locator('.victory-celebration')
  await expect(canvas).toHaveAttribute('data-effect', 'fire-streak')
  latest = 'after-celebration-build'
  const navigation = page.waitForRequest(
    (req) => req.isNavigationRequest() && req.url().includes('_app_update='),
  )
  await checkButton(page).click()
  await expect(
    page.getByText('Your update will open after the celebration.', { exact: true }),
  ).toBeVisible()
  await expect(canvas).toHaveCount(1)
  expect(page.url()).not.toContain('_app_update')
  await page.clock.runFor(3500)
  await expect(canvas).toHaveCount(1)
  await page.clock.runFor(1400)
  await expect(canvas).toHaveAttribute('data-effect', 'perfect-round')
  expect(page.url()).not.toContain('_app_update')
  await page.clock.runFor(3500)
  await expect(canvas).toHaveCount(1)
  await page.clock.runFor(1400)
  expect(new URL((await navigation).url()).searchParams.get('_app_update')).toBe(latest)
  await page.clock.resume()
  await expect(page.getByRole('heading', { name: 'General Trivia', exact: true })).toBeVisible()
  await expect(canvas).toHaveCount(0)
})

test('the icon-only header fits 320px and shows an accessible, temporary update message in both themes', async ({
  page,
}) => {
  await seed(page)
  await page.setViewportSize({ width: 320, height: 740 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.route(/\/version\.json(?:\?|$)/, (route) =>
    route.fulfill({ json: { version: 'new-build' } }),
  )
  await page.clock.install()
  await page.goto('/')
  await ready(page)
  const button = page.getByRole('button', { name: 'Download update', exact: true })
  await expect(button).toBeVisible()
  await expect(button).toHaveText('')
  await expect(page.locator('.update-feedback')).toContainText('An update is available.')
  for (const theme of ['dark', 'light']) {
    if (theme === 'light') await page.getByRole('button', { name: 'Switch to light mode' }).click()
    const box = (await button.boundingBox())!
    expect(box.width).toBeGreaterThanOrEqual(44)
    expect(box.height).toBeGreaterThanOrEqual(44)
    const branding = (await page
      .getByRole('combobox', { name: 'Choose experience' })
      .boundingBox())!
    const toggle = (await page.locator('.theme-toggle').boundingBox())!
    expect(branding.x + branding.width).toBeLessThanOrEqual(box.x)
    expect(box.x + box.width).toBeLessThanOrEqual(toggle.x)
    expect(box.y + box.height / 2).toBeCloseTo(toggle.y + toggle.height / 2, 1)
    await expect(button).toHaveCSS(
      'color',
      theme === 'dark' ? 'rgb(135, 219, 179)' : 'rgb(40, 117, 91)',
    )
    const notice = (await page.locator('.update-feedback').boundingBox())!
    expect(notice.x).toBeGreaterThanOrEqual(0)
    expect(notice.x + notice.width).toBeLessThanOrEqual(320)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([])
  }
  await page.clock.fastForward(8100)
  await expect(page.locator('.app-update [role="status"]')).toHaveClass('sr-only')
  await expect(button).toBeEnabled()
  await expect(button).toHaveCSS('color', 'rgb(40, 117, 91)')
  await page.getByRole('combobox', { name: 'Choose experience' }).selectOption('somewhere')
  const branding = (await page.getByRole('combobox', { name: 'Choose experience' }).boundingBox())!
  const update = (await button.boundingBox())!
  const toggle = (await page.locator('.theme-toggle').boundingBox())!
  expect(branding.x + branding.width).toBeLessThanOrEqual(update.x)
  expect(update.x + update.width).toBeLessThanOrEqual(toggle.x)
  expect(toggle.x + toggle.width).toBeLessThanOrEqual(302)
  await page.clock.resume()
})
