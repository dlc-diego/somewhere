import { changeTheme } from './helpers/menu'
import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { questionById } from '../src/lib/something'

const mode = (page: Page) =>
  page.getByRole('combobox', { name: 'Something game mode', exact: true })
const answers = [
  'Three',
  'Blue whale',
  'Platypus',
  'Tadpole',
  'Beaver',
  'Feet',
  'Hummingbird',
  'Cartilage',
  'Koala',
  'Giraffe',
]
async function seed(
  page: Page,
  settings: {
    mode?: 'trivia' | 'mystery'
    responses?: number[]
    index?: number
    guesses?: string[]
    clues?: number
  } = {},
) {
  await page.addInitScript((settings) => {
    if (!localStorage.getItem('somewhere.experience.v1'))
      localStorage.setItem('somewhere.experience.v1', 'something')
    if (!localStorage.getItem('something.mode.v1'))
      localStorage.setItem('something.mode.v1', settings.mode || 'trivia')
    if (!localStorage.getItem('something.trivia.v1'))
      localStorage.setItem(
        'something.trivia.v1',
        JSON.stringify({
          version: 1,
          seen: [],
          round: {
            version: 1,
            ids: Array.from({ length: 10 }, (_, i) => `animal-${String(i + 1).padStart(2, '0')}`),
            orders: Array.from({ length: 10 }, () => [0, 1, 2, 3]),
            responses: settings.responses || [],
            index: settings.index || 0,
          },
        }),
      )
    if (!localStorage.getItem('something.mystery.v1'))
      localStorage.setItem(
        'something.mystery.v1',
        JSON.stringify({
          version: 1,
          seen: [],
          round: {
            version: 1,
            id: 'refrigerator',
            cluesShown: settings.clues || 1,
            guesses: settings.guesses || [],
            revealed: false,
          },
        }),
      )
    const original = CanvasRenderingContext2D.prototype.fillText
    Object.assign(window, { drawnSymbols: [] as string[] })
    CanvasRenderingContext2D.prototype.fillText = function (text, x, y, ...rest) {
      const state = window as unknown as { drawnSymbols: string[] }
      if (!state.drawnSymbols.includes(text)) state.drawnSymbols.push(text)
      return original.call(this, text, x, y, ...rest)
    }
  }, settings)
}
async function choose(page: Page, index: number, correct = true) {
  const choices = page.getByRole('group', { name: /\?$/ }).getByRole('button')
  if (correct) await choices.filter({ hasText: answers[index] }).click()
  else await choices.nth(1).click()
}
async function finishEffect(page: Page) {
  await page.clock.runFor(4900)
  await expect(page.locator('.victory-celebration')).toHaveCount(0)
}
async function guess(page: Page, text: string) {
  await page.getByRole('textbox', { name: 'Your answer', exact: true }).fill(text)
  await page.getByRole('button', { name: 'Make a guess' }).click()
}

test('General Trivia locks answers, escalates fire at three, resets on a miss and preserves progress', async ({
  page,
}) => {
  await seed(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'General Trivia', exact: true })).toBeVisible()
  const originalIds: string[] = await page.evaluate(
    () => JSON.parse(localStorage.getItem('something.trivia.v1')!).round.ids,
  )
  await page.clock.install()
  await page.clock.pauseAt(new Date(Date.now() + 1000))
  for (let index = 0; index < 4; index++) {
    await choose(page, index)
    const canvas = page.locator('.victory-celebration')
    await expect(canvas).toHaveCount(1)
    if (index < 2)
      expect([
        'confetti',
        'fireworks',
        'emoji-parade',
        'heart-fountains',
        'shooting-stars',
        'rainbow-bubbles',
      ]).toContain(await canvas.getAttribute('data-effect'))
    else {
      await expect(canvas).toHaveAttribute('data-effect', 'fire-streak')
      await expect(canvas).toHaveAttribute('data-intensity', String(index + 1))
      await expect(
        page.getByRole('status', {
          name: `On Fire. ${index + 1} correct answers in a row`,
          exact: true,
        }),
      ).toBeVisible()
      await page.clock.runFor(400)
      expect(
        await page.evaluate(() =>
          (window as unknown as { drawnSymbols: string[] }).drawnSymbols.includes('🔥'),
        ),
      ).toBe(true)
    }
    await expect(page.locator('.trivia-choices button:disabled')).toHaveCount(4)
    await finishEffect(page)
    await page.getByRole('button', { name: 'Next question' }).click()
  }
  await choose(page, 4, false)
  await expect(page.locator('.answer-feedback')).toContainText('Not quite. The answer is Beaver.')
  await expect(
    page.getByRole('status', { name: '0 correct answers in a row', exact: true }),
  ).toBeVisible()
  await expect(page.getByText('On Fire', { exact: true })).toHaveCount(0)
  await expect(page.locator('.victory-celebration')).toHaveCount(0)
  // A second event cannot edit the answer or trigger a celebration.
  await page.locator('.trivia-choice').first().dispatchEvent('click')
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('something.trivia.v1')!).round.responses,
    ),
  ).toEqual([0, 0, 0, 0, 1])
  await page.getByRole('button', { name: 'Next question' }).click()
  await choose(page, 5)
  await expect(page.locator('.victory-celebration')).not.toHaveAttribute(
    'data-effect',
    'fire-streak',
  )
  await finishEffect(page)
  await page.clock.resume()
  await page.reload()
  await expect(page.locator('.answer-feedback')).toContainText('Correct!')
  await expect(
    page.getByRole('status', { name: '1 correct answer in a row', exact: true }),
  ).toBeVisible()
  await mode(page).selectOption('mystery')
  await expect(page.getByRole('list', { name: 'Mystery clues' }).locator('li')).toHaveCount(1)
  await mode(page).selectOption('trivia')
  await expect(page.locator('.trivia-choices button:disabled')).toHaveCount(4)
  for (let index = 6; index < 10; index++) {
    await page.getByRole('button', { name: 'Next question' }).click()
    await choose(page, index, false)
  }
  await page.getByRole('button', { name: 'See your results' }).click()
  await expect(page.locator('.trivia-score')).toHaveText('5 / 10')
  await page.getByRole('button', { name: 'Play another round' }).click()
  await expect(
    page.getByRole('status', { name: '0 correct answers in a row', exact: true }),
  ).toBeVisible()
  const fresh = await page.evaluate(
    () => JSON.parse(localStorage.getItem('something.trivia.v1')!).round,
  )
  expect(fresh.responses).toEqual([])
  expect(fresh.ids.some((id: string) => originalIds.includes(id))).toBe(false)
})

test('perfect rounds queue their own trophy animation and all effects survive new rounds and experience changes', async ({
  page,
}) => {
  await seed(page, { responses: Array(9).fill(0), index: 9 })
  await page.goto('/')
  await page.clock.install()
  await page.clock.pauseAt(new Date(Date.now() + 1000))
  await expect(page.locator('.victory-celebration')).toHaveCount(0)
  await choose(page, 9)
  const canvas = page.locator('.victory-celebration')
  await expect(canvas).toHaveAttribute('data-effect', 'fire-streak')
  await expect(canvas).toHaveAttribute('data-intensity', '10')
  const original = (await canvas.elementHandle())!
  await page.getByRole('button', { name: 'See your results' }).click()
  await expect(page.getByRole('heading', { name: 'A perfect little round.' })).toBeVisible()
  await page.getByRole('button', { name: 'Play another round' }).click()
  await mode(page).selectOption('mystery')
  await page.getByRole('combobox', { name: 'Choose experience' }).selectOption('somewhere')
  await page.clock.runFor(900)
  await page.getByRole('combobox', { name: 'Choose experience' }).selectOption('something')
  await page.clock.runFor(900)
  expect(await original.evaluate((el) => el.isConnected)).toBe(true)
  await expect(canvas).toHaveAttribute('data-intensity', '10')
  await page.clock.fastForward(2400)
  expect(await original.evaluate((el) => el.isConnected)).toBe(true)
  await page.clock.runFor(800)
  await expect(canvas).toHaveAttribute('data-effect', 'perfect-round')
  const perfect = (await canvas.elementHandle())!
  await page.clock.runFor(200)
  expect(
    await page.evaluate(() =>
      (window as unknown as { drawnSymbols: string[] }).drawnSymbols.includes('🏆'),
    ),
  ).toBe(true)
  const box = (await canvas.boundingBox())!
  expect(box.width).toBe(page.viewportSize()!.width)
  expect(box.height).toBe(page.viewportSize()!.height)
  await page.clock.fastForward(3900)
  expect(await perfect.evaluate((el) => el.isConnected)).toBe(true)
  await page.clock.runFor(900)
  await expect(canvas).toHaveCount(0)
})

test('What am I saves clues, rejects duplicates, accepts aliases and celebrates a solved mystery', async ({
  page,
}) => {
  await seed(page, { mode: 'mystery' })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'What am I', exact: true })).toBeVisible()
  await expect(page.getByText('Refrigerator', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('list', { name: 'Mystery clues' }).locator('li')).toHaveCount(1)
  await guess(page, 'oven')
  await page.getByRole('button', { name: 'Reveal another clue' }).click()
  await guess(page, 'the OVEN!')
  await expect(page.getByRole('alert')).toContainText('already tried')
  await expect(page.getByRole('list', { name: 'Mystery guesses' }).locator('li')).toHaveCount(1)
  await page.reload()
  await expect(mode(page)).toHaveValue('mystery')
  await expect(page.getByRole('list', { name: 'Mystery clues' }).locator('li')).toHaveCount(2)
  await mode(page).selectOption('trivia')
  await expect(page.getByRole('progressbar', { name: 'Questions answered' })).toHaveAttribute(
    'aria-valuenow',
    '0',
  )
  await mode(page).selectOption('mystery')
  await guess(page, 'A FRIDGE!')
  await expect(page.getByRole('heading', { name: 'You found it. Refrigerator!' })).toBeVisible()
  await expect(page.locator('.victory-celebration')).toHaveCount(1)
  const canvas = (await page.locator('.victory-celebration').elementHandle())!
  await expect(page.getByRole('list', { name: 'Mystery clues' }).locator('li')).toHaveCount(5)
  await expect(page.getByRole('button', { name: 'Give up and reveal answer' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Try another mystery' }).click()
  expect(await canvas.evaluate((el) => el.isConnected)).toBe(true)
  await expect(page.getByRole('list', { name: 'Mystery clues' }).locator('li')).toHaveCount(1)
  const fresh = await page.evaluate(
    () => JSON.parse(localStorage.getItem('something.mystery.v1')!).round,
  )
  expect(fresh.id).not.toBe('refrigerator')
  expect(fresh.guesses).toEqual([])
})

for (const guesses of [[], ['oven']]) {
  test(`giving up What am I after ${guesses.length} guesses reveals without celebrating`, async ({
    page,
  }) => {
    await seed(page, { mode: 'mystery', guesses, clues: 2 })
    await page.goto('/')
    await page.getByRole('button', { name: 'Give up and reveal answer' }).click()
    await expect(page.getByRole('heading', { name: 'The answer was Refrigerator.' })).toBeVisible()
    await expect(page.getByRole('list', { name: 'Mystery clues' }).locator('li')).toHaveCount(5)
    await expect(page.locator('.victory-celebration')).toHaveCount(0)
    const stored = await page.evaluate(
      () => JSON.parse(localStorage.getItem('something.mystery.v1')!).round,
    )
    expect(stored).toMatchObject({ guesses, revealed: true, cluesShown: 2 })
    await page.reload()
    await expect(page.getByRole('heading', { name: 'The answer was Refrigerator.' })).toBeVisible()
    await expect(page.locator('.victory-celebration')).toHaveCount(0)
    await page.getByRole('button', { name: 'Try another mystery' }).click()
    await expect(page.getByRole('textbox', { name: 'Your answer' })).toBeEnabled()
  })
}

test('both Something games are accessible at 320px in both themes, including feedback and help', async ({
  page,
}) => {
  await seed(page)
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'light' })
  await page.setViewportSize({ width: 320, height: 740 })
  await page.goto('/')
  for (const theme of ['light', 'dark']) {
    if (theme === 'dark') await changeTheme(page, 'dark')
    for (const value of ['trivia', 'mystery']) {
      await mode(page).selectOption(value)
      if (value === 'trivia' && theme === 'light') await choose(page, 0, false)
      if (value === 'mystery') {
        if (theme === 'light') {
          await page.getByRole('button', { name: 'Reveal another clue' }).click()
          await guess(page, 'oven')
        }
        for (let i = 0; i < 4; i++) {
          const button = page.getByRole('button', { name: 'Reveal another clue' })
          if (await button.count()) await button.click()
        }
        await expect(page.getByRole('button', { name: 'All clues revealed' })).toBeDisabled()
      }
      expect(
        (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
          .violations,
      ).toEqual([])
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
    }
  }
  await page.getByRole('button', { name: 'How to play' }).click()
  await expect(page.getByRole('dialog')).toContainText('General Trivia')
  await expect(page.getByRole('dialog')).toContainText('What am I')
  await expect(page.getByRole('dialog')).toContainText('On Fire')
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([])
  await page.getByRole('button', { name: 'Let’s play' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('reduced-motion perfect rounds and completed-round reloads stay static', async ({ page }) => {
  await seed(page, { responses: Array(9).fill(0), index: 9 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await choose(page, 9)
  await expect(page.locator('.victory-celebration')).toHaveCount(0)
  await page.getByRole('button', { name: 'See your results' }).click()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'A perfect little round.' })).toBeVisible()
  await expect(page.locator('.trivia-score')).toHaveText('10 / 10')
  await expect(page.locator('.victory-celebration')).toHaveCount(0)
})

test('Something remains playable with blocked storage and corrupt saves recover independently', async ({
  page,
}) => {
  await seed(page, { mode: 'mystery', guesses: ['oven'] })
  await page.addInitScript(() => {
    localStorage.setItem('something.trivia.v1', '{')
  })
  await page.goto('/')
  await expect(
    page.getByText(
      'A saved Something round could not be read. A fresh round is ready for that game.',
    ),
  ).toBeVisible()
  await expect(page.getByRole('list', { name: 'Mystery guesses' })).toContainText('oven')
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new Error('blocked')
    }
    Storage.prototype.setItem = () => {
      throw new Error('blocked')
    }
  })
  await page.reload()
  // Without preferences, the default experience is Somewhere.
  await page.getByRole('combobox', { name: 'Choose experience' }).selectOption('something')
  await expect(page.getByRole('heading', { name: 'General Trivia', exact: true })).toBeVisible()
  await expect(
    page.getByText('Browser storage is unavailable. These rounds may not survive a refresh.'),
  ).toBeVisible()
  await page.locator('.trivia-choice').first().click()
  await expect(page.getByRole('button', { name: 'Next question' })).toBeVisible()
  await mode(page).selectOption('mystery')
  await page.getByRole('button', { name: 'Give up and reveal answer' }).click()
  await expect(page.getByRole('button', { name: 'Try another mystery' })).toBeVisible()
})

test('new rounds balance ten categories, offer harder questions, and keep a started round when changing preferences', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('somewhere.experience.v1', 'something'))
  await page.setViewportSize({ width: 320, height: 740 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const difficulty = page.getByRole('combobox', { name: 'Round difficulty', exact: true })
  await expect(difficulty).toHaveValue('standard')
  const stored = () =>
    page.evaluate(() => JSON.parse(localStorage.getItem('something.trivia.v1')!).round)
  const first = await stored()
  expect(new Set(first.ids.map((id: string) => questionById.get(id)!.category)).size).toBe(10)
  await difficulty.selectOption('hard')
  const hard = await stored()
  expect(new Set(hard.ids.map((id: string) => questionById.get(id)!.category)).size).toBe(10)
  expect(hard.ids.every((id: string) => questionById.get(id)!.difficulty === 'hard')).toBe(true)
  const question = questionById.get(hard.ids[0])!
  const correct = hard.orders[0].findIndex(
    (index: number) => question.choices[index] === question.answer,
  )
  await page.locator('.trivia-choice').nth(correct).click()
  await difficulty.selectOption('standard')
  expect((await stored()).ids).toEqual(hard.ids)
  expect((await stored()).responses).toEqual([correct])
  await expect(
    page.getByText('Your next round will use the standard mix.', { exact: true }),
  ).toBeVisible()
  await page.reload()
  expect((await stored()).ids).toEqual(hard.ids)
  expect((await stored()).responses).toEqual([correct])
  await expect(difficulty).toHaveValue('standard')
  for (const theme of ['light', 'dark']) {
    await page.evaluate((theme) => (document.documentElement.dataset.theme = theme), theme)
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
})

test('a likely spelling slip preserves the mystery input and guess count until corrected', async ({
  page,
}) => {
  await seed(page, { mode: 'mystery' })
  await page.goto('/')
  await guess(page, 'frigde')
  await expect(page.getByRole('alert')).toContainText('no guess was used')
  await expect(page.getByRole('textbox', { name: 'Your answer', exact: true })).toHaveValue(
    'frigde',
  )
  await expect(page.getByRole('list', { name: 'Mystery guesses' })).toHaveCount(0)
  await guess(page, 'fridge')
  await expect(page.getByText('You found it. Refrigerator!', { exact: true })).toBeVisible()
})
