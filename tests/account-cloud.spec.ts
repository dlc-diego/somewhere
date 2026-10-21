import { expect, test, type Page } from '@playwright/test'
import { openMenu, changeTheme } from './helpers/menu'
import AxeBuilder from '@axe-core/playwright'

// Fake Google credentials are accepted ONLY by the Firebase Auth emulator.
// This tests the real Auth/Firestore SDK and published rules, without Google accounts.
async function login(page: Page, name: string, photoURL?: string) {
  await openMenu(page)
  await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeEnabled()
  await signInEmulator(page, name, photoURL)
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible()
  await expect(page.getByText('Your statistics are synced.', { exact: true })).toBeVisible({
    timeout: 20_000,
  })
}

async function signInEmulator(page: Page, name: string, photoURL?: string) {
  await page.evaluate(
    async ({ name, photoURL }) => {
      // Vite serves this module only in the local development test server.
      const authModule = '/node_modules/.vite/deps/firebase_auth.js'
      const { getAuth, signInWithCredential, GoogleAuthProvider } = (await import(
        authModule
      )) as typeof import('firebase/auth')
      const token = JSON.stringify({
        sub: name,
        email: `${name}@example.com`,
        name,
        picture: photoURL,
        email_verified: true,
        iss: 'https://accounts.google.com',
        aud: 'demo-somewhere',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      })
      await signInWithCredential(getAuth(), GoogleAuthProvider.credential(token))
    },
    { name, photoURL },
  )
}

test.beforeEach(async ({ request }) => {
  await request.delete('http://127.0.0.1:9099/emulator/v1/projects/demo-somewhere/accounts')
  await request.delete(
    'http://127.0.0.1:8080/emulator/v1/projects/demo-somewhere/databases/(default)/documents',
  )
})

test('signed-in tracking, account isolation, cross-device check-ins, refresh and durable offline sync', async ({
  page,
  browser,
}) => {
  await page.goto('/')
  await login(page, 'explorer-one')
  await page.getByRole('button', { name: /^Close menu/ }).click()
  await page.locator('.streak-button').click()
  await openMenu(page)
  await expect(page.getByText('Your statistics are synced.', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: /^Close menu/ }).click()
  await expect(page.locator('.streak-button')).toContainText('1')
  await page.reload()
  await openMenu(page)
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible()
  await expect(page.getByText('Your statistics are synced.', { exact: true })).toBeVisible()
  const device = await browser.newContext()
  const second = await device.newPage()
  await second.goto('/')
  await login(second, 'explorer-one')
  await second.getByRole('button', { name: /^Close menu/ }).click()
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
  await page.getByRole('button', { name: /^Close menu/ }).click()
  await expect(page.locator('.streak-button')).toHaveAttribute(
    'aria-label',
    'Sign in to start your daily streak',
  )
  await login(page, 'explorer-two')
  await page.getByRole('button', { name: 'Your statistics', exact: true }).click()
  await expect(page.getByRole('group', { name: 'Games played', exact: true })).toContainText('0')
  await expect(page.getByRole('group', { name: 'Daily streak', exact: true })).toContainText('0')
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

test('only authenticated play contributes to statistics, with wins, reveals and refresh deduplication', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 })
  await page.addInitScript(() => {
    localStorage.setItem('somewhere.theme.v1', 'dark')
    if (!localStorage.getItem('somewhere.round.v1'))
      localStorage.setItem(
        'somewhere.round.v1',
        JSON.stringify({ version: 1, answer: 'FRA', guesses: [] }),
      )
    if (!localStorage.getItem('legacy-test-seeded')) {
      localStorage.setItem('legacy-test-seeded', 'yes')
      localStorage.setItem(
        'somewhere.player.v1:guest',
        JSON.stringify({
          version: 1,
          games: {},
          claims: { '20000': { day: 20000, at: 1728057600000 } },
          pendingGames: [],
          pendingClaims: [],
        }),
      )
    }
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await page.getByRole('button', { name: 'Give up and reveal answer' }).click()
  await login(page, 'explorer-three')
  await page.getByRole('button', { name: 'Your statistics', exact: true }).click()
  await expect(page.getByRole('group', { name: 'Games played', exact: true })).toContainText('0')
  await expect(page.getByRole('group', { name: 'Daily streak', exact: true })).toContainText('0')
  await page.getByRole('button', { name: 'Back to exploring' }).click()
  // Begin a known fresh round on reload, leaving the account and statistics intact.
  await page.evaluate(() =>
    localStorage.setItem(
      'somewhere.round.v1',
      JSON.stringify({ version: 1, answer: 'FRA', guesses: [] }),
    ),
  )
  await page.reload()
  await openMenu(page)
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible()
  await page.getByRole('button', { name: /^Close menu/ }).click()
  await page.getByRole('combobox', { name: /^Search for a / }).fill('France')
  await page.getByRole('option', { name: /France/ }).click()
  await page.getByRole('button', { name: 'Make a guess' }).click()
  await page.reload()
  await openMenu(page)
  await page.getByRole('button', { name: 'Your statistics', exact: true }).click()
  const stats = page.getByRole('region', { name: 'Countries statistics', exact: true })
  await expect(stats).toContainText('1 played · 1 completed')
  await expect(stats).toContainText('1 wins')
  await expect(stats).toContainText('1 average guesses on wins')
  await expect(
    page
      .getByRole('region', { name: 'Overall statistics', exact: true })
      .getByRole('group', { name: 'Avg guesses per solve', exact: true })
      .locator('strong'),
  ).toHaveText('1')
  await page.getByRole('button', { name: 'Back to exploring' }).click()
  await openMenu(page)
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeEnabled()
  await page.getByRole('button', { name: /^Close menu/ }).click()
  await page.getByRole('button', { name: 'Explore another round' }).click()
  await page.getByRole('button', { name: 'Give up and reveal answer' }).click()
  await login(page, 'explorer-three')
  await page.getByRole('button', { name: 'Your statistics', exact: true }).click()
  await expect(stats).toContainText('1 played · 1 completed')
  await page.getByRole('button', { name: 'Back to exploring' }).click()
  await page.getByRole('button', { name: 'Explore another round' }).click()
  await page.getByRole('button', { name: 'Give up and reveal answer' }).click()
  await openMenu(page)
  await page.getByRole('button', { name: 'Your statistics', exact: true }).click()
  await expect(stats).toContainText('2 played · 2 completed')
  await expect(stats).toContainText('1 wins · 50% win rate')
  const overall = page.getByRole('region', { name: 'Overall statistics', exact: true })
  await expect(
    overall.getByRole('group', { name: 'Games played', exact: true }).locator('strong'),
  ).toHaveText('2')
  await expect(
    overall.getByRole('group', { name: 'Completed', exact: true }).locator('strong'),
  ).toHaveText('2')
  await expect(
    overall.getByRole('group', { name: 'Games won', exact: true }).locator('strong'),
  ).toHaveText('1')
  await expect(
    overall.getByRole('group', { name: 'Total guesses', exact: true }).locator('strong'),
  ).toHaveText('1')
  await expect(
    overall.getByRole('group', { name: 'Avg guesses per solve', exact: true }).locator('strong'),
  ).toHaveText('1')
  await expect(
    overall.getByRole('group', { name: 'Trivia accuracy', exact: true }).locator('strong'),
  ).toHaveText('—')
  for (const theme of ['dark', 'light'] as const) {
    if (theme === 'light') {
      await page.getByRole('button', { name: 'Back to exploring' }).click()
      await changeTheme(page, theme)
      await openMenu(page)
      await page.getByRole('button', { name: 'Your statistics', exact: true }).click()
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([])
  }
  await expect(
    page.getByText('Your next discovery starts the story.', { exact: false }),
  ).toHaveCount(0)
  await expect(
    page.getByText('Statistics begin with play after this update.', { exact: false }),
  ).toHaveCount(0)
})

test('the sign-in view leads to account statistics and signed-in check-ins persist', async ({
  page,
}) => {
  await page.goto('/')
  await openMenu(page)
  await page.getByRole('button', { name: 'Your statistics', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeEnabled()
  await signInEmulator(page, 'explorer-four')
  await expect(page.getByRole('dialog', { name: 'Your statistics', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Back to exploring' }).click()
  await page.locator('.streak-button').click()
  await expect(page.locator('.streak-button')).toHaveAttribute(
    'aria-label',
    'Daily streak already claimed. 1 day.',
  )
  await expect(page.locator('.streak-reward')).toBeVisible()
  await page.locator('.streak-button').click()
  await expect(page.locator('.streak-button')).toContainText('1')
  await page.reload()
  await openMenu(page)
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible()
  await expect(page.locator('.streak-button')).toHaveAttribute(
    'aria-label',
    'Daily streak already claimed. 1 day.',
  )
})

test('Google profile pictures sit left of the streak, fit mobile, persist and fall back safely', async ({
  page,
}) => {
  await page.route('https://lh3.googleusercontent.com/test-avatar*', (route) => {
    expect(route.request().headers()['referer']).toBeUndefined()
    return route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34"><rect width="34" height="34" fill="#62e99a"/></svg>',
    })
  })
  await page.goto('/')
  await expect(page.locator('.profile-avatar')).toHaveCount(0)
  await login(page, 'Val', 'https://lh3.googleusercontent.com/test-avatar.png')
  await page.getByRole('button', { name: /^Close menu/ }).click()
  const avatar = page.getByRole('img', { name: 'Val profile picture', exact: true })
  await expect(avatar).toBeVisible()
  await expect(avatar.locator('img')).toHaveAttribute(
    'src',
    'https://lh3.googleusercontent.com/test-avatar.png',
  )
  await expect
    .poll(() =>
      avatar
        .locator('img')
        .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
    )
    .toBe(true)
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    const branding = (await page
      .getByRole('combobox', { name: 'Choose experience' })
      .boundingBox())!
    const photo = (await avatar.boundingBox())!
    const streak = (await page.locator('.streak-button').boundingBox())!
    const menu = (await page.locator('.hamburger-button').boundingBox())!
    expect(branding.x + branding.width).toBeLessThanOrEqual(photo.x)
    expect(photo.x + photo.width).toBeLessThanOrEqual(streak.x)
    expect(streak.x + streak.width).toBeLessThanOrEqual(menu.x)
    expect(menu.x + menu.width).toBeLessThanOrEqual(width)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.reload()
  await expect(avatar).toBeVisible()
  await openMenu(page)
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(avatar).toHaveCount(0)
  await page.route('https://lh3.googleusercontent.com/broken-avatar.png', (route) => route.abort())
  await login(page, 'Diego', 'https://lh3.googleusercontent.com/broken-avatar.png')
  await page.getByRole('button', { name: /^Close menu/ }).click()
  const fallback = page.getByRole('img', { name: 'Diego profile picture', exact: true })
  await expect(fallback).toHaveText('D')
  await expect(fallback.locator('img')).toHaveCount(0)
  await openMenu(page)
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await login(page, 'NoPhoto')
  await page.getByRole('button', { name: /^Close menu/ }).click()
  await expect(page.getByRole('img', { name: 'NoPhoto profile picture', exact: true })).toHaveText(
    'N',
  )
})
