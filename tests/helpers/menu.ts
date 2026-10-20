import { type Page, expect } from '@playwright/test'
export async function openMenu(page: Page) {
  if (!(await page.getByRole('dialog', { name: 'App menu', exact: true }).isVisible()))
    await page.getByRole('button', { name: /^Open menu/ }).click()
  await expect(page.getByRole('dialog', { name: 'App menu', exact: true })).toBeVisible()
}
export async function changeTheme(page: Page, theme: 'light' | 'dark') {
  await openMenu(page)
  await page.getByRole('button', { name: `Switch to ${theme} mode`, exact: true }).click()
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click()
}
