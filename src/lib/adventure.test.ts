import { afterEach, describe, expect, it, vi } from 'vitest'
import { countries } from './countries'
import { shortestBorderRoute } from './journey'
import { mysteryById, questionById } from './something'
import {
  ADVENTURE_KEY,
  ADVENTURE_STOPS,
  adventureMysteryGame,
  COIN_REWARDS,
  SHOP_ITEM_IDS,
  trialItems,
  ITEM_IDS,
  ITEMS,
  abandonEncounter,
  answerAdventureTrivia,
  availableNodes,
  buyItem,
  chooseNode,
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
  type Encounter,
} from './adventure'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
import {
  at,
  answer,
  closeStop,
  completeEncounter,
  stockedAdventure,
  previewSave,
  previousSave,
  legacySave,
  someoneSave,
} from '../../tests/helpers/adventure'
const restore = (run: AdventureRun) => parseAdventure(JSON.stringify(run))
const migratedEncounter = (scene: Encounter | null) =>
  scene
    ? {
        ...scene,
        goal:
          scene.kind === 'boss'
            ? scene.result === 'active'
              ? 4
              : 3
            : scene.kind === 'trivia' || scene.kind === 'elite'
              ? 2
              : 0,
      }
    : null

describe('adventure routes and outcomes', () => {
  it('starts with normal supplies and has three three-by-three sections joined by rests', () => {
    const run = newAdventure()
    expect(run.coins).toBe(8)
    expect(run.hearts).toBe(2)
    expect(run.maxHearts).toBe(2)
    expect(run.map.filter((node) => node.kind === 'who')).toHaveLength(2)
    expect(run.map.filter((node) => node.kind === 'identify')).toHaveLength(2)
    expect(ITEM_IDS.filter((id) => run.inventory[id] > 0)).toEqual(['hint'])
    expect(Object.values(run.inventory).reduce((sum, count) => sum + count, 0)).toBe(1)
    for (const start of [0, 4, 8]) {
      const section = run.map.filter((node) => node.row >= start && node.row < start + 3)
      expect(section).toHaveLength(9)
      for (let row = start; row < start + 3; row++)
        expect(section.filter((node) => node.row === row).map((node) => node.lane)).toEqual([
          0, 1, 2,
        ])
    }
    const rested = closeStop(at('rest'))
    expect(availableNodes(rested)).toHaveLength(3)
    expect(availableNodes(rested).every((node) => node.row === 8)).toBe(true)
    expect(returnToRoute(rested).error).toBeTruthy()
  })
  it('generates connected branches, one guaranteed rest and one final boss; rejects skips and duplicate entries', () => {
    const run = newAdventure()
    expect(run.map).toHaveLength(31)
    expect(availableNodes(run)).toHaveLength(3)
    expect(run.map.filter((node) => node.kind === 'rest').map((node) => node.row)).toEqual([7])
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
  it('completes thirteen stops, grants each reward once, and makes victory terminal', () => {
    let run = newAdventure()
    for (let row = 0; row < ADVENTURE_STOPS; row++) {
      run = chooseNode(run, availableNodes(run).find((node) => node.lane === 1)!.id).run
      expect(restore(run)).toEqual(run)
      if (row === ADVENTURE_STOPS - 1) run = completeEncounter(run)
      else run = closeStop(run)
      expect(restore(run)).toEqual(run)
    }
    expect(run.status).toBe('won')
    expect(Object.keys(run.outcomes)).toHaveLength(ADVENTURE_STOPS)
    expect(availableNodes(run)).toEqual([])
    expect(useItem(run, 'star').run).toBe(run)
  })
  it('requires all three normal trivia answers, locks responses, and charges one heart for a failed trial', () => {
    for (const pattern of [
      [true, true, true],
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
      const success = pattern.filter(Boolean).length === 3
      expect(run.encounter!.result).toBe(success ? 'cleared' : 'failed')
      expect(run.hearts).toBe(hearts - Number(!success))
      expect(run.coins).toBe(coins + (success ? COIN_REWARDS.normal : 0))
      expect(restore(run)).toEqual(run)
    }
  })
  it('resets boss streaks on a wrong answer, applies damage, and wins only at four consecutive correct answers', () => {
    let run = at('boss')
    run = answer(run)
    run = nextAdventureQuestion(run).run
    run = answer(run)
    run = nextAdventureQuestion(run).run
    run = answer(run, false)
    expect(run.encounter!.trivia!.streak).toBe(0)
    expect(run.hearts).toBe(2)
    run = nextAdventureQuestion(run).run
    for (let i = 0; i < 4; i++) {
      run = answer(run)
      if (i < 3) {
        expect(run.status).toBe('playing')
        expect(restore(run)).toEqual(run)
      }
      if (i < 3) run = nextAdventureQuestion(run).run
    }
    expect(run.status).toBe('won')
    expect(run.encounter!.trivia!.streak).toBe(4)
    expect(restore(run)).toEqual(run)
  })
  it('elite trials require three consecutive correct answers', () => {
    let run = at('elite')
    const coins = run.coins
    run = answer(run)
    expect(run.encounter!.result).toBe('active')
    run = answer(nextAdventureQuestion(run).run)
    expect(run.encounter!.result).toBe('active')
    run = answer(nextAdventureQuestion(run).run)
    expect(run.encounter!.result).toBe('cleared')
    expect(run.coins).toBe(coins + 7)
    expect(restore(run)).toEqual(run)
  })
})

describe('consumables and recovery', () => {
  it('never sells Lucky stars, even with enough coins, and cannot spend them on the boss', () => {
    const shop = { ...at('shop'), coins: 999 }
    expect(SHOP_ITEM_IDS).not.toContain('star')
    expect(SHOP_ITEM_IDS).toHaveLength(8)
    const attempted = buyItem(shop, 'star')
    expect(attempted.error).toMatch(/only be found/)
    expect(attempted.run).toBe(shop)
    const boss = at('boss')
    expect(boss.inventory.star).toBeGreaterThan(0)
    expect(trialItems(boss)).not.toContain('star')
    expect(itemUnavailable(boss, 'star')).toMatch(/cannot be used.*boss/)
    expect(useItem(boss, 'star').run).toBe(boss)
    const cleared = completeEncounter(boss)
    expect(cleared.status).toBe('won')
    expect(cleared.inventory.star).toBe(boss.inventory.star)
    expect(cleared.coins).toBe(boss.coins + COIN_REWARDS.boss)
  })
  it('awards reduced coins and a persisted random Lucky star only for a natural non-boss challenge win', () => {
    const fixture = at('flags')
    const target = fixture.encounter!.geography!.answer
    const roll = vi.spyOn(crypto, 'getRandomValues')
    roll.mockImplementationOnce((values) => {
      ;(values as Uint32Array)[0] = 0
      return values
    })
    const won = guessAdventureCountry(fixture, target).run
    expect(won.coins).toBe(fixture.coins + 4)
    expect(won.inventory.star).toBe(fixture.inventory.star + 1)
    expect(won.message).toMatch(/found a Lucky star/)
    expect(restore(won)).toEqual(won)
    expect(guessAdventureCountry(won, target).run).toBe(won)
    expect(roll).toHaveBeenCalledTimes(1)
    roll.mockImplementationOnce((values) => {
      ;(values as Uint32Array)[0] = 0xffffffff
      return values
    })
    const unlucky = guessAdventureCountry(fixture, target).run
    expect(unlucky.inventory.star).toBe(fixture.inventory.star)
    expect(unlucky.message).not.toMatch(/found a Lucky star/)
    roll.mockClear()
    const assisted = useItem(fixture, 'star').run
    expect(assisted.inventory.star).toBe(fixture.inventory.star - 1)
    expect(assisted.message).not.toMatch(/found a Lucky star/)
    expect(abandonEncounter(fixture).run.inventory.star).toBe(fixture.inventory.star)
    const capped = { ...fixture, inventory: { ...fixture.inventory, star: 99 } }
    expect(guessAdventureCountry(capped, target).run.inventory.star).toBe(99)
    expect(roll).not.toHaveBeenCalled()
  })
  it('discoveries can grant a Lucky star once, while rests and shops never roll loot', () => {
    const discovery = at('event')
    const withStar = {
      ...discovery,
      encounter: { ...discovery.encounter!, eventItem: 'star' as const },
    }
    const rest = at('rest')
    const shop = at('shop')
    const roll = vi.spyOn(crypto, 'getRandomValues')
    const found = resolveEvent(withStar, 'supplies').run
    expect(found.inventory.star).toBe(withStar.inventory.star + 1)
    expect(found.message).toContain('Lucky star')
    expect(restore(found)).toEqual(found)
    expect(resolveEvent(found, 'supplies').run).toBe(found)
    expect(resolveEvent(withStar, 'heal').run.inventory.star).toBe(withStar.inventory.star)
    resolveRest(rest)
    leaveShop(shop)
    expect(roll).not.toHaveBeenCalled()
  })
  it('offers only stocked, relevant trial items and enforces restrictions after use', () => {
    const trivia = at('trivia')
    expect(trialItems(trivia)).toEqual(['container', 'fifty', 'star', 'shield', 'reroll'])
    const shapes = at('shapes')
    expect(trialItems(shapes)).toEqual(['container', 'star', 'shield', 'hint', 'boots'])
    expect(trialItems({ ...shapes, hearts: 2 })).toContain('potion')
    const hinted = useItem(shapes, 'hint').run
    expect(hinted.inventory.hint).toBe(shapes.inventory.hint - 1)
    expect(itemUnavailable(hinted, 'hint')).toMatch(/Already used/)
    expect(useItem(hinted, 'hint').run).toBe(hinted)
    expect(itemUnavailable(shapes, 'fifty')).toMatch(/trivia/)
    expect(useItem(shapes, 'fifty').run).toBe(shapes)
    expect(trialItems(newAdventure())).toEqual([])
    expect(trialItems(completeEncounter(trivia))).toEqual([])
    expect(trialItems({ ...trivia, inventory: { ...trivia.inventory, fifty: 0 } })).not.toContain(
      'fifty',
    )
  })
  it('prevents wasted healing, caps containers at five and spends items exactly once', () => {
    let run = stockedAdventure()
    expect(useItem(run, 'potion').error).toMatch(/full/)
    run = abandonEncounter(
      chooseNode(run, availableNodes(run).find((node) => node.kind === 'trivia')!.id).run,
    ).run
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
    let run = useItem(at('trivia'), 'shield').run
    expect(useItem(run, 'shield').error).toBeTruthy()
    run = abandonEncounter(run).run
    expect(run.hearts).toBe(3)
    expect(run.shield).toBe(false)
    run = { ...at('trivia'), hearts: 1 }
    expect(itemUnavailable(run, 'feather')).toMatch(/automatically/)
    run = abandonEncounter(run).run
    expect(run.hearts).toBe(1)
    expect(run.inventory.feather).toBe(0)
    expect(restore(run)).toEqual(run)
    run = abandonEncounter({ ...at('trivia'), hearts: 1, inventory: run.inventory }).run
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
  it('Lucky stars auto-win non-boss challenges and consume exactly one item', () => {
    for (const kind of ['trivia', 'shapes', 'mystery', 'who', 'identify'] as const) {
      const original = at(kind)
      const done = useItem(original, 'star').run
      expect(done.encounter!.result).toBe('cleared')
      expect(done.inventory.star).toBe(original.inventory.star - 1)
      expect(done.encounter!.method).toBe('item')
      expect(restore(done)).toEqual(done)
      expect(useItem(done, 'star').run).toBe(done)
    }
  })
  it('rests heal one heart and discoveries pay their chosen reward only once', () => {
    let run = at('rest')
    run = { ...run, hearts: 2 }
    run = resolveRest(run).run
    expect(run.hearts).toBe(3)
    expect(resolveRest(run).error).toBeTruthy()
    expect(restore(run)).toEqual(run)
    const discovery = at('event')
    const item = discovery.encounter!.eventItem!
    const found = resolveEvent(discovery, 'supplies').run
    expect(found.coins).toBe(discovery.coins + 5)
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
    expect(buyItem({ ...run, coins: 0 }, 'feather').error).toMatch(/coins/)
    expect(restore(run)).toEqual(run)
    run = leaveShop(run).run
    expect(buyItem(run, 'star').error).toBeTruthy()
  })
})

describe('familiar geography and mystery encounters', () => {
  it('caps free text clues at three while a compass can reveal an extra clue without spending a guess', () => {
    for (const kind of ['mystery', 'who'] as const) {
      let run = at(kind)
      run = revealAdventureClue(revealAdventureClue(run).run).run
      expect(run.encounter!.mystery!.cluesShown).toBe(3)
      expect(revealAdventureClue(run).error).toMatch(/free clues/)
      expect(run.encounter!.mystery!.guesses).toEqual([])
      run = useItem(run, 'hint').run
      expect(run.encounter!.mystery!.cluesShown).toBe(4)
      expect(run.encounter!.hintUsed).toBe(true)
      expect(restore(run)).toEqual(run)
    }
  })
  for (const kind of ['who', 'identify'] as const) {
    it(`${kind} has its own people history, free clues, aliases, finite attempts and consumables`, () => {
      const original = at(kind)
      let run = original
      const scene = run.encounter!
      const game = adventureMysteryGame(kind)
      const person = game.byId.get(scene.mystery!.id)!
      const key = kind === 'who' ? 'seenWho' : 'seenPortraits'
      expect(run[key]).toContain(person.id)
      expect(run.encounter!.limit).toBe(3)
      expect(trialItems(run)).toContain('hint')
      expect(trialItems(run)).toContain('boots')
      expect(trialItems(run)).not.toContain('fifty')
      run = guessAdventureMystery(run, 'a wrong name').run
      expect(guessAdventureMystery(run, 'A WRONG NAME!').run).toBe(run)
      run = revealAdventureClue(run).run
      expect(run.encounter!.mystery!.guesses).toHaveLength(1)
      expect(run.encounter!.mystery!.cluesShown).toBe(2)
      run = useItem(run, 'hint').run
      expect(run.encounter!.mystery!.cluesShown).toBe(kind === 'identify' ? 2 : 3)
      expect(run.encounter!.hintUsed).toBe(true)
      expect(useItem(run, 'hint').run).toBe(run)
      run = useItem(run, 'boots').run
      expect(run.encounter!.limit).toBe(5)
      expect(restore(run)).toEqual(run)
      const solved = guessAdventureMystery(run, person.aliases[0] || person.answer).run
      expect(solved.encounter!.result).toBe('cleared')
      expect(solved.coins).toBe(run.coins + COIN_REWARDS.normal)
      expect(solved.hearts).toBe(run.hearts)
      expect(restore(solved)).toEqual(solved)
      expect(guessAdventureMystery(solved, person.answer).run).toBe(solved)
      const gaveUp = abandonEncounter(run).run
      expect(gaveUp.hearts).toBe(run.hearts - 1)
      expect(gaveUp.encounter!.mystery!.revealed).toBe(true)
      expect(restore(gaveUp)).toEqual(gaveUp)
      let failed = original
      for (let i = 0; i < 3; i++) failed = guessAdventureMystery(failed, `Wrong name ${i}`).run
      expect(failed.encounter!.result).toBe('failed')
      expect(failed.encounter!.mystery!.revealed).toBe(true)
      expect(failed.hearts).toBe(original.hearts - 1)
      expect(restore(failed)).toEqual(failed)
    })
  }
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
    expect(run.encounter!.limit).toBe(7)
    expect(useItem(run, 'boots').error).toBeTruthy()
    for (const country of countries.filter((c) => c.id !== target).slice(0, 7))
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
    expect(run.encounter!.limit).toBe(route.length)
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
    expect(run.encounter!.limit).toBe(5)
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

describe('saved adventures', () => {
  it('upgrades version-4 supplies and active guess budgets while removing only future extra rests', () => {
    const fixture = at('who')
    const old = JSON.parse(someoneSave(fixture))
    old.coins = 19
    old.encounter.limit = 5
    old.encounter.mystery.cluesShown = 4
    old.encounter.mystery.guesses = ['wrong one', 'wrong two', 'wrong three']
    const upgraded = parseAdventure(JSON.stringify(old))!
    expect(upgraded.version).toBe(5)
    expect(upgraded.id).toBe(old.id)
    expect(upgraded.coins).toBe(19)
    expect(upgraded.hearts).toBe(old.hearts)
    expect(upgraded.inventory).toEqual(old.inventory)
    expect(upgraded.encounter).toEqual({ ...old.encounter, goal: 0 })
    expect(upgraded.map.filter((n) => n.kind === 'rest').map((n) => n.row)).toEqual([7])
    expect(restore(upgraded)).toEqual(upgraded)
    const rested = JSON.parse(someoneSave(closeStop(at('rest'))))
    const continued = parseAdventure(JSON.stringify(rested))!
    expect(continued.path).toEqual(rested.path)
    expect(continued.map.filter((n) => n.kind === 'rest').map((n) => n.row)).toEqual([3, 7])
    expect(availableNodes(continued)).toHaveLength(3)
  })
  it('keeps an old three-answer boss victory completed but raises an active boss to four', () => {
    const oldWin = JSON.parse(someoneSave(completeEncounter(at('boss'))))
    Object.assign(oldWin.encounter.trivia, { answered: 3, score: 3, streak: 3 })
    const completed = parseAdventure(JSON.stringify(oldWin))!
    expect(completed.status).toBe('won')
    expect(completed.encounter!.goal).toBe(3)
    expect(restore(completed)).toEqual(completed)
    const oldFight = JSON.parse(someoneSave(answer(at('boss'))))
    const active = parseAdventure(JSON.stringify(oldFight))!
    expect(active.encounter!.goal).toBe(4)
    expect(active.encounter!.trivia!.streak).toBe(1)
    expect(restore(active)).toEqual(active)
    expect(restore({ ...active, encounter: { ...active.encounter!, goal: 3 } })).toBeNull()
  })
  it('preserves old active trials in the exact rows that now offer Someone games', () => {
    for (const [kind, row] of [
      ['capitals', 1],
      ['trivia', 4],
      ['mystery', 8],
      ['trivia', 9],
    ] as const) {
      const sample = at(kind)
      const old = JSON.parse(legacySave(newAdventure()))
      const target = old.map.find(
        (n: { row: number; kind: string }) => n.row === row && n.kind === kind,
      )
      old.path = [
        ...old.map
          .filter((n: { row: number; lane: number }) => n.row < row && n.lane === 1)
          .map((n: { id: string }) => n.id),
        target.id,
      ]
      old.outcomes = Object.fromEntries(old.path.slice(0, -1).map((id: string) => [id, 'cleared']))
      old.encounter = { ...sample.encounter, nodeId: target.id }
      old.seenTrivia = sample.seenTrivia
      old.seenMysteries = sample.seenMysteries
      const restored = parseAdventure(JSON.stringify(old))!
      expect(restored.encounter).toEqual(migratedEncounter(old.encounter))
      expect(restored.map.find((n) => n.id === target.id)?.kind).toBe(kind)
      expect(restored.map.filter((n) => n.row <= row)).toEqual(
        old.map.filter((n: { row: number }) => n.row <= row),
      )
      expect(restore(restored)).toEqual(restored)
    }
  })
  it('upgrades version-3 saves without changing any visited node, active trial or completed boss', () => {
    for (const original of [
      newAdventure(),
      at('trivia'),
      at('journey'),
      at('boss'),
      completeEncounter(at('boss')),
    ]) {
      const old = JSON.parse(legacySave(original))
      const restored = parseAdventure(JSON.stringify(old))!
      expect(restored.version).toBe(5)
      expect(restored.id).toBe(original.id)
      expect(restored.path).toEqual(original.path)
      expect(restored.encounter).toEqual(migratedEncounter(original.encounter))
      expect(restored.inventory).toEqual(original.inventory)
      expect(restored.status).toBe(original.status)
      expect(restored.seenWho).toEqual([])
      expect(restored.seenPortraits).toEqual([])
      const lastRow = original.path.length - 1
      expect(restored.map.filter((n) => n.row <= lastRow)).toEqual(
        old.map.filter((n: { row: number }) => n.row <= lastRow),
      )
      if (lastRow < 1) expect(restored.map.some((n) => n.kind === 'who')).toBe(true)
      if (lastRow < 9) expect(restored.map.some((n) => n.kind === 'identify')).toBe(true)
      expect(restore(restored)).toEqual(restored)
    }
  })
  it('rejects missing people histories, wrong banks and impossible Someone trial results', () => {
    for (const kind of ['who', 'identify'] as const) {
      const original = at(kind)
      const scene = original.encounter!
      expect(restore({ ...original, seenWho: undefined } as unknown as AdventureRun)).toBeNull()
      expect(restore({ ...original, seenPortraits: ['unknown-person'] })).toBeNull()
      for (const patch of [
        { id: 'mystery-not-a-person' },
        { cluesShown: kind === 'identify' ? 3 : 6 },
        { guesses: ['Already tried', 'ALREADY TRIED!'] },
        { revealed: true },
      ])
        expect(
          restore({
            ...original,
            encounter: { ...scene, mystery: { ...scene.mystery!, ...patch } },
          }),
        ).toBeNull()
      const key = kind === 'who' ? 'seenWho' : 'seenPortraits'
      expect(restore({ ...original, [key]: [] })).toBeNull()
    }
  })
  it('preserves an earlier Lucky-star boss victory but rejects a new boss item-clear save', () => {
    const won = completeEncounter(at('boss'))
    const old = JSON.parse(previousSave(won))
    old.encounter.method = 'item'
    Object.assign(old.encounter.trivia, {
      answered: 0,
      score: 0,
      streak: 0,
      choice: null,
      correct: null,
    })
    const upgraded = parseAdventure(JSON.stringify(old))!
    expect(upgraded.status).toBe('won')
    expect(upgraded.encounter!.method).toBe('carried')
    expect(restore(upgraded)).toEqual(upgraded)
    expect(restore({ ...won, encounter: { ...won.encounter!, method: 'item' } })).toBeNull()
  })
  it('upgrades both older save layouts before and after rests without losing trials, inventory or victory', () => {
    const firstRest = closeStop(at('rest'))
    let lastRest = at('boss')
    // Model the second rest before the third section was introduced.
    lastRest = {
      ...lastRest,
      encounter: null,
      path: lastRest.path.slice(0, 8),
      outcomes: Object.fromEntries(
        Object.entries(lastRest.outcomes).filter(([id]) => Number(id.split('-')[0]) < 8),
      ),
    }
    const samples = [
      newAdventure(),
      at('trivia'),
      firstRest,
      at('journey'),
      lastRest,
      at('boss'),
      completeEncounter(at('boss')),
    ]
    for (const original of samples) {
      for (const save of [previewSave(original), previousSave(original)]) {
        const upgraded = parseAdventure(save)!
        expect(upgraded.version).toBe(5)
        expect(upgraded.map).toHaveLength(31)
        expect(upgraded.id).toBe(original.id)
        expect(upgraded.inventory).toEqual(original.inventory)
        expect(upgraded.hearts).toBe(original.hearts)
        expect(upgraded.coins).toBe(original.coins)
        expect(upgraded.path).toEqual(original.path)
        expect(upgraded.encounter).toEqual(migratedEncounter(original.encounter))
        expect(upgraded.status).toBe(original.status)
        expect(restore(upgraded)).toEqual(upgraded)
      }
    }
    const oldClear = JSON.parse(previewSave(completeEncounter(at('boss'))))
    oldClear.encounter.method = 'dev'
    oldClear.message = 'Developer clear · +50 coins.'
    const upgraded = parseAdventure(JSON.stringify(oldClear))!
    expect(upgraded.status).toBe('won')
    expect(upgraded.encounter!.method).toBe('carried')
    expect(upgraded.message).not.toMatch(/developer/i)
    expect(restore(upgraded)).toEqual(upgraded)
  })
  it('restores every encounter kind and completed run', () => {
    for (const kind of [
      'trivia',
      'elite',
      'boss',
      'mystery',
      'who',
      'identify',
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
    expect(restore(completeEncounter(at('boss')))!.status).toBe('won')
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
    expect(recovered.warning).toMatch(/fresh adventure/)
    expect(data.get('somewhere.round.v1')).toBe('untouched')
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
    })
    expect(loadAdventure().warning).toMatch(/unavailable/)
    expect(loadAdventure().run.hearts).toBe(2)
  })
})
