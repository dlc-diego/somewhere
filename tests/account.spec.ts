import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { openMenu } from './helpers/menu'

test('the same header button slides the menu in from the right and back out', async ({ page }) => {
  await page.goto('/')
  const toggle = page.locator('.hamburger-button')
  const drawer = page.getByRole('complementary', { name: 'App menu', exact: true })
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await openMenu(page)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(drawer).toBeVisible()
  await expect(drawer).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)')
  const box = (await drawer.boundingBox())!
  expect(box.x + box.width).toBeCloseTo((await page.viewportSize())!.width, 0)
  expect(box.y).toBe(0)
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(page.locator('#app-menu')).toHaveAttribute('inert', '')
  await expect(page.locator('#app-menu')).not.toBeVisible()
  await openMenu(page)
  await page.keyboard.press('Escape')
  await expect(toggle).toBeFocused()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
})

test('guest gameplay is saved but statistics and check-ins are not tracked; statistics directs to sign-in', async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('somewhere.round.v1'))
      localStorage.setItem(
        'somewhere.round.v1',
        JSON.stringify({ version: 1, answer: 'FRA', guesses: [] }),
      )
  })
  await page.goto('/')
  await page.getByRole('combobox', { name: /^Search for a / }).fill('France')
  await page.getByRole('option', { name: /France/ }).click()
  await page.getByRole('button', { name: 'Make a guess' }).click()
  await expect(page.locator('.search-card')).toContainText('France')
  await page.reload()
  await openMenu(page)
  await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeEnabled()
  await page.getByRole('button', { name: 'Your statistics', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible()
  await expect(page.locator('.stats-overview')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeEnabled()
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).filter((key) => key.startsWith('somewhere.player.')),
    ),
  ).toEqual([])
  await page.getByRole('button', { name: /^Close menu/ }).click()
  await page.locator('.streak-button').click()
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible()
  await expect(page.locator('.streak-reward')).toHaveCount(0)
  await expect(page.locator('.streak-button')).toContainText('0')
  expect(await page.evaluate(() => localStorage.getItem('somewhere.player.v1:guest'))).toBeNull()
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([])
})

test('legacy guest statistics are not shown or retained', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'somewhere.player.v1:guest',
      JSON.stringify({ version: 1, games: {}, claims: {}, pendingGames: [], pendingClaims: [] }),
    ),
  )
  await page.goto('/')
  await openMenu(page)
  await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeEnabled()
  expect(await page.evaluate(() => localStorage.getItem('somewhere.player.v1:guest'))).toBeNull()
  await page.getByRole('button', { name: 'Your statistics', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible()
  await expect(
    page.getByText('Saved on this device. Sign in with Google to sync across devices.', {
      exact: true,
    }),
  ).toHaveCount(0)
  await expect(
    page.getByText('Your next discovery starts the story.', { exact: false }),
  ).toHaveCount(0)
})
