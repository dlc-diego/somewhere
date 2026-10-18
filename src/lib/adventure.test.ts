import { afterEach, describe, expect, it, vi } from 'vitest'
import { countries } from './countries'
import { shortestBorderRoute } from './journey'
import { mysteryById, questionById } from './something'
import {
  ADVENTURE_KEY,
  ITEM_IDS,
  ITEMS,
  abandonEncounter,
  answerAdventureTrivia,
  availableNodes,
  buyItem,
  chooseNode,
  developerAction,
  guessAdventureCountry,
  guessAdventureMystery,
  itemUnavailable,
  leaveShop,
  loadAdventure,
  newAdventure,
  nextAdventureQuestion,
  parseAdventure,
  resolveEvent,
  resolveRest,
  returnToRoute,
  revealAdventureClue,
  triviaChoices,
  useItem,
  type AdventureRun,
  type NodeKind,
} from './adventure'

afterEach(() => vi.unstubAllGlobals())
function closeStop(run: AdventureRun) {
  const kind = run.encounter!.kind
  const done =
    kind === 'rest'
      ? resolveRest(run)
      : kind === 'shop'
        ? leaveShop(run)
        : kind === 'event'
          ? resolveEvent(run, 'supplies')
          : developerAction(run, 'win')
  return returnToRoute(done.run).run
}
function at(kind: NodeKind) {
  let run = newAdventure()
  const target = run.map.find((node) => node.kind === kind)!
  while (run.path.length < target.row) {
    run = chooseNode(run, availableNodes(run).find((node) => node.lane === 1)!.id).run
    run = closeStop(run)
  }
  return chooseNode(run, target.id).run
}
function answer(run: AdventureRun, correct = true) {
  const choices = triviaChoices(run.encounter!)
  const correctAnswer = questionById.get(run.encounter!.trivia!.id)!.answer
  return answerAdventureTrivia(
    run,
    choices.findIndex((choice) => (correct ? choice === correctAnswer : choice !== correctAnswer)),
  ).run
}
const restore = (run: AdventureRun) => parseAdventure(JSON.stringify(run))

describe('adventure routes and outcomes', () => {
  it('generates connected branches, two guaranteed rests and one final boss; rejects skips and duplicate entries', () => {
    const run = newAdventure()
    expect(run.map).toHaveLength(18)
    expect(availableNodes(run)).toHaveLength(3)
    expect(run.map.filter((node) => node.kind === 'rest').map((node) => node.row)).toEqual([3, 6])
    expect(chooseNode(run, run.map.find((node) => node.kind === 'boss')!.id).run).toBe(run)
    const left = run.map.find((node) => node.row === 0 && node.lane === 0)!
    const active = chooseNode(run, left.id).run
    expect(availableNodes(active)).toEqual([])
    expect(chooseNode(active, left.id).error).toBeTruthy()
    const map = closeStop(active)
    expect(availableNodes(map).map((node) => node.lane)).toEqual([0, 1])
    expect(chooseNode(map, '1-2').error).toBeTruthy()
    expect(restore(map)).toEqual(map)
  })
  it('completes eight stops, grants each reward once, and makes victory terminal', () => {
    let run = newAdventure()
    for (let row = 0; row < 8; row++) {
      run = chooseNode(run, availableNodes(run).find((node) => node.lane === 1)!.id).run
      expect(restore(run)).toEqual(run)
      if (row === 7) run = developerAction(run, 'win').run
      else run = closeStop(run)
      expect(restore(run)).toEqual(run)
    }
    expect(run.status).toBe('won')
    expect(Object.keys(run.outcomes)).toHaveLength(8)
    expect(availableNodes(run)).toEqual([])
    expect(developerAction(run, 'win').run).toBe(run)
    expect(useItem(run, 'star').run).toBe(run)
  })
  it('requires two of three normal trivia answers, locks responses, and charges one heart for a failed trial', () => {
    for (const pattern of [
      [true, false, true],
      [false, true, false],
    ]) {
      let run = at('trivia')
      const hearts = run.hearts
      const coins = run.coins
      for (let index = 0; index < 3; index++) {
        run = answer(run, pattern[index])
        expect(answerAdventureTrivia(run, 0).error).toBeTruthy()
        if (index < 2) run = nextAdventureQuestion(run).run
      }
      const success = pattern.filter(Boolean).length >= 2
      expect(run.encounter!.result).toBe(success ? 'cleared' : 'failed')
      expect(run.hearts).toBe(hearts - Number(!success))
      expect(run.coins).toBe(coins + (success ? 20 : 0))
      expect(restore(run)).toEqual(run)
    }
  })
  it('resets boss streaks on a wrong answer, applies damage, and wins only at three consecutive correct answers', () => {
    let run = at('boss')
    run = answer(run)
    run = nextAdventureQuestion(run).run
    run = answer(run)
    run = nextAdventureQuestion(run).run
    run = answer(run, false)
    expect(run.encounter!.trivia!.streak).toBe(0)
    expect(run.hearts).toBe(2)
    run = nextAdventureQuestion(run).run
    for (let i = 0; i < 3; i++) {
      run = answer(run)
      if (i < 2) run = nextAdventureQuestion(run).run
    }
    expect(run.status).toBe('won')
    expect(run.encounter!.trivia!.streak).toBe(3)
    expect(restore(run)).toEqual(run)
  })
  it('elite trials require two consecutive correct answers', () => {
    let run = at('elite')
    run = answer(run)
    expect(run.encounter!.result).toBe('active')
    run = answer(nextAdventureQuestion(run).run)
    expect(run.encounter!.result).toBe('cleared')
    expect(restore(run)).toEqual(run)
  })
})

describe('consumables and recovery', () => {
  it('grants every item, prevents wasted healing, caps containers at five and spends items exactly once', () => {
    let run = newAdventure()
    expect(ITEM_IDS.every((id) => run.inventory[id] > 0)).toBe(true)
    expect(useItem(run, 'potion').error).toMatch(/full/)
    run = developerAction(run, 'hurt').run
    run = useItem(run, 'potion').run
    expect(run.hearts).toBe(3)
    expect(run.inventory.potion).toBe(2)
    run = useItem(useItem(run, 'container').run, 'container').run
    expect(run.maxHearts).toBe(5)
    expect(run.hearts).toBe(5)
    const blocked = useItem({ ...run, inventory: { ...run.inventory, container: 1 } }, 'container')
    expect(blocked.error).toBeTruthy()
    expect(blocked.run.inventory.container).toBe(1)
    expect(restore(run)).toEqual(run)
  })
  it('blocks one loss with a shield, automatically revives once with a feather, then ends at zero hearts', () => {
    let run = useItem(newAdventure(), 'shield').run
    expect(useItem(run, 'shield').error).toBeTruthy()
    run = developerAction(run, 'hurt').run
    expect(run.hearts).toBe(3)
    expect(run.shield).toBe(false)
    run = { ...run, hearts: 1 }
    expect(itemUnavailable(run, 'feather')).toMatch(/automatically/)
    run = developerAction(run, 'hurt').run
    expect(run.hearts).toBe(1)
    expect(run.inventory.feather).toBe(0)
    expect(restore(run)).toEqual(run)
    run = developerAction(run, 'hurt').run
    expect(run.hearts).toBe(0)
    expect(run.status).toBe('lost')
    expect(restore(run)).toEqual(run)
    expect(useItem(run, 'potion').error).toBeTruthy()
  })
  it('50/50 removes exactly two wrong choices, never the answer, and cannot be repeated on the same question', () => {
    let run = useItem(at('trivia'), 'fifty').run
    const trial = run.encounter!.trivia!
    expect(trial.eliminated).toHaveLength(2)
    for (const index of trial.eliminated)
      expect(triviaChoices(run.encounter!)[index]).not.toBe(questionById.get(trial.id)!.answer)
    expect(run.inventory.fifty).toBe(2)
    expect(useItem(run, 'fifty').error).toBeTruthy()
    expect(answerAdventureTrivia(run, trial.eliminated[0]).error).toBeTruthy()
    expect(restore(run)).toEqual(run)
    run = nextAdventureQuestion(answer(run)).run
    expect(run.encounter!.trivia!.eliminated).toEqual([])
    expect(useItem(run, 'fifty').error).toBeUndefined()
  })
  it('rerolls an unanswered question without changing a streak or score and refuses answered questions', () => {
    let run = at('boss')
    run = answer(run)
    expect(useItem(run, 'reroll').error).toBeTruthy()
    run = nextAdventureQuestion(run).run
    const prior = run.encounter!.trivia!
    const stock = run.inventory.reroll
    run = useItem(run, 'reroll').run
    expect(run.encounter!.trivia!.id).not.toBe(prior.id)
    expect(run.encounter!.trivia!.streak).toBe(1)
    expect(run.encounter!.trivia!.score).toBe(1)
    expect(run.inventory.reroll).toBe(stock - 1)
    expect(restore(run)).toEqual(run)
  })
  it('Lucky stars auto-win challenges and bosses; the developer option does not consume inventory', () => {
    for (const action of ['item', 'dev']) {
      const original = at('boss')
      const done =
        action === 'item' ? useItem(original, 'star').run : developerAction(original, 'win').run
      expect(done.status).toBe('won')
      expect(done.inventory.star).toBe(original.inventory.star - Number(action === 'item'))
      expect(done.encounter!.method).toBe(action)
      expect(restore(done)).toEqual(done)
      expect(useItem(done, 'star').run).toBe(done)
    }
  })
  it('rests heal one heart and discoveries pay their chosen reward only once', () => {
    let run = at('rest')
    run = developerAction(run, 'hurt').run
    run = resolveRest(run).run
    expect(run.hearts).toBe(3)
    expect(resolveRest(run).error).toBeTruthy()
    expect(restore(run)).toEqual(run)
    const discovery = at('event')
    const item = discovery.encounter!.eventItem!
    const found = resolveEvent(discovery, 'supplies').run
    expect(found.coins).toBe(discovery.coins + 10)
    expect(found.inventory[item]).toBe(discovery.inventory[item] + 1)
    expect(resolveEvent(found, 'supplies').error).toBeTruthy()
    expect(restore(found)).toEqual(found)
    const healed = resolveEvent({ ...discovery, hearts: 1 }, 'heal').run
    expect(healed.hearts).toBe(2)
  })
  it('shops charge coins, enforce stock and affordability, and leave inventory use separate from purchasing', () => {
    let run = at('shop')
    const original = run
    run = buyItem(run, 'potion').run
    expect(run.coins).toBe(original.coins - ITEMS.potion.price)
    expect(run.inventory.potion).toBe(original.inventory.potion + 1)
    expect(buyItem(run, 'potion').error).toMatch(/sold out/)
    expect(buyItem({ ...run, coins: 0 }, 'star').error).toMatch(/coins/)
    expect(restore(run)).toEqual(run)
    run = leaveShop(run).run
    expect(buyItem(run, 'star').error).toBeTruthy()
  })
})

describe('familiar geography and mystery encounters', () => {
  for (const kind of ['countries', 'capitals', 'flags', 'shapes'] as const)
    it(`${kind} keeps one target, rejects duplicates, accepts an exact win and persists`, () => {
      let run = at(kind)
      const target = run.encounter!.geography!.answer
      const wrong = countries.find((country) => country.id !== target)!.id
      run = guessAdventureCountry(run, wrong).run
      expect(guessAdventureCountry(run, wrong).error).toBeTruthy()
      expect(guessAdventureCountry(run, 'ZZZ').error).toBeTruthy()
      expect(run.encounter!.geography!.guesses).toHaveLength(1)
      expect(run.encounter!.geography!.answer).toBe(target)
      expect(restore(run)).toEqual(run)
      run = guessAdventureCountry(run, target).run
      expect(run.encounter!.result).toBe('cleared')
      expect(restore(run)).toEqual(run)
    })
  it('geography has finite attempts and consumable hints/extra guesses; failure reveals the answer and costs a heart', () => {
    let run = at('flags')
    const target = run.encounter!.geography!.answer
    run = useItem(run, 'hint').run
    expect(run.encounter!.hintUsed).toBe(true)
    expect(useItem(run, 'hint').error).toBeTruthy()
    run = useItem(run, 'boots').run
    expect(run.encounter!.limit).toBe(10)
    expect(useItem(run, 'boots').error).toBeTruthy()
    for (const country of countries.filter((c) => c.id !== target).slice(0, 10))
      run = guessAdventureCountry(run, country.id).run
    expect(run.encounter!.result).toBe('failed')
    expect(run.hearts).toBe(2)
    expect(run.encounter!.geography!.revealed).toBe(true)
    expect(restore(run)).toEqual(run)
  })
  it('border encounters reject ocean jumps and follow real land borders to their destination', () => {
    let run = at('journey')
    const geo = run.encounter!.geography!
    expect(guessAdventureCountry(run, geo.answer).error).toMatch(/mainland border/)
    run = useItem(run, 'hint').run
    const route = shortestBorderRoute(geo.start!, geo.answer)!
    for (const id of route.slice(1)) run = guessAdventureCountry(run, id).run
    expect(run.encounter!.result).toBe('cleared')
    expect(restore(run)).toEqual(run)
  })
  it('mysteries retain clues and aliases, reject duplicate guesses and support extra attempts and give-up', () => {
    let run = at('mystery')
    const mystery = mysteryById.get(run.encounter!.mystery!.id)!
    run = guessAdventureMystery(run, 'definitely not this answer').run
    expect(guessAdventureMystery(run, 'DEFINITELY NOT THIS ANSWER!').error).toBeTruthy()
    run = revealAdventureClue(run).run
    run = useItem(run, 'hint').run
    expect(run.encounter!.mystery!.cluesShown).toBe(3)
    run = useItem(run, 'boots').run
    expect(run.encounter!.limit).toBe(7)
    expect(restore(run)).toEqual(run)
    const solved = guessAdventureMystery(run, mystery.aliases[0] || mystery.answer).run
    expect(solved.encounter!.result).toBe('cleared')
    expect(restore(solved)).toEqual(solved)
    const revealed = abandonEncounter(run).run
    expect(revealed.encounter!.mystery!.revealed).toBe(true)
    expect(revealed.hearts).toBe(run.hearts - 1)
    expect(restore(revealed)).toEqual(revealed)
  })
})

describe('saved developer runs', () => {
  it('restores every encounter kind and completed developer clear, including the boss shortcut', () => {
    for (const kind of [
      'trivia',
      'elite',
      'boss',
      'mystery',
      'countries',
      'capitals',
      'flags',
      'shapes',
      'journey',
      'rest',
      'shop',
      'event',
    ] as NodeKind[]) {
      const run = at(kind)
      expect(restore(run)).toEqual(run)
    }
    const jumped = developerAction(newAdventure(), 'boss').run
    expect(jumped.path).toHaveLength(8)
    expect(jumped.encounter!.kind).toBe('boss')
    expect(restore(jumped)).toEqual(jumped)
    expect(restore(developerAction(jumped, 'win').run)!.status).toBe('won')
  })
  it('rejects corrupt hearts, inventory, routes, answers and missing fields', () => {
    const original = at('trivia')
    for (const patch of [
      { hearts: -1 },
      { maxHearts: 8 },
      { coins: -1 },
      { inventory: {} },
      { path: ['7-1'] },
      { status: 'won' },
      { encounter: null },
      { seenTrivia: [] },
      { map: [] },
    ])
      expect(restore({ ...original, ...patch } as AdventureRun)).toBeNull()
    const scene = original.encounter!
    for (const patch of [
      { order: [0, 0, 1, 2] },
      { order: ['0', '1', '2', '3'] },
      { eliminated: ['0'] },
      { id: 'missing' },
      { choice: 0, correct: null },
      { streak: 5 },
      { answered: 999 },
    ])
      expect(
        restore({
          ...original,
          encounter: { ...scene, trivia: { ...scene.trivia!, ...patch } },
        } as AdventureRun),
      ).toBeNull()
    expect(parseAdventure('{')).toBeNull()
  })
  it('recovers only Somex when storage is corrupt and allows play when storage is blocked', () => {
    const data = new Map([
      [ADVENTURE_KEY, '{'],
      ['somewhere.round.v1', 'untouched'],
    ])
    vi.stubGlobal('localStorage', { getItem: (key: string) => data.get(key) ?? null })
    const recovered = loadAdventure()
    expect(recovered.warning).toMatch(/fresh developer run/)
    expect(data.get('somewhere.round.v1')).toBe('untouched')
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
    })
    expect(loadAdventure().warning).toMatch(/unavailable/)
    expect(loadAdventure().run.hearts).toBe(3)
  })
})
