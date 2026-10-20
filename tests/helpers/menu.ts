import { type Page, expect } from '@playwright/test'
export async function openMenu(page: Page) {
  if (!(await page.getByRole('button', { name: /^Close menu/ }).isVisible()))
    await page.getByRole('button', { name: /^Open menu/ }).click()
  await expect(page.getByRole('complementary', { name: 'App menu', exact: true })).toBeVisible()
}
export async function changeTheme(page: Page, theme: 'light' | 'dark') {
  await openMenu(page)
  await page.getByRole('button', { name: `Switch to ${theme} mode`, exact: true }).click()
  await page.getByRole('button', { name: /^Close menu/ }).click()
}
