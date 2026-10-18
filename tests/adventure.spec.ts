import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import {
  newAdventure,
  chooseNode,
  availableNodes,
  developerAction,
  resolveRest,
  resolveEvent,
  leaveShop,
  returnToRoute,
  ADVENTURE_KEY,
  ITEM_IDS,
  type AdventureRun,
  type NodeKind,
} from '../src/lib/adventure'
import { questionById, mysteryById } from '../src/lib/something'
import { countryById, locationFor } from '../src/lib/countries'
import { shortestBorderRoute } from '../src/lib/journey'

function at(kind: NodeKind) {
  let run = newAdventure()
  const target = run.map.find((node) => node.kind === kind)!
  while (run.path.length < target.row) {
    run = chooseNode(run, availableNodes(run).find((node) => node.lane === 1)!.id).run
    const type = run.encounter!.kind
    run = (
      type === 'rest'
        ? resolveRest(run)
        : type === 'shop'
          ? leaveShop(run)
          : type === 'event'
            ? resolveEvent(run, 'heal')
            : developerAction(run, 'win')
    ).run
    run = returnToRoute(run).run
  }
  return chooseNode(run, target.id).run
}
async function seed(page: Page, run?: AdventureRun, unlocked = true) {
  await page.addInitScript(
    ({ run, unlocked }) => {
      if (!localStorage.getItem('somewhere.experience.v1'))
        localStorage.setItem('somewhere.experience.v1', 'somex')
      if (run && !localStorage.getItem('somex.run.v1'))
        localStorage.setItem('somex.run.v1', JSON.stringify(run))
      if (unlocked && !sessionStorage.getItem('somex.dev-unlocked.v1'))
        sessionStorage.setItem('somex.dev-unlocked.v1', 'yes')
    },
    { run, unlocked },
  )
}
const stored = (page: Page): Promise<AdventureRun> =>
  page.evaluate(() => JSON.parse(localStorage.getItem('somex.run.v1')!))
async function dev(page: Page, label: string) {
  await page.locator('.somex-devtools').evaluate((el) => ((el as HTMLDetailsElement).open = true))
  await page.getByRole('button', { name: `Dev option: ${label}`, exact: true }).click()
}
async function item(page: Page, name: string) {
  await page.getByRole('button', { name: /^Satchel/ }).click()
  await page
    .getByRole('dialog', { name: 'Your adventure satchel' })
    .getByRole('button', { name: new RegExp(`^Use ${name},`) })
    .click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}
async function triviaAnswer(page: Page, correct = true) {
  const run = await stored(page)
  const t = run.encounter!.trivia!
  const question = questionById.get(t.id)!
  const index = t.order.findIndex((i) =>
    correct ? question.choices[i] === question.answer : question.choices[i] !== question.answer,
  )
  await page.locator('.somex-stop .trivia-choice').nth(index).click()
}
async function guess(page: Page, name: string) {
  await page.getByRole('combobox', { name: /^Search for a / }).fill(name)
  await page.getByRole('listbox').getByRole('option').first().click()
  await page.getByRole('button', { name: /^(Make a guess|Cross the border)$/ }).click()
}

test('Somex is gated, unlocks with dev, grants the complete kit, saves and can be locked again', async ({
  page,
}) => {
  await seed(page, undefined, false)
  const requests: string[] = []
  page.on('request', (req) => {
    if (/\/assets\/Adventure-|\/data\/world.json/.test(req.url())) requests.push(req.url())
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Under construction', exact: true })).toBeVisible()
  await expect(page.locator('.brand-word')).toHaveText('somex.')
  expect(requests).toEqual([])
  await page.getByLabel('Developer password', { exact: true }).fill('wrong')
  await page.getByRole('button', { name: 'Unlock preview' }).click()
  await expect(page.getByRole('alert')).toContainText('didn’t match')
  await page.getByLabel('Developer password', { exact: true }).fill('dev')
  await page.getByRole('button', { name: 'Unlock preview' }).click()
  await expect(
    page.getByRole('heading', { name: 'A little adventure.', exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('status', { name: '3 of 3 hearts', exact: true })).toBeVisible()
  await expect(page.locator('.somex-route-node.reachable')).toHaveCount(3)
  const original = await stored(page)
  expect(ITEM_IDS.every((id) => original.inventory[id] > 0)).toBe(true)
  await page.getByRole('button', { name: /^Satchel/ }).click()
  await expect(page.locator('.somex-inventory-dialog .somex-item')).toHaveCount(9)
  await expect(page.getByRole('button', { name: /^Use Heart tonic,/ })).toBeDisabled()
  await page.getByRole('button', { name: 'Close dialog' }).click()
  await page.reload()
  await expect(
    page.getByRole('heading', { name: 'A little adventure.', exact: true }),
  ).toBeVisible()
  expect((await stored(page)).id).toBe(original.id)
  await page.locator('.somex-devtools').evaluate((el) => ((el as HTMLDetailsElement).open = true))
  await page.getByRole('button', { name: 'Lock developer preview' }).click()
  await expect(page.getByRole('heading', { name: 'Under construction', exact: true })).toBeVisible()
  expect((await stored(page)).id).toBe(original.id)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Under construction', exact: true })).toBeVisible()
})

test('trivia consumables, saved choices, normal trials and developer healing work through the interface', async ({
  page,
}) => {
  await seed(page, at('trivia'))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await expect(page.locator('.somex-stop .trivia-choice')).toHaveCount(4)
  await item(page, '50/50 lens')
  await expect(page.locator('.somex-eliminated')).toHaveCount(2)
  const id = (await stored(page)).encounter!.trivia!.id
  await page.reload()
  await expect(page.locator('.somex-eliminated')).toHaveCount(2)
  expect((await stored(page)).encounter!.trivia!.id).toBe(id)
  await item(page, 'Fresh page')
  expect((await stored(page)).encounter!.trivia!.id).not.toBe(id)
  await expect(page.locator('.somex-eliminated')).toHaveCount(0)
  for (let index = 0; index < 3; index++) {
    await triviaAnswer(page, index !== 1)
    if (index < 2) await page.getByRole('button', { name: 'Next question', exact: true }).click()
  }
  await expect(page.getByRole('button', { name: 'Return to the route', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Return to the route', exact: true }).click()
  await expect(page.locator('.somex-route-node.reachable')).not.toHaveCount(0)
  await dev(page, 'lose one heart')
  await expect(page.getByRole('status', { name: '2 of 3 hearts', exact: true })).toBeVisible()
  await item(page, 'Heart tonic')
  await item(page, 'Heart container')
  await expect(page.getByRole('status', { name: '4 of 4 hearts', exact: true })).toBeVisible()
  await item(page, 'Heart shield')
  await dev(page, 'lose one heart')
  await expect(page.getByRole('status', { name: '4 of 4 hearts', exact: true })).toBeVisible()
  expect((await stored(page)).shield).toBe(false)
  await dev(page, 'refill all items')
  expect((await stored(page)).inventory.potion).toBe(3)
})

test('shops, rest stops and discoveries resolve once and return to connected choices', async ({
  page,
}) => {
  await seed(page, at('shop'))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const before = await stored(page)
  await page.locator('.somex-stop .somex-item').filter({ hasText: 'Heart tonic' }).click()
  expect((await stored(page)).coins).toBe(before.coins - 8)
  await expect(
    page.locator('.somex-stop .somex-item').filter({ hasText: 'Heart tonic' }),
  ).toBeDisabled()
  await page.getByRole('button', { name: 'Leave the shop', exact: true }).click()
  await page.getByRole('button', { name: 'Return to the route', exact: true }).click()
  const rest = { ...at('rest'), hearts: 1 }
  await page.evaluate(({ key, run }) => localStorage.setItem(key, JSON.stringify(run)), {
    key: ADVENTURE_KEY,
    run: rest,
  })
  await page.reload()
  await page.getByRole('button', { name: 'Rest · +1 heart', exact: true }).click()
  await expect(page.getByRole('status', { name: '2 of 3 hearts', exact: true })).toBeVisible()
  const event = at('event')
  await page.evaluate(({ key, run }) => localStorage.setItem(key, JSON.stringify(run)), {
    key: ADVENTURE_KEY,
    run: event,
  })
  await page.reload()
  await page.getByRole('button', { name: /^Take .* \+ 10 coins$/ }).click()
  expect((await stored(page)).coins).toBe(event.coins + 10)
  expect((await stored(page)).encounter!.result).toBe('cleared')
})

for (const mode of ['countries', 'capitals', 'flags', 'shapes', 'journey'] as const)
  test(`${mode} adventure uses the real globe and search; hints and budgets survive refresh`, async ({
    page,
  }) => {
    const fixture = at(mode)
    if (mode !== 'journey') fixture.encounter!.geography!.answer = 'FRA'
    await seed(page, fixture)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    await expect(page.locator('.somex-stop [data-testid="globe"]')).toHaveAttribute(
      'data-ready',
      'true',
    )
    await item(page, 'Trail compass')
    await item(page, 'Second wind')
    await page.reload()
    await expect(page.locator('.somex-hint, .somex-stop .continent-hint')).toBeVisible()
    expect((await stored(page)).encounter!.extraUsed).toBe(true)
    if (mode === 'journey') {
      const geo = fixture.encounter!.geography!
      await guess(page, countryById.get(geo.answer)!.name)
      await expect(page.locator('.somex-stop .input-error')).toContainText('mainland border')
      expect((await stored(page)).encounter!.geography!.guesses).toHaveLength(0)
      for (const id of shortestBorderRoute(geo.start!, geo.answer)!.slice(1))
        await guess(page, countryById.get(id)!.name)
    } else {
      const wrong = locationFor(countryById.get('DEU')!, mode).name
      await guess(page, wrong)
      await guess(page, wrong)
      await expect(page.locator('.somex-stop .input-error')).toContainText('Already explored')
      expect((await stored(page)).encounter!.geography!.guesses).toHaveLength(1)
      await guess(page, locationFor(countryById.get('FRA')!, mode).name)
    }
    await expect(
      page.getByRole('button', { name: 'Return to the route', exact: true }),
    ).toBeVisible()
    expect((await stored(page)).encounter!.result).toBe('cleared')
  })

test('What am I gives clues, rejects repeats and lets a Lucky star resolve an encounter', async ({
  page,
}) => {
  const run = at('mystery')
  const answer = mysteryById.get(run.encounter!.mystery!.id)!.answer
  await seed(page, run)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await page.getByRole('button', { name: 'Reveal another clue', exact: true }).click()
  await expect(
    page.getByRole('list', { name: 'Adventure mystery clues' }).locator('li'),
  ).toHaveCount(2)
  await page.getByRole('textbox', { name: 'Your answer', exact: true }).fill('wrong')
  await page.getByRole('button', { name: 'Make a guess', exact: true }).click()
  await page.getByRole('textbox', { name: 'Your answer', exact: true }).fill('WRONG!')
  await page.getByRole('button', { name: 'Make a guess', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('already tried')
  await item(page, 'Lucky star')
  await expect(page.locator('.somex-stop-result')).toContainText(answer)
  expect((await stored(page)).inventory.star).toBe(run.inventory.star - 1)
  await expect(
    page.getByRole('list', { name: 'Adventure mystery clues' }).locator('li'),
  ).toHaveCount(5)
})

test('boss victory queues fire and trophy effects and they survive immediate restarts and experience changes', async ({
  page,
}) => {
  await seed(page, at('boss'))
  await page.goto('/')
  await expect(page.locator('.somex-stop .trivia-choice')).toHaveCount(4)
  await page.clock.install()
  await page.clock.pauseAt(new Date(Date.now() + 1000))
  for (let i = 0; i < 3; i++) {
    await triviaAnswer(page)
    if (i < 2) await page.getByRole('button', { name: 'Next question', exact: true }).click()
  }
  await expect(
    page.getByRole('heading', { name: 'The long way led you home.', exact: true }),
  ).toBeVisible()
  const canvas = page.locator('.victory-celebration')
  await expect(canvas).toHaveAttribute('data-effect', 'fire-streak')
  const original = await canvas.elementHandle()
  await page.getByRole('button', { name: 'Start a new adventure', exact: true }).click()
  expect(await original!.evaluate((el) => el.isConnected)).toBe(true)
  await page.getByRole('combobox', { name: 'Choose experience' }).selectOption('someone')
  await page.clock.runFor(900)
  await page.getByRole('combobox', { name: 'Choose experience' }).selectOption('somex')
  await page.clock.runFor(900)
  await page.clock.runFor(3100)
  await expect(canvas).toHaveAttribute('data-effect', 'perfect-round')
  await page.clock.runFor(4900)
  await expect(canvas).toHaveCount(0)
  await page.clock.resume()
  expect((await stored(page)).path).toEqual([])
})

test('developer shortcuts, defeat and corrupt saves remain recoverable', async ({ page }) => {
  await seed(page, newAdventure())
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await dev(page, 'jump to boss')
  await expect(page.getByRole('heading', { name: 'Final boss', exact: true })).toBeVisible()
  const stock = (await stored(page)).inventory.star
  await page.getByRole('button', { name: 'Dev option: win encounter', exact: true }).click()
  expect((await stored(page)).status).toBe('won')
  expect((await stored(page)).inventory.star).toBe(stock)
  await page.getByRole('button', { name: 'Start a new adventure', exact: true }).click()
  for (let i = 0; i < 4; i++) await dev(page, 'lose one heart')
  await expect(
    page.getByRole('heading', { name: 'Every ending is another beginning.', exact: true }),
  ).toBeVisible()
  await page.evaluate(() => localStorage.setItem('somex.run.v1', '{'))
  await page.reload()
  await expect(
    page.getByRole('status').filter({ hasText: 'saved adventure could not be restored' }),
  ).toBeVisible()
  await expect(page.locator('.somex-route-node.reachable')).toHaveCount(3)
})

test('blocked browser storage still allows unlocking and playing with a clear persistence warning', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new Error('blocked')
    }
    Storage.prototype.setItem = () => {
      throw new Error('blocked')
    }
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await page.getByRole('combobox', { name: 'Choose experience', exact: true }).selectOption('somex')
  await page.getByLabel('Developer password', { exact: true }).fill('dev')
  await page.getByRole('button', { name: 'Unlock preview', exact: true }).click()
  await expect(page.locator('.somex-adventure .storage-warning')).toContainText('unavailable')
  await page.getByRole('button', { name: 'General Trivia, stop 1, available', exact: true }).click()
  await expect(page.locator('.somex-stop .trivia-choice')).toHaveCount(4)
  await page.getByRole('button', { name: 'Dev option: win encounter', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Return to the route', exact: true })).toBeVisible()
})

test('gate, map, satchel and encounter are accessible at 320px in both themes', async ({
  page,
}) => {
  await seed(page, at('trivia'), false)
  await page.setViewportSize({ width: 320, height: 740 })
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'light' })
  await page.goto('/')
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([])
  await page.getByLabel('Developer password', { exact: true }).fill('dev')
  await page.getByRole('button', { name: 'Unlock preview', exact: true }).click()
  for (const theme of ['light', 'dark']) {
    if (theme === 'dark')
      await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'General Trivia', exact: true })).toBeVisible()
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([])
    await page.getByRole('button', { name: /^Satchel/ }).click()
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.getByRole('button', { name: 'Close dialog' }).click()
  }
  await dev(page, 'restart run')
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
