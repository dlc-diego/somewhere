import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const selector = (page: Page) =>
  page.getByRole('combobox', { name: 'Choose experience', exact: true })
async function seed(page: Page, guesses = ['DEU']) {
  await page.addInitScript((guesses) => {
    if (!localStorage.getItem('somewhere.round.v1'))
      localStorage.setItem(
        'somewhere.round.v1',
        JSON.stringify({ version: 2, mode: 'countries', answer: 'FRA', revealed: false, guesses }),
      )
  }, guesses)
}
async function switchTo(page: Page, value: 'somewhere' | 'something' | 'someone') {
  await selector(page).selectOption(value)
  await expect(page.locator('.app-shell')).toHaveAttribute('data-experience', value)
  await expect(page.locator('.experience-transition')).toHaveCount(0)
}

test('header switches experiences with a screen-wide sweep and preserves the geography view', async ({
  page,
}) => {
  await seed(page)
  await page.goto('/')
  await expect(page.locator('.brand-ending')).toHaveCSS('opacity', '1')
  await expect(page.getByTestId('globe')).toHaveAttribute('data-ready', 'true')
  await page.getByRole('combobox', { name: 'Search for a country', exact: true }).fill('Spain')
  const before = await page.evaluate(() => localStorage.getItem('somewhere.round.v1'))
  const world = (await page.getByTestId('globe').elementHandle())!
  await selector(page).selectOption('something')
  const transition = page.locator('.experience-transition')
  await expect(transition).toHaveCount(1)
  await expect(transition).toHaveCSS('pointer-events', 'none')
  await expect(page.locator('.experience-curtain')).toHaveCSS('animation-name', 'experience-sweep')
  await expect(page.locator('.experience-orbit')).toHaveCSS('animation-name', 'experience-turn')
  const box = (await transition.boundingBox())!
  expect(box.x).toBe(0)
  expect(box.y).toBe(0)
  expect(box.width).toBe(page.viewportSize()!.width)
  expect(box.height).toBe(page.viewportSize()!.height)
  await expect(page.getByRole('heading', { name: 'General Trivia', exact: true })).toBeVisible()
  await expect(page.getByTestId('globe')).not.toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Game mode', exact: true })).toHaveCount(0)
  await expect(page.locator('.brand-word')).toHaveText('something.')
  await expect(page.locator('.brand-ending')).toHaveText('thing.')
  await expect(page).toHaveTitle('Something — a little more to discover')
  await expect(transition).toHaveCount(0)
  expect(await page.evaluate(() => localStorage.getItem('somewhere.round.v1'))).toBe(before)
  await switchTo(page, 'someone')
  await expect(page.getByRole('heading', { name: 'Under construction', exact: true })).toBeVisible()
  await expect(page.locator('.brand-word')).toHaveText('someone.')
  await expect(page.locator('.brand-ending')).toHaveText('one.')
  await expect(page).toHaveTitle('Someone — under construction')
  await expect(page.getByRole('button', { name: /How to play/ })).toHaveCount(0)
  expect(await page.evaluate(() => localStorage.getItem('somewhere.round.v1'))).toBe(before)
  await switchTo(page, 'something')
  await expect(page.getByRole('heading', { name: 'General Trivia', exact: true })).toBeVisible()
  await switchTo(page, 'somewhere')
  expect(await world.evaluate((el) => el.isConnected)).toBe(true)
  await expect(
    page.getByRole('combobox', { name: 'Search for a country', exact: true }),
  ).toHaveValue('Spain')
  await expect(page.getByRole('list', { name: 'Guesses, closest first' })).toContainText('Germany')
  await expect(page.locator('.brand-ending')).toHaveText('where.')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('saved Someone opens without game modules and stays accessible at 320px in both themes', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('somewhere.experience.v1', 'someone'))
  await page.setViewportSize({ width: 320, height: 740 })
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'light' })
  const gameRequests: string[] = []
  page.on('request', (request) => {
    if (request.url().endsWith('/data/world.json') || /\/assets\/Something-/.test(request.url()))
      gameRequests.push(request.url())
  })
  await page.goto('http://127.0.0.1:4174/wep-app/')
  await expect(selector(page)).toHaveValue('someone')
  await expect(page.getByRole('heading', { name: 'Under construction', exact: true })).toBeVisible()
  await expect(page.locator('.skip-link')).toHaveAttribute('href', '#someone-content')
  expect(gameRequests).toEqual([])
  for (const theme of ['light', 'dark']) {
    if (theme === 'dark') await page.getByRole('button', { name: 'Switch to dark mode' }).click()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([])
  }
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Under construction', exact: true })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  expect(gameRequests).toEqual([])
})

test('saved Something opens under a repository subpath without loading the globe', async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('somewhere.experience.v1'))
      localStorage.setItem('somewhere.experience.v1', 'something')
  })
  let worlds = 0
  page.on('request', (request) => {
    if (request.url().endsWith('/data/world.json')) worlds++
  })
  await page.goto('http://127.0.0.1:4174/wep-app/')
  await expect(page.getByRole('heading', { name: 'General Trivia', exact: true })).toBeVisible()
  await expect(selector(page)).toHaveValue('something')
  await expect(page.getByTestId('globe')).toHaveCount(0)
  expect(worlds).toBe(0)
  await switchTo(page, 'somewhere')
  await expect(page.getByTestId('globe')).toHaveAttribute('data-ready', 'true')
  expect(worlds).toBe(1)
  await switchTo(page, 'something')
  await page.reload()
  await expect(selector(page)).toHaveValue('something')
  await expect(page.getByTestId('globe')).toHaveCount(0)
  expect(worlds).toBe(1)
})

test('Something games and two-tone branding remain accessible in both themes at 320px', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'light' })
  await page.setViewportSize({ width: 320, height: 740 })
  await page.goto('/')
  await switchTo(page, 'something')
  for (const theme of ['light', 'dark']) {
    if (theme === 'dark') await page.getByRole('button', { name: 'Switch to dark mode' }).click()
    const palette = await page.locator('.brand-word').evaluate((el) => ({
      base: getComputedStyle(el).color,
      ending: getComputedStyle(el.querySelector('.brand-ending')!).color,
      accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
    }))
    expect(palette.base).not.toBe(palette.ending)
    await expect(page.locator('.brand-ending')).toHaveCSS(
      'color',
      theme === 'dark' ? 'rgb(98, 233, 154)' : 'rgb(189, 74, 46)',
    )
    const selectBox = (await selector(page).boundingBox())!
    const toggleBox = (await page.locator('.theme-toggle').boundingBox())!
    expect(selectBox.x + selectBox.width).toBeLessThanOrEqual(toggleBox.x)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([])
  }
})

test('keyboard and blocked storage still allow motion-free experience switching', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new Error('blocked')
    }
    Storage.prototype.setItem = () => {
      throw new Error('blocked')
    }
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await selector(page).focus()
  await page.keyboard.press('ArrowDown')
  await expect(selector(page)).toHaveValue('something')
  await expect(page.getByRole('heading', { name: 'General Trivia', exact: true })).toBeVisible()
  await expect(page.locator('.experience-transition')).toHaveCount(0)
  await page.keyboard.press('ArrowUp')
  await expect(selector(page)).toHaveValue('somewhere')
  await expect(
    page.getByRole('combobox', { name: 'Search for a country', exact: true }),
  ).toBeEnabled()
})

test('rapid switches settle on the latest choice without stale timers', async ({ page }) => {
  await page.goto('/')
  await page.clock.install()
  await page.clock.pauseAt(new Date(Date.now() + 1000))
  await selector(page).selectOption('something')
  await selector(page).selectOption('somewhere')
  await page.clock.runFor(1000)
  await expect(selector(page)).toHaveValue('somewhere')
  await expect(page.locator('.experience-transition')).toHaveCount(0)
  await selector(page).selectOption('something')
  await page.clock.runFor(300)
  await expect(selector(page)).toHaveValue('something')
  await selector(page).selectOption('somewhere')
  await page.clock.runFor(900)
  await expect(selector(page)).toHaveValue('somewhere')
  await expect(page.locator('.experience-transition')).toHaveCount(0)
  await expect(page.locator('.app-shell')).not.toHaveAttribute('data-switch-phase')
})

test('enabling reduced motion during a switch finishes immediately and removes the sweep', async ({
  page,
}) => {
  await page.goto('/')
  await selector(page).selectOption('something')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(selector(page)).toHaveValue('something')
  await expect(page.locator('.experience-transition')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'General Trivia', exact: true })).toBeVisible()
})

test('a winning celebration plays fully across Something and Somewhere', async ({ page }) => {
  await seed(page, [])
  await page.goto('/')
  await expect(page.getByTestId('globe')).toHaveAttribute('data-ready', 'true')
  await page.clock.install()
  await page.clock.pauseAt(new Date(Date.now() + 1000))
  await page.getByRole('combobox', { name: 'Search for a country', exact: true }).fill('France')
  await page
    .getByRole('listbox')
    .getByRole('option', { name: /France/ })
    .click()
  await page.getByRole('button', { name: 'Make a guess' }).click()
  const canvas = page.locator('.victory-celebration')
  await expect(canvas).toHaveCount(1)
  const original = (await canvas.elementHandle())!
  await selector(page).selectOption('something')
  await page.clock.runFor(300)
  await expect(selector(page)).toHaveValue('something')
  expect(await original.evaluate((el) => el.isConnected)).toBe(true)
  await selector(page).selectOption('somewhere')
  await page.clock.runFor(900)
  expect(await original.evaluate((el) => el.isConnected)).toBe(true)
  await page.clock.fastForward(3000)
  expect(await original.evaluate((el) => el.isConnected)).toBe(true)
  await page.clock.runFor(800)
  await expect(canvas).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Explore another round' })).toBeVisible()
})

test('returning to Somewhere stays at the header after focusing a country', async ({
  page,
  isMobile,
}) => {
  await seed(page)
  await page.goto('/')
  await expect(page.getByTestId('globe')).toHaveAttribute('data-ready', 'true')
  await page
    .getByRole('list', { name: 'Guesses, closest first' })
    .getByRole('button', { name: /Germany/ })
    .click()
  const expectCentered = async () => {
    if (!isMobile) return
    await expect
      .poll(() =>
        page.getByTestId('globe').evaluate((el) => {
          const box = el.getBoundingClientRect()
          return Math.abs(box.top + box.height / 2 - innerHeight / 2)
        }),
      )
      .toBeLessThan(5)
  }
  await expectCentered()
  await switchTo(page, 'something')
  await switchTo(page, 'somewhere')
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
  await expect(selector(page)).toBeInViewport()
  // New guesses and reveals must still center the globe normally.
  await page.getByRole('combobox', { name: 'Search for a country', exact: true }).fill('Italy')
  await page.getByRole('listbox').getByRole('option', { name: /Italy/ }).click()
  await page.getByRole('button', { name: 'Make a guess' }).click()
  await expectCentered()
  await page.getByRole('button', { name: 'Give up and reveal answer' }).click()
  await expectCentered()
})

test('opening Somewhere from a saved Something journey stays at the header', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('somewhere.experience.v1', 'something')
    localStorage.setItem('somewhere.mode.v1', 'journey')
    localStorage.setItem(
      'somewhere.journey.v1',
      JSON.stringify({
        version: 2,
        mode: 'journey',
        start: 'PRT',
        answer: 'ITA',
        guesses: ['ESP'],
        revealed: false,
      }),
    )
  })
  await page.goto('/')
  await switchTo(page, 'somewhere')
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
  await expect(selector(page)).toBeInViewport()
  await expect(page.locator('.journey-list .current-stop')).toContainText('Spain')
})
