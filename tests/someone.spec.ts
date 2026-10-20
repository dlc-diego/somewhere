import { changeTheme } from './helpers/menu'
import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { SOMEONE_KEY } from '../src/lib/someone'
import type { MysteryRound, Session } from '../src/lib/mystery'

async function seed(
  page: Page,
  options: { id?: string; clues?: number; guesses?: string[]; revealed?: boolean } = {},
) {
  await page.addInitScript(
    ({ key, options }) => {
      if (!localStorage.getItem('somewhere.experience.v1'))
        localStorage.setItem('somewhere.experience.v1', 'someone')
      if (!localStorage.getItem(key))
        localStorage.setItem(
          key,
          JSON.stringify({
            version: 1,
            seen: [],
            round: {
              version: 1,
              id: options.id || 'person-einstein',
              cluesShown: options.clues || 1,
              guesses: options.guesses || [],
              revealed: options.revealed || false,
            },
          }),
        )
    },
    { key: SOMEONE_KEY, options },
  )
}
const stored = (page: Page): Promise<Session<MysteryRound>> =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), SOMEONE_KEY)
const answer = (page: Page) => page.getByRole('textbox', { name: 'Your answer', exact: true })
async function guess(page: Page, value: string) {
  await answer(page).fill(value)
  await page.getByRole('button', { name: 'Make a guess', exact: true }).click()
}
async function switchTo(page: Page, value: string) {
  await page.getByRole('combobox', { name: 'Choose experience', exact: true }).selectOption(value)
  await expect(page.locator('.app-shell')).toHaveAttribute('data-experience', value)
  await expect(page.locator('.experience-transition')).toHaveCount(0)
}

test('Who am I keeps clues and guesses through reload, rejects repeats and accepts name aliases', async ({
  page,
}) => {
  await seed(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Who am I', exact: true })).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Someone game mode', exact: true })).toHaveValue(
    'who',
  )
  await expect(page.getByRole('list', { name: 'Who am I clues' }).locator('li')).toHaveCount(1)
  await expect(page.locator('#someone-content')).not.toContainText('Albert Einstein')
  await guess(page, 'A different person')
  await expect(page.getByRole('list', { name: 'Who am I guesses' })).toContainText(
    'A different person',
  )
  await guess(page, '  A DIFFERENT PERSON! ')
  await expect(page.getByRole('alert')).toContainText('already tried')
  expect((await stored(page)).round.guesses).toHaveLength(1)
  await page.getByRole('button', { name: 'Reveal another clue', exact: true }).click()
  await page.reload()
  await expect(page.getByRole('list', { name: 'Who am I clues' }).locator('li')).toHaveCount(2)
  expect((await stored(page)).round.id).toBe('person-einstein')
  await guess(page, '!!!')
  await expect(page.getByRole('alert')).toContainText('Enter an answer')
  await guess(page, '  EINSTEIN! ')
  await expect(
    page.getByRole('heading', { name: 'You found them. Albert Einstein!', exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('list', { name: 'Who am I clues' }).locator('li')).toHaveCount(5)
  await expect(
    page.getByRole('list', { name: 'Who am I guesses' }).getByLabel('Correct answer'),
  ).toBeVisible()
  await expect(answer(page)).toHaveCount(0)
  await page.getByRole('button', { name: 'Try another person', exact: true }).click()
  await expect(answer(page)).toBeVisible()
  expect((await stored(page)).round.id).not.toBe('person-einstein')
  expect((await stored(page)).seen).toContain('person-einstein')
})

test('revealing all clues is free and giving up reveals without a winning animation', async ({
  page,
}) => {
  await seed(page)
  await page.goto('/')
  for (let i = 0; i < 4; i++)
    await page.getByRole('button', { name: 'Reveal another clue', exact: true }).click()
  await expect(page.getByRole('button', { name: 'All clues revealed', exact: true })).toBeDisabled()
  expect((await stored(page)).round.guesses).toEqual([])
  await page.getByRole('button', { name: 'Give up and reveal answer', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'The answer was Albert Einstein.', exact: true }),
  ).toBeVisible()
  await expect(page.locator('.victory-celebration')).toHaveCount(0)
  expect((await stored(page)).round.revealed).toBe(true)
  await page.reload()
  await expect(
    page.getByRole('heading', { name: 'The answer was Albert Einstein.', exact: true }),
  ).toBeVisible()
  await expect(page.locator('.victory-celebration')).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Give up and reveal answer', exact: true }),
  ).toHaveCount(0)
})

test('a correct name starts the existing celebration immediately and it finishes across new people and menu switches', async ({
  page,
}) => {
  await seed(page, { id: 'person-beyonce' })
  await page.goto('/')
  await expect(answer(page)).toBeVisible()
  await page.clock.install()
  await page.clock.pauseAt(new Date(Date.now() + 1000))
  await guess(page, 'Beyonce')
  const canvas = page.locator('.victory-celebration')
  await expect(canvas).toHaveCount(1)
  const original = await canvas.elementHandle()
  await page.getByRole('button', { name: 'Try another person', exact: true }).click()
  expect(await original!.evaluate((el) => el.isConnected)).toBe(true)
  await page.getByRole('combobox', { name: 'Choose experience' }).selectOption('something')
  await page.clock.runFor(900)
  await page.getByRole('combobox', { name: 'Choose experience' }).selectOption('someone')
  await page.clock.runFor(900)
  expect(await original!.evaluate((el) => el.isConnected)).toBe(true)
  await page.clock.runFor(4000)
  await expect(canvas).toHaveCount(0)
  await page.clock.resume()
  await expect(answer(page)).toBeVisible()
})

test('Who am I and What am I keep independent progress and unfinished input when switching', async ({
  page,
}) => {
  await seed(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await guess(page, 'Wrong person')
  await page.getByRole('button', { name: 'Reveal another clue', exact: true }).click()
  await answer(page).fill('An unfinished name')
  const before = await stored(page)
  await switchTo(page, 'something')
  await page
    .getByRole('combobox', { name: 'Something game mode', exact: true })
    .selectOption('mystery')
  await guess(page, 'A wrong thing')
  await page.getByRole('button', { name: 'Reveal another clue', exact: true }).click()
  const other = await page.evaluate(() => localStorage.getItem('something.mystery.v1'))
  await switchTo(page, 'someone')
  await expect(answer(page)).toHaveValue('An unfinished name')
  await expect(page.getByRole('list', { name: 'Who am I clues' }).locator('li')).toHaveCount(2)
  expect(await stored(page)).toEqual(before)
  expect(await page.evaluate(() => localStorage.getItem('something.mystery.v1'))).toBe(other)
  await page.getByRole('button', { name: 'How to play', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'How to play Someone' })).toContainText('80-person')
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click()
  await page.reload()
  await expect(page.getByRole('list', { name: 'Who am I clues' }).locator('li')).toHaveCount(2)
})

test('Who am I has accessible mobile layouts in both themes including feedback, history and instructions', async ({
  page,
}) => {
  await seed(page, { guesses: ['A wrong person'], clues: 3 })
  await page.setViewportSize({ width: 320, height: 740 })
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'light' })
  await page.goto('/')
  for (const theme of ['light', 'dark']) {
    if (theme === 'dark') await changeTheme(page, 'dark')
    await expect(answer(page)).toBeVisible()
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.getByRole('button', { name: 'How to play', exact: true }).click()
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([])
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click()
  }
  await page.getByRole('button', { name: 'Give up and reveal answer', exact: true }).click()
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([])
})

test('corrupt Who am I saves recover independently and unavailable storage still allows play', async ({
  page,
}) => {
  await seed(page, { id: 'missing' })
  await page.addInitScript(() =>
    localStorage.setItem('something.mystery.v1', 'other game untouched'),
  )
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await expect(page.locator('#someone-content .storage-warning')).toContainText('fresh mystery')
  expect(await page.evaluate(() => localStorage.getItem('something.mystery.v1'))).toBe(
    'other game untouched',
  )
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new Error('blocked')
    }
    Storage.prototype.setItem = () => {
      throw new Error('blocked')
    }
  })
  await page.reload()
  await switchTo(page, 'someone')
  await expect(page.locator('#someone-content .storage-warning')).toContainText('unavailable')
  await expect(answer(page)).toBeVisible()
  await page.getByRole('button', { name: 'Give up and reveal answer', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Try another person', exact: true })).toBeVisible()
})
