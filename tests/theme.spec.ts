import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test('system theme, explicit choice, persistence and early paint agree', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  const header = page.locator('header')
  await expect(header.getByRole('button')).toHaveCount(1)
  await expect(header.getByRole('button', { name: 'Switch to light mode' })).toBeVisible()
  await expect(header.locator('.theme-icons svg')).toHaveCount(2)
  await expect(page.getByRole('button', { name: 'New round' })).toHaveCount(0)
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', /\/favicon\.svg$/)
  await header.getByRole('button', { name: 'Switch to dark mode' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  const favicon = page.locator('link[rel="icon"]')
  await expect(favicon).toHaveAttribute('href', /\/favicon-dark\.svg$/)
  const iconResponse = await page.request.get(
    new URL((await favicon.getAttribute('href'))!, page.url()).href,
  )
  expect(iconResponse.ok()).toBe(true)
  expect(await iconResponse.text()).toContain('#62e99a')
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#101c20')
  expect(await page.evaluate(() => localStorage.getItem('somewhere.theme.v1'))).toBe('dark')
  await page.reload()
  await expect(header.getByRole('button', { name: 'Switch to light mode' })).toBeVisible()
  await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(16, 28, 32)')
  // Even with the application bundle unavailable, the saved palette precedes React.
  await page.route('**/assets/index-*.js', (route) => route.abort())
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark')
})

test('dark gameplay, autocomplete, hints, help and results remain accessible', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('somewhere.theme.v1', 'dark')
    localStorage.setItem(
      'somewhere.round.v1',
      JSON.stringify({ version: 1, answer: 'FRA', guesses: [] }),
    )
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await expect(page.getByTestId('globe')).toHaveAttribute('data-ready', 'true')
  await expect(page.locator('.search-card')).toHaveCSS('background-color', 'rgb(27, 43, 48)')
  await page.getByRole('combobox').fill('Germany')
  await expect(page.getByRole('option', { name: /Germany/ })).toBeVisible()
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([])
  await page.getByRole('option', { name: /Germany/ }).click()
  await page.getByRole('button', { name: 'Make a guess' }).click()
  await expect(page.getByRole('list', { name: 'Guesses, closest first' })).toContainText('Adjacent')
  await expect(page.locator('.temperature-adjacent')).toHaveCSS('color', 'rgb(255, 156, 173)')
  await page.getByRole('button', { name: 'Flags', exact: true }).click()
  await page.getByRole('button', { name: 'Hint: reveal continent' }).click()
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([])
  await page
    .locator('footer')
    .getByRole('button', { name: /How to play/ })
    .click()
  await expect(page.getByRole('dialog')).toHaveCSS('background-color', 'rgb(27, 43, 48)')
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([])
  await page.getByRole('button', { name: 'Let’s explore' }).click()
  await page.getByRole('button', { name: 'Countries', exact: true }).click()
  await page.getByRole('button', { name: 'Give up and reveal answer' }).click()
  await expect(page.locator('.search-card')).toContainText('The answer was France.')
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([])
  await page.getByRole('button', { name: 'Explore another round' }).click()
  await expect(page.getByRole('combobox')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('theme switching works with blocked storage and keyboard input', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new Error('Storage unavailable')
    }
    Storage.prototype.setItem = () => {
      throw new Error('Storage unavailable')
    }
  })
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/')
  const toggle = page.getByRole('button', { name: 'Switch to light mode' })
  await toggle.focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.emulateMedia({ colorScheme: 'light' })
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.getByRole('button', { name: 'Switch to dark mode' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.getByRole('combobox')).toBeEnabled()
})

test('switching themes preserves a running winning celebration', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'somewhere.round.v1',
      JSON.stringify({ version: 1, answer: 'FRA', guesses: [] }),
    ),
  )
  await page.goto('/')
  await expect(page.getByTestId('globe')).toHaveAttribute('data-ready', 'true')
  await page.clock.install()
  await page.clock.pauseAt(new Date(Date.now() + 1000))
  await page.getByRole('combobox').fill('France')
  await page.getByRole('option', { name: /France/ }).click()
  await page.getByRole('button', { name: 'Make a guess' }).click()
  const canvas = page.locator('.victory-celebration')
  const original = (await canvas.elementHandle())!
  await page.getByRole('button', { name: 'Switch to dark mode' }).click()
  await page.getByRole('button', { name: 'Switch to light mode' }).click()
  expect(await original.evaluate((node) => node.isConnected)).toBe(true)
  await page.clock.runFor(4100)
  expect(await original.evaluate((node) => node.isConnected)).toBe(true)
  await page.clock.runFor(800)
  await expect(canvas).toHaveCount(0)
  await expect(page.locator('.search-card')).toContainText('France')
})
