import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { changeTheme } from './helpers/menu'
import { countryById, locationFor } from '../src/lib/countries'
import { questionById } from '../src/lib/something'
import { dailyChoices, dailyEnded, dailyTextItem, type DailySession } from '../src/lib/daily'
const saved = (page: Page): Promise<DailySession> =>
  page.evaluate(() => JSON.parse(localStorage.getItem('somewhere.daily.v1:guest')!))
async function open(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('somewhere.experience.v1', 'daily')
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          Object.assign(window, { dailyCopied: text })
        },
      },
    })
  })
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: 'Five little discoveries.', exact: true }),
  ).toBeVisible()
}
async function solveCurrent(page: Page) {
  const session = await saved(page),
    trial = session.trials[session.index]
  if (dailyEnded(trial, session.day)) return
  if (trial.kind === 'trivia') {
    const choices = dailyChoices(trial, session.day),
      index = choices.indexOf(questionById.get(trial.id)!.answer)
    await page
      .getByRole('group', { name: questionById.get(trial.id)!.question, exact: true })
      .getByRole('button')
      .nth(index)
      .click()
  } else if (trial.kind === 'who' || trial.kind === 'mystery') {
    await page
      .getByRole('textbox', { name: 'Your answer', exact: true })
      .fill(dailyTextItem(trial).answer)
    await page.getByRole('button', { name: 'Make a guess', exact: true }).click()
  } else {
    const country = countryById.get(trial.id)!
    await page
      .getByRole('combobox', { name: /^Search for a / })
      .fill(locationFor(country, trial.kind).name)
    await page.getByRole('listbox').getByRole('option').first().click()
    await page.getByRole('button', { name: 'Make a guess', exact: true }).click()
  }
}
test('Daily Mix is a distinct experience, explicit start, same saved day and private guest board', async ({
  page,
}) => {
  const worldRequests: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/data/world.json')) worldRequests.push(request.url())
  })
  await page.addInitScript(() =>
    localStorage.setItem(
      'somewhere.round.v1',
      JSON.stringify({
        version: 2,
        mode: 'countries',
        answer: 'FRA',
        guesses: ['DEU'],
        revealed: false,
      }),
    ),
  )
  await open(page)
  await expect(page).toHaveTitle('Daily Mix — a little discovery every day')
  await expect(page.locator('.brand-word')).toHaveText('Daily Mix')
  await expect(page.getByRole('combobox', { name: 'Choose experience' })).toHaveValue('daily')
  expect(await page.evaluate(() => localStorage.getItem('somewhere.daily.v1:guest'))).toBeNull()
  expect(worldRequests).toEqual([])
  await expect(
    page.getByRole('complementary', { name: 'Private daily leaderboard' }),
  ).toContainText('Sign in to see your private board')
  await page.getByRole('button', { name: 'Start today’s mix', exact: true }).click()
  const original = await saved(page)
  expect(original.started).toBe(true)
  await page.reload()
  expect(await saved(page)).toEqual(original)
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('somewhere.round.v1')!).guesses),
  ).toEqual(['DEU'])
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).filter((k) => k.startsWith('somewhere.player.v1:')),
    ),
  ).toEqual([])
  await page.getByRole('button', { name: 'How to play', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'How to play Daily Mix' })).toContainText(
    'no speed bonus',
  )
})
test('a perfect daily mix preserves effects through results and experience switches and shares no answers', async ({
  page,
}) => {
  await open(page)
  await page.getByRole('button', { name: 'Start today’s mix', exact: true }).click()
  await page.clock.install()
  await page.clock.pauseAt(new Date(Date.now() + 1000))
  for (let i = 0; i < 5; i++) {
    await solveCurrent(page)
    await expect(page.locator('.victory-celebration')).toHaveCount(1)
    if (i < 4) {
      await page.getByRole('button', { name: 'Next discovery', exact: true }).click()
      await page.clock.runFor(4900)
    }
  }
  const last = (await page.locator('.victory-celebration').elementHandle())!
  await page.getByRole('button', { name: 'See daily results', exact: true }).click()
  expect(await last.evaluate((node) => node.isConnected)).toBe(true)
  await expect(
    page.getByRole('heading', { name: 'A perfect daily mix.', exact: true }),
  ).toBeVisible()
  await page.clock.runFor(4900)
  await expect(page.locator('.victory-celebration')).toHaveAttribute('data-effect', 'perfect-round')
  await page.getByRole('button', { name: 'Copy answer-free result', exact: true }).click()
  const text = await page.evaluate(() => (window as unknown as { dailyCopied: string }).dailyCopied)
  expect(text).toContain('5/5 solved · 500/500 points')
  const session = await saved(page)
  for (const trial of session.trials) {
    const answer =
      trial.kind === 'trivia'
        ? questionById.get(trial.id)!.answer
        : trial.kind === 'who' || trial.kind === 'mystery'
          ? dailyTextItem(trial).answer
          : countryById.get(trial.id)!.name
    expect(text).not.toContain(answer)
  }
  await page.getByRole('combobox', { name: 'Choose experience' }).selectOption('something')
  await expect(page.locator('.victory-celebration')).toHaveAttribute('data-effect', 'perfect-round')
  await page.clock.runFor(4900)
  await expect(page.locator('.victory-celebration')).toHaveCount(0)
  await page.reload()
  expect((await saved(page)).index).toBe(5)
})
test('reveals do not award points, daily boundaries reset at noon, and refresh never replays a win', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-10-20T16:59:55Z') })
  await open(page)
  await page.getByRole('button', { name: 'Start today’s mix', exact: true }).click()
  await page.getByRole('button', { name: 'Give up and reveal answer', exact: true }).click()
  expect((await saved(page)).trials[0].revealed).toBe(true)
  await expect(page.locator('.victory-celebration')).toHaveCount(0)
  const yesterday = (await saved(page)).day
  await page.clock.runFor(6000)
  await expect(page.getByRole('button', { name: 'Start today’s mix', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Start today’s mix', exact: true }).click()
  expect((await saved(page)).day).toBe(yesterday + 1)
  expect((await saved(page)).trials[0].revealed).toBe(false)
  await page.reload()
  await expect(page.locator('.victory-celebration')).toHaveCount(0)
})
test('daily landing, question, globe and results fit 320px in both themes', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await open(page)
  for (const theme of ['light', 'dark'] as const) {
    if ((await page.locator('html').getAttribute('data-theme')) !== theme)
      await changeTheme(page, theme)
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([])
  }
  await page.getByRole('button', { name: 'Start today’s mix', exact: true }).click()
  await solveCurrent(page)
  await page.getByRole('button', { name: 'Next discovery', exact: true }).click()
  await expect(page.getByTestId('globe')).toHaveAttribute('data-ready', 'true')
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  for (let i = 1; i < 5; i++) {
    await page.getByRole('button', { name: 'Give up and reveal answer', exact: true }).click()
    await page
      .getByRole('button', { name: i === 4 ? 'See daily results' : 'Next discovery', exact: true })
      .click()
  }
  await expect(page.getByRole('button', { name: 'Copy answer-free result' })).toBeVisible()
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([])
})
