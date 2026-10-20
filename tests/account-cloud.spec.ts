import { expect, test, type Page } from '@playwright/test'
import { openMenu } from './helpers/menu'

// Fake Google credentials are accepted ONLY by the Firebase Auth emulator.
// This tests the real Auth/Firestore SDK and published rules, without Google accounts.
async function login(page: Page, name: string) {
  await openMenu(page)
  await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeEnabled()
  await page.evaluate(async (name) => {
    // Vite serves this module only in the local development test server.
    const authModule = '/node_modules/.vite/deps/firebase_auth.js'
    const { getAuth, signInWithCredential, GoogleAuthProvider } = (await import(
      authModule
    )) as typeof import('firebase/auth')
    const token = JSON.stringify({
      sub: name,
      email: `${name}@example.com`,
      name,
      email_verified: true,
      iss: 'https://accounts.google.com',
      aud: 'demo-somewhere',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    })
    await signInWithCredential(getAuth(), GoogleAuthProvider.credential(token))
  }, name)
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible()
  await expect(page.getByText('Your statistics are synced.', { exact: true })).toBeVisible({
    timeout: 20_000,
  })
}

test.beforeEach(async ({ request }) => {
  await request.delete('http://127.0.0.1:9099/emulator/v1/projects/demo-somewhere/accounts')
  await request.delete(
    'http://127.0.0.1:8080/emulator/v1/projects/demo-somewhere/databases/(default)/documents',
  )
})

test('guest import, account isolation, cross-device check-ins, refresh and durable offline sync', async ({
  page,
  browser,
}) => {
  await page.goto('/')
  await page.locator('.streak-button').click()
  await login(page, 'explorer-one')
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click()
  await expect(page.locator('.streak-button')).toContainText('1')
  await page.reload()
  await openMenu(page)
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible()
  await expect(page.getByText('Your statistics are synced.', { exact: true })).toBeVisible()
  const device = await browser.newContext()
  const second = await device.newPage()
  await second.goto('/')
  await login(second, 'explorer-one')
  await second.getByRole('button', { name: 'Close dialog', exact: true }).click()
  await expect(second.locator('.streak-button')).toHaveAttribute(
    'aria-label',
    'Daily streak already claimed. 1 day.',
  )
  await second.getByRole('button', { name: 'Give up and reveal answer' }).click()
  await openMenu(second)
  await expect(second.getByText('Your statistics are synced.', { exact: true })).toBeVisible({
    timeout: 20_000,
  })
  await page.getByRole('button', { name: 'Your statistics', exact: true }).click()
  await expect(
    page.getByRole('region', { name: 'Countries statistics', exact: true }),
  ).toContainText('1 played · 1 completed')
  await page.getByRole('button', { name: 'Back to exploring' }).click()
  await openMenu(page)
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeEnabled()
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click()
  await expect(page.locator('.streak-button')).toHaveAttribute(
    'aria-label',
    'Claim daily streak. 0 days.',
  )
  await login(page, 'explorer-two')
  await page.getByRole('button', { name: 'Your statistics', exact: true }).click()
  await expect(page.locator('.stats-overview > div').first()).toContainText('0')
  await expect(page.locator('.stats-overview > div').nth(2)).toContainText('0')
  await page.getByRole('button', { name: 'Back to exploring' }).click()
  await page.context().setOffline(true)
  await page.getByRole('button', { name: 'Give up and reveal answer' }).click()
  await openMenu(page)
  await page.getByRole('button', { name: 'Your statistics', exact: true }).click()
  await expect(
    page.getByRole('region', { name: 'Countries statistics', exact: true }),
  ).toContainText('1 played · 1 completed')
  await page.context().setOffline(false)
  await expect(page.getByText('Synced to your Google account', { exact: true })).toBeVisible({
    timeout: 25_000,
  })
  await device.close()
})
