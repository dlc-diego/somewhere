import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { openMenu } from './helpers/menu'

test('manual check-in persists once per noon-Central day and resets after a missed day', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-10-20T16:59:50Z') })
  await page.goto('/')
  const flame = page.locator('.streak-button')
  await expect(flame).toHaveAttribute('aria-label', 'Claim daily streak. 0 days.')
  await flame.click()
  await expect(flame).toHaveAttribute('aria-label', 'Daily streak already claimed. 1 day.')
  await expect(page.locator('.streak-reward')).toBeVisible()
  await flame.click()
  await expect(flame).toContainText('1')
  await page.clock.fastForward(11_000)
  await expect(flame).toHaveAttribute('aria-label', 'Claim daily streak. 1 day.')
  await flame.click()
  await expect(flame).toHaveAttribute('aria-label', 'Daily streak already claimed. 2 days.')
  await page.reload()
  await expect(flame).toHaveAttribute('aria-label', 'Daily streak already claimed. 2 days.')
  await page.clock.setSystemTime(new Date('2026-10-22T17:00:01Z'))
  await page.evaluate(() => window.dispatchEvent(new Event('pageshow')))
  await expect(flame).toHaveAttribute('aria-label', 'Claim daily streak. 0 days.')
  await flame.click()
  await expect(flame).toHaveAttribute('aria-label', 'Daily streak already claimed. 1 day.')
  await openMenu(page)
  await page.getByRole('button', { name: 'Your statistics', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Your statistics', exact: true })).toBeVisible()
  await expect(page.locator('.stats-overview > div').nth(3)).toContainText('2')
})

test('game statistics distinguish wins and reveals and survive refresh without duplicates', async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('somewhere.round.v1'))
      localStorage.setItem(
        'somewhere.round.v1',
        JSON.stringify({ version: 1, answer: 'FRA', guesses: [] }),
      )
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await page.getByRole('combobox', { name: /^Search for a / }).fill('France')
  await page.getByRole('option', { name: /France/ }).click()
  await page.getByRole('button', { name: 'Make a guess' }).click()
  await expect(page.locator('.search-card')).toContainText('France')
  await page.reload()
  await openMenu(page)
  await page.getByRole('button', { name: 'Your statistics', exact: true }).click()
  const stats = page.getByRole('region', { name: 'Countries statistics', exact: true })
  await expect(stats).toContainText('1 played · 1 completed')
  await expect(stats).toContainText('1 wins')
  await page.getByRole('button', { name: 'Back to exploring' }).click()
  await page.getByRole('button', { name: 'Explore another round' }).click()
  await page.getByRole('button', { name: 'Give up and reveal answer' }).click()
  await openMenu(page)
  await page.getByRole('button', { name: 'Your statistics', exact: true }).click()
  await expect(stats).toContainText('2 played · 2 completed')
  await expect(stats).toContainText('1 wins · 50% win rate')
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([])
})

test('check-ins sync between tabs without a second daily claim', async ({ page, context }) => {
  await page.goto('/')
  await openMenu(page)
  await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeEnabled()
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click()
  const second = await context.newPage()
  await second.goto('/')
  await page.locator('.streak-button').click()
  await expect(second.locator('.streak-button')).toHaveAttribute(
    'aria-label',
    'Daily streak already claimed. 1 day.',
  )
  await second.locator('.streak-button').click()
  await expect(page.locator('.streak-button')).toContainText('1')
})
