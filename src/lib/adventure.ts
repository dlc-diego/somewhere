import { countries, type GameMode } from './countries'
import { addGuess, hasWon, newRound, parseRound, revealAnswer, type Round } from './game'
import { shortestBorderRoute } from './journey'
import { mysteries } from '../data/mysteries'
import { triviaQuestions } from '../data/trivia'
import { people } from '../data/people'
import { questionById } from './something'
import { createMysteryGame, type MysteryRound } from './mystery'
import { portraitPeople } from './identify'

export const ADVENTURE_KEY = 'somex.run.v1'
export type NodeKind =
  | GameMode
  | 'trivia'
  | 'mystery'
  | 'who'
  | 'identify'
  | 'elite'
  | 'boss'
  | 'rest'
  | 'shop'
  | 'event'
export const ITEMS = {
  potion: { name: 'Heart tonic', description: 'Restore one heart.', price: 8, symbol: '♥' },
  container: {
    name: 'Heart container',
    description: 'Add and fill one heart container, up to five.',
    price: 25,
    symbol: '♡',
  },
  fifty: {
    name: '50/50 lens',
    description: 'Remove two wrong choices from this trivia question.',
    price: 12,
    symbol: '½',
  },
  star: {
    name: 'Lucky star',
    description: 'Auto-win one non-boss challenge. Found only in discoveries or after a win.',
    price: null,
    symbol: '★',
  },
  shield: {
    name: 'Heart shield',
    description: 'Arm a shield that blocks the next lost heart.',
    price: 10,
    symbol: '◇',
  },
  hint: {
    name: 'Trail compass',
    description: 'Reveal a continent, next crossing, or mystery clue.',
    price: 8,
    symbol: '⌖',
  },
  boots: {
    name: 'Second wind',
    description: 'Add two guesses to a geography or mystery encounter.',
    price: 8,
    symbol: '+2',
  },
  reroll: {
    name: 'Fresh page',
    description: 'Swap this unanswered trivia question without losing your streak.',
    price: 10,
    symbol: '↻',
  },
  feather: {
    name: 'Phoenix feather',
    description: 'Automatically revive with one heart when you would lose your last.',
    price: 35,
    symbol: '✦',
  },
} as const
export type ItemId = keyof typeof ITEMS
export const ITEM_IDS = Object.keys(ITEMS) as ItemId[]
export const SHOP_ITEM_IDS = ITEM_IDS.filter((id): id is Exclude<ItemId, 'star'> => id !== 'star')
export const LUCKY_STAR_DROP_CHANCE = 0.1
export const COIN_REWARDS = { normal: 6, elite: 10, boss: 15 } as const
export const NODE_LABELS: Record<NodeKind, string> = {
  trivia: 'General Trivia',
  mystery: 'What am I',
  who: 'Who am I',
  identify: 'Identify Me',
  countries: 'Countries',
  capitals: 'Capitals',
  flags: 'Flags',
  shapes: 'Shapes',
  journey: 'Border Journey',
  elite: 'Elite trial',
  boss: 'Final boss',
  rest: 'Rest stop',
  shop: 'Shop',
  event: 'Discovery',
}
const previewRows: NodeKind[][] = [
  ['trivia', 'flags', 'mystery'],
  ['countries', 'capitals', 'shapes'],
  ['shop', 'event', 'elite'],
  ['rest'],
  ['journey', 'trivia', 'shapes'],
  ['elite', 'event', 'shop'],
  ['rest'],
  ['boss'],
]
const shortRows: NodeKind[][] = [
  ...previewRows.slice(0, 6),
  ['mystery', 'countries', 'elite'],
  ...previewRows.slice(6),
]
const previousRows: NodeKind[][] = [
  ...shortRows.slice(0, -1),
  ['capitals', 'flags', 'mystery'],
  ['journey', 'countries', 'trivia'],
  ['shop', 'event', 'elite'],
  ['rest'],
  ['boss'],
]
const newTrials = new Map<number, [NodeKind, NodeKind]>([
  [1, ['capitals', 'who']],
  [4, ['trivia', 'identify']],
  [8, ['mystery', 'who']],
  [9, ['trivia', 'identify']],
])
const rows = previousRows.map((kinds, row) =>
  kinds.map((kind) => (kind === newTrials.get(row)?.[0] ? newTrials.get(row)![1] : kind)),
)
export const ADVENTURE_STOPS = rows.length
export interface AdventureNode {
  id: string
  row: number
  lane: number
  kind: NodeKind
}
export interface TriviaTrial {
  id: string
  order: number[]
  choice: number | null
  correct: boolean | null
  answered: number
  score: number
  streak: number
  eliminated: number[]
}
export interface Encounter {
  nodeId: string
  kind: NodeKind
  result: 'active' | 'cleared' | 'failed'
  geography: Round | null
  mystery: MysteryRound | null
  trivia: TriviaTrial | null
  limit: number
  hintUsed: boolean
  extraUsed: boolean
  purchases: ItemId[]
  eventItem: ItemId | null
  method: 'played' | 'item' | 'carried'
}
export interface AdventureRun {
  version: 4
  id: string
  map: AdventureNode[]
  path: string[]
  outcomes: Record<string, 'cleared' | 'failed'>
  encounter: Encounter | null
  status: 'playing' | 'won' | 'lost'
  hearts: number
  maxHearts: number
  coins: number
  inventory: Record<ItemId, number>
  shield: boolean
  seenTrivia: string[]
  seenMysteries: string[]
  seenWho: string[]
  seenPortraits: string[]
  message: string
}
export interface AdventureResult {
  run: AdventureRun
  error?: string
}
const ok = (run: AdventureRun): AdventureResult => ({ run })
const fail = (run: AdventureRun, error: string): AdventureResult => ({ run, error })
export const isGeography = (kind: NodeKind): kind is GameMode =>
  ['countries', 'capitals', 'flags', 'shapes', 'journey'].includes(kind)
export const isTrivia = (kind: NodeKind) => kind === 'trivia' || kind === 'elite' || kind === 'boss'
export const isMystery = (kind: NodeKind) => ['mystery', 'who', 'identify'].includes(kind)
export const isCombat = (kind: NodeKind) => isTrivia(kind) || isGeography(kind) || isMystery(kind)
const whatGame = createMysteryGame(mysteries)
const whoGame = createMysteryGame(people)
const portraitGame = createMysteryGame(portraitPeople)
export const adventureMysteryGame = (kind: NodeKind) =>
  kind === 'who' ? whoGame : kind === 'identify' ? portraitGame : whatGame
const seenKey = (kind: NodeKind) =>
  kind === 'who' ? 'seenWho' : kind === 'identify' ? 'seenPortraits' : 'seenMysteries'

function shuffle<T>(values: T[]): T[] {
  const result = [...values]
  for (let i = result.length - 1; i > 0; i--) {
    const sample = new Uint32Array(1)
    const ceiling = Math.floor(2 ** 32 / (i + 1)) * (i + 1)
    do {
      crypto.getRandomValues(sample)
    } while (sample[0] >= ceiling)
    const j = sample[0] % (i + 1)
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}
function pickUnseen(ids: string[], seen: string[], previous?: string): string {
  const fresh = ids.filter((id) => !seen.includes(id) && id !== previous)
  return shuffle(fresh.length ? fresh : ids.filter((id) => id !== previous))[0]
}
export function starterKit(): Record<ItemId, number> {
  return {
    potion: 1,
    container: 0,
    fifty: 1,
    star: 0,
    shield: 0,
    hint: 1,
    boots: 0,
    reroll: 0,
    feather: 0,
  }
}
export function newAdventure(): AdventureRun {
  return {
    version: 4,
    id: crypto.randomUUID(),
    map: rows.flatMap((kinds, row) =>
      shuffle(kinds).map((kind, index) => ({
        id: `${row}-${kinds.length === 1 ? 1 : index}`,
        row,
        lane: kinds.length === 1 ? 1 : index,
        kind,
      })),
    ),
    path: [],
    outcomes: {},
    encounter: null,
    status: 'playing',
    hearts: 3,
    maxHearts: 3,
    coins: 25,
    inventory: starterKit(),
    shield: false,
    seenTrivia: [],
    seenMysteries: [],
    seenWho: [],
    seenPortraits: [],
    message: 'Your satchel is packed. Choose your first stop.',
  }
}
export function connected(from: AdventureNode, to: AdventureNode): boolean {
  return (
    to.row === from.row + 1 &&
    (from.kind === 'rest' ||
      to.kind === 'rest' ||
      to.kind === 'boss' ||
      Math.abs(from.lane - to.lane) <= 1)
  )
}
export function availableNodes(run: AdventureRun): AdventureNode[] {
  if (run.status !== 'playing' || run.encounter) return []
  const last = run.map.find((node) => node.id === run.path.at(-1))
  return run.map.filter((node) => (last ? connected(last, node) : node.row === 0))
}
function nextQuestion(
  run: AdventureRun,
  previous?: string,
): { run: AdventureRun; trial: TriviaTrial } {
  const id = pickUnseen(
    triviaQuestions.map((q) => q.id),
    run.seenTrivia,
    previous,
  )
  return {
    run: { ...run, seenTrivia: [...new Set([...run.seenTrivia, id])] },
    trial: {
      id,
      order: shuffle([0, 1, 2, 3]),
      choice: null,
      correct: null,
      answered: 0,
      score: 0,
      streak: 0,
      eliminated: [],
    },
  }
}
function enter(run: AdventureRun, node: AdventureNode): AdventureRun {
  let geography: Round | null = null
  let mystery: MysteryRound | null = null
  let trivia: TriviaTrial | null = null
  let limit = 0
  if (isGeography(node.kind)) {
    geography = newRound(undefined, node.kind)
    // Familiar targets keep early mystery encounters approachable.
    if (node.kind !== 'journey') {
      const pool = countries.filter((c) => c.area >= 30_000 && c.area <= 4_000_000)
      geography = { ...geography, answer: shuffle(pool)[0].id }
    }
    limit =
      node.kind === 'journey'
        ? shortestBorderRoute(geography.start!, geography.answer)!.length + 3
        : 8
  } else if (isMystery(node.kind)) {
    const key = seenKey(node.kind)
    const id = pickUnseen([...adventureMysteryGame(node.kind).byId.keys()], run[key])
    mystery = { version: 1, id, cluesShown: 1, guesses: [], revealed: false }
    run = { ...run, [key]: [...new Set([...run[key], id])] }
    limit = 5
  } else if (isTrivia(node.kind)) {
    const next = nextQuestion(run)
    run = next.run
    trivia = next.trial
  }
  return {
    ...run,
    path: [...run.path, node.id],
    message: '',
    encounter: {
      nodeId: node.id,
      kind: node.kind,
      result: 'active',
      geography,
      mystery,
      trivia,
      limit,
      hintUsed: false,
      extraUsed: false,
      purchases: [],
      eventItem:
        node.kind === 'event' ? shuffle(ITEM_IDS.filter((id) => id !== 'feather'))[0] : null,
      method: 'played',
    },
  }
}
export function chooseNode(run: AdventureRun, id: string): AdventureResult {
  const node = availableNodes(run).find((node) => node.id === id)
  return node
    ? ok(enter(run, node))
    : fail(run, 'Choose a connected, highlighted stop on your route.')
}
function damage(run: AdventureRun): AdventureRun {
  if (run.shield)
    return { ...run, shield: false, message: 'Your heart shield absorbed the damage.' }
  if (run.hearts > 1)
    return { ...run, hearts: run.hearts - 1, message: 'One heart lost. The journey continues.' }
  if (run.inventory.feather > 0)
    return {
      ...run,
      hearts: 1,
      inventory: { ...run.inventory, feather: run.inventory.feather - 1 },
      message: 'Your phoenix feather brought you back with one heart.',
    }
  return {
    ...run,
    hearts: 0,
    status: 'lost',
    message: 'Your last heart is gone. A fresh adventure awaits.',
  }
}
function finish(
  run: AdventureRun,
  success: boolean,
  method: Encounter['method'] = 'played',
  reward = true,
): AdventureRun {
  const scene = run.encounter!
  let next = success ? run : damage(run)
  const result = success ? 'cleared' : 'failed'
  const coins =
    success && reward && isCombat(scene.kind)
      ? scene.kind === 'boss'
        ? COIN_REWARDS.boss
        : scene.kind === 'elite'
          ? COIN_REWARDS.elite
          : COIN_REWARDS.normal
      : 0
  let foundStar = false
  if (
    success &&
    reward &&
    method === 'played' &&
    isCombat(scene.kind) &&
    scene.kind !== 'boss' &&
    next.inventory.star < 99
  ) {
    const sample = new Uint32Array(1)
    crypto.getRandomValues(sample)
    foundStar = sample[0] < 2 ** 32 * LUCKY_STAR_DROP_CHANCE
  }
  next = {
    ...next,
    coins: Math.min(999, next.coins + coins),
    inventory: foundStar ? { ...next.inventory, star: next.inventory.star + 1 } : next.inventory,
    outcomes: { ...next.outcomes, [scene.nodeId]: result },
    encounter: {
      ...scene,
      result,
      method,
      geography:
        scene.geography && !hasWon(scene.geography)
          ? revealAnswer(scene.geography)
          : scene.geography,
      mystery:
        scene.mystery && !adventureMysteryGame(scene.kind).solved(scene.mystery)
          ? adventureMysteryGame(scene.kind).reveal(scene.mystery)
          : scene.mystery,
    },
    message: success
      ? `${method === 'item' ? 'Lucky star clear' : 'Stop cleared'}${coins ? ` · +${coins} coins` : ''}.${foundStar ? ' You found a Lucky star!' : ''}`
      : next.message,
  }
  if (success && scene.kind === 'boss') next.status = 'won'
  return next
}
export function returnToRoute(run: AdventureRun): AdventureResult {
  return run.status === 'playing' && run.encounter && run.encounter.result !== 'active'
    ? ok({ ...run, encounter: null })
    : fail(run, 'Finish this stop before returning to the route.')
}
export function triviaChoices(scene: Encounter): string[] {
  return scene.trivia
    ? scene.trivia.order.map((index) => questionById.get(scene.trivia!.id)!.choices[index])
    : []
}
export function answerAdventureTrivia(run: AdventureRun, choice: number): AdventureResult {
  const scene = run.encounter
  const t = scene?.trivia
  if (
    run.status !== 'playing' ||
    !scene ||
    scene.result !== 'active' ||
    !t ||
    t.answered >= 500 ||
    t.choice !== null ||
    !Number.isInteger(choice) ||
    choice < 0 ||
    choice > 3 ||
    t.eliminated.includes(choice)
  )
    return fail(run, 'Choose one available answer for the current question.')
  const correct = triviaChoices(scene)[choice] === questionById.get(t.id)!.answer
  const nextTrial = {
    ...t,
    choice,
    correct,
    answered: t.answered + 1,
    score: t.score + Number(correct),
    streak: correct ? t.streak + 1 : 0,
  }
  let next: AdventureRun = { ...run, message: '', encounter: { ...scene, trivia: nextTrial } }
  if (scene.kind === 'trivia') {
    if (nextTrial.answered === 3) next = finish(next, nextTrial.score >= 2)
  } else {
    if (!correct) next = damage(next)
    if (next.status === 'lost')
      next = {
        ...next,
        encounter: { ...next.encounter!, result: 'failed' },
        outcomes: { ...next.outcomes, [scene.nodeId]: 'failed' },
      }
    else if (nextTrial.streak >= (scene.kind === 'boss' ? 3 : 2)) next = finish(next, true)
  }
  return ok(next)
}
export function nextAdventureQuestion(run: AdventureRun): AdventureResult {
  const scene = run.encounter
  if (
    run.status !== 'playing' ||
    !scene ||
    scene.result !== 'active' ||
    !scene.trivia ||
    scene.trivia.choice === null
  )
    return fail(run, 'Answer this question first.')
  const { run: next, trial } = nextQuestion(run, scene.trivia.id)
  return ok({
    ...next,
    message: '',
    encounter: {
      ...scene,
      trivia: {
        ...trial,
        answered: scene.trivia.answered,
        score: scene.trivia.score,
        streak: scene.trivia.streak,
      },
    },
  })
}
export function guessAdventureCountry(run: AdventureRun, id: string): AdventureResult {
  const scene = run.encounter
  if (run.status !== 'playing' || !scene?.geography || scene.result !== 'active')
    return fail(run, 'Choose an active geography stop first.')
  const guessed = addGuess(scene.geography, id)
  if (guessed.error) return fail(run, guessed.error)
  let next: AdventureRun = {
    ...run,
    message: '',
    encounter: { ...scene, geography: guessed.round },
  }
  if (hasWon(guessed.round)) next = finish(next, true)
  else if (guessed.round.guesses.length >= scene.limit) next = finish(next, false)
  return ok(next)
}
export function guessAdventureMystery(run: AdventureRun, guess: string): AdventureResult {
  const scene = run.encounter
  if (run.status !== 'playing' || !scene?.mystery || scene.result !== 'active')
    return fail(run, 'Choose an active mystery stop first.')
  const game = adventureMysteryGame(scene.kind)
  const result = game.guess(scene.mystery, guess)
  if (result.error) return fail(run, result.error)
  let next: AdventureRun = { ...run, message: '', encounter: { ...scene, mystery: result.round } }
  if (game.solved(result.round)) next = finish(next, true)
  else if (result.round.guesses.length >= scene.limit) next = finish(next, false)
  return ok(next)
}
export function revealAdventureClue(run: AdventureRun): AdventureResult {
  const scene = run.encounter
  if (run.status !== 'playing' || !scene?.mystery || scene.result !== 'active')
    return fail(run, 'Clues are available during a mystery.')
  const game = adventureMysteryGame(scene.kind)
  if (scene.mystery.cluesShown >= game.byId.get(scene.mystery.id)!.clues.length)
    return fail(run, 'All clues are already visible.')
  return ok({ ...run, encounter: { ...scene, mystery: game.nextClue(scene.mystery) } })
}
export function abandonEncounter(run: AdventureRun): AdventureResult {
  const scene = run.encounter
  if (run.status !== 'playing' || !scene || scene.result !== 'active' || !isCombat(scene.kind))
    return fail(run, 'Choose an active challenge first.')
  if (scene.kind === 'boss')
    return ok({
      ...run,
      encounter: { ...scene, result: 'failed' },
      outcomes: { ...run.outcomes, [scene.nodeId]: 'failed' },
      status: 'lost',
      hearts: 0,
      message: 'You left the final battle. Start a fresh journey whenever you like.',
    })
  return ok(finish(run, false))
}
export function resolveRest(run: AdventureRun): AdventureResult {
  if (
    run.status !== 'playing' ||
    run.encounter?.kind !== 'rest' ||
    run.encounter.result !== 'active'
  )
    return fail(run, 'This is not an active rest stop.')
  return ok({
    ...finish({ ...run, hearts: Math.min(run.maxHearts, run.hearts + 1) }, true, 'played', false),
    message:
      run.hearts < run.maxHearts
        ? 'A quiet rest restored one heart.'
        : 'You rested with a full heart.',
  })
}
export function buyItem(run: AdventureRun, item: ItemId): AdventureResult {
  const scene = run.encounter
  if (
    run.status !== 'playing' ||
    scene?.kind !== 'shop' ||
    scene.result !== 'active' ||
    !ITEM_IDS.includes(item)
  )
    return fail(run, 'Visit a shop to buy supplies.')
  if (item === 'star')
    return fail(
      run,
      'Lucky stars can only be found in discoveries or after a successful challenge.',
    )
  if (scene.purchases.includes(item)) return fail(run, 'That item is sold out at this shop.')
  if (run.coins < ITEMS[item].price) return fail(run, 'You need more coins for that item.')
  if (run.inventory[item] >= 99) return fail(run, 'Your satchel is full of that item.')
  return ok({
    ...run,
    coins: run.coins - ITEMS[item].price,
    inventory: { ...run.inventory, [item]: run.inventory[item] + 1 },
    encounter: { ...scene, purchases: [...scene.purchases, item] },
    message: `${ITEMS[item].name} added to your satchel.`,
  })
}
export function leaveShop(run: AdventureRun): AdventureResult {
  return run.status === 'playing' &&
    run.encounter?.kind === 'shop' &&
    run.encounter.result === 'active'
    ? ok(finish(run, true, 'played', false))
    : fail(run, 'There is no active shop to leave.')
}
export function resolveEvent(run: AdventureRun, choice: 'supplies' | 'heal'): AdventureResult {
  const scene = run.encounter
  if (run.status !== 'playing' || scene?.kind !== 'event' || scene.result !== 'active')
    return fail(run, 'Choose an active discovery first.')
  const next =
    choice === 'heal'
      ? { ...run, hearts: Math.min(run.maxHearts, run.hearts + 1) }
      : {
          ...run,
          coins: Math.min(999, run.coins + 10),
          inventory: {
            ...run.inventory,
            [scene.eventItem!]: Math.min(99, run.inventory[scene.eventItem!] + 1),
          },
        }
  return ok({
    ...finish(next, true, 'played', false),
    message:
      choice === 'heal'
        ? 'The hidden spring restored one heart.'
        : `Found ${ITEMS[scene.eventItem!].name} and 10 coins.`,
  })
}
export function itemUnavailable(run: AdventureRun, item: ItemId): string | null {
  if (run.status !== 'playing') return 'Start a new run to use items.'
  if (!run.inventory[item]) return 'None left.'
  const scene = run.encounter
  const active = scene?.result === 'active'
  if (item === 'potion') return run.hearts >= run.maxHearts ? 'Your hearts are full.' : null
  if (item === 'container') return run.maxHearts >= 5 ? 'Five containers is the maximum.' : null
  if (item === 'shield') return run.shield ? 'A shield is already armed.' : null
  if (item === 'feather') return 'Activates automatically at your last heart.'
  if (item === 'star') {
    if (scene?.kind === 'boss') return 'Lucky stars cannot be used on the final boss.'
    return active && scene && isCombat(scene.kind) ? null : 'Use during a non-boss challenge.'
  }
  if (item === 'fifty' || item === 'reroll') {
    if (!active || !scene?.trivia || scene.trivia.choice !== null)
      return 'Use before answering a trivia question.'
    return item === 'fifty' && scene.trivia.eliminated.length
      ? 'Already used on this question.'
      : null
  }
  if (item === 'boots')
    return active && scene && (scene.geography || scene.mystery)
      ? scene.extraUsed
        ? 'Already used at this stop.'
        : null
      : 'Use in geography or a mystery trial.'
  if (!active || !scene || (!scene.geography && !scene.mystery))
    return 'Use in geography or a mystery trial.'
  if (scene.hintUsed) return 'Already used at this stop.'
  return null
}
export function trialItems(run: AdventureRun): ItemId[] {
  const scene = run.encounter
  if (run.status !== 'playing' || scene?.result !== 'active' || !isCombat(scene.kind)) return []
  return ITEM_IDS.filter((id) => {
    if (!run.inventory[id] || id === 'feather') return false
    if (id === 'star') return scene.kind !== 'boss'
    if (id === 'fifty' || id === 'reroll') return Boolean(scene.trivia)
    if (id === 'hint' || id === 'boots') return Boolean(scene.geography || scene.mystery)
    if (id === 'potion') return run.hearts < run.maxHearts
    if (id === 'container') return run.maxHearts < 5
    if (id === 'shield') return !run.shield
    return true
  })
}
export function useItem(run: AdventureRun, item: ItemId): AdventureResult {
  if (!ITEM_IDS.includes(item)) return fail(run, 'Choose an item from your satchel.')
  const reason = itemUnavailable(run, item)
  if (reason) return fail(run, reason)
  let next = {
    ...run,
    inventory: { ...run.inventory, [item]: run.inventory[item] - 1 },
    message: `Used ${ITEMS[item].name}.`,
  }
  const scene = run.encounter
  if (item === 'potion') next.hearts++
  else if (item === 'container') {
    next.maxHearts++
    next.hearts++
  } else if (item === 'shield') next.shield = true
  else if (item === 'star') next = finish(next, true, 'item')
  else if (item === 'fifty')
    next.encounter = {
      ...scene!,
      trivia: {
        ...scene!.trivia!,
        eliminated: shuffle(
          [0, 1, 2, 3].filter(
            (index) => triviaChoices(scene!)[index] !== questionById.get(scene!.trivia!.id)!.answer,
          ),
        ).slice(0, 2),
      },
    }
  else if (item === 'reroll') {
    const fresh = nextQuestion(next, scene!.trivia!.id)
    next = {
      ...fresh.run,
      message: next.message,
      encounter: {
        ...scene!,
        trivia: {
          ...fresh.trial,
          answered: scene!.trivia!.answered,
          score: scene!.trivia!.score,
          streak: scene!.trivia!.streak,
        },
      },
    }
  } else if (item === 'boots')
    next.encounter = { ...scene!, limit: scene!.limit + 2, extraUsed: true }
  else if (item === 'hint')
    next.encounter = {
      ...scene!,
      hintUsed: true,
      mystery: scene!.mystery ? adventureMysteryGame(scene!.kind).nextClue(scene!.mystery) : null,
    }
  return ok(next)
}

const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value))
const integer = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
const unique = (ids: unknown, pool: string[], max: number): ids is string[] =>
  Array.isArray(ids) &&
  ids.length <= max &&
  new Set(ids).size === ids.length &&
  ids.every((id) => typeof id === 'string' && pool.includes(id))
export function parseAdventure(value: string | null): AdventureRun | null {
  if (!value) return null
  try {
    const raw: unknown = JSON.parse(value)
    if (
      !record(raw) ||
      ![1, 2, 3, 4].includes(raw.version as number) ||
      typeof raw.id !== 'string' ||
      raw.id.length > 80 ||
      !['playing', 'won', 'lost'].includes(String(raw.status)) ||
      !integer(raw.maxHearts, 3, 5) ||
      !integer(raw.hearts, 0, raw.maxHearts) ||
      !integer(raw.coins, 0, 999) ||
      typeof raw.shield !== 'boolean' ||
      !record(raw.inventory) ||
      typeof raw.message !== 'string' ||
      raw.message.length > 500
    )
      return null
    const inventory = raw.inventory
    if (!ITEM_IDS.every((id) => integer(inventory[id], 0, 99))) return null
    const layout = raw.version === 1 ? previewRows : raw.version === 2 ? shortRows : previousRows
    if (!Array.isArray(raw.map) || raw.map.length !== layout.flat().length) return null
    for (let row = 0; row < layout.length; row++) {
      const nodes = raw.map.filter((node) => record(node) && node.row === row)
      if (
        nodes.length !== layout[row].length ||
        nodes.some((node) => !integer(node.lane, 0, 2) || node.id !== `${row}-${node.lane}`) ||
        new Set(nodes.map((node) => node.lane)).size !== nodes.length ||
        ![layout[row], ...(raw.version === 4 ? [rows[row]] : [])].some(
          (kinds) =>
            nodes
              .map((node) => node.kind)
              .sort()
              .join('|') === [...kinds].sort().join('|'),
        ) ||
        (nodes.length === 1 && nodes[0].lane !== 1)
      )
        return null
    }
    const map = raw.map as AdventureNode[]
    if (
      !unique(
        raw.path,
        map.map((node) => node.id),
        layout.length,
      ) ||
      !record(raw.outcomes)
    )
      return null
    if (
      raw.version === 4 &&
      (!unique(
        raw.seenWho,
        people.map((p) => p.id),
        people.length,
      ) ||
        !unique(
          raw.seenPortraits,
          people.map((p) => p.id),
          people.length,
        ))
    )
      return null
    const pathIds = raw.path
    const outcomes = raw.outcomes
    if (
      Object.entries(outcomes).some(
        ([id, result]) => !pathIds.includes(id) || (result !== 'cleared' && result !== 'failed'),
      )
    )
      return null
    const path = raw.path.map((id) => map.find((node) => node.id === id)!)
    if (
      path.some(
        (node, index) => node.row !== index || (index > 0 && !connected(path[index - 1], node)),
      )
    )
      return null
    if (
      !unique(
        raw.seenTrivia,
        triviaQuestions.map((q) => q.id),
        triviaQuestions.length,
      ) ||
      !unique(
        raw.seenMysteries,
        mysteries.map((m) => m.id),
        mysteries.length,
      )
    )
      return null
    if (raw.encounter !== null) {
      const e = raw.encounter
      if (
        !record(e) ||
        !path.length ||
        e.nodeId !== path.at(-1)!.id ||
        e.kind !== path.at(-1)!.kind ||
        !['active', 'cleared', 'failed'].includes(String(e.result)) ||
        !(raw.version === 1 ? ['played', 'item', 'dev'] : ['played', 'item', 'carried']).includes(
          String(e.method),
        ) ||
        !integer(e.limit, 0, 20) ||
        typeof e.hintUsed !== 'boolean' ||
        typeof e.extraUsed !== 'boolean' ||
        !unique(e.purchases, ITEM_IDS, ITEM_IDS.length) ||
        (e.kind === 'event' ? !ITEM_IDS.includes(e.eventItem as ItemId) : e.eventItem !== null)
      )
        return null
      if (isGeography(e.kind as NodeKind)) {
        if (
          !parseRound(JSON.stringify(e.geography), e.kind as GameMode) ||
          e.mystery !== null ||
          e.trivia !== null
        )
          return null
        if ((e.geography as Round).guesses.length > e.limit) return null
      } else if (e.geography !== null) return null
      if (isMystery(e.kind as NodeKind)) {
        const game = adventureMysteryGame(e.kind as NodeKind)
        if (
          !game.parseSession(JSON.stringify({ version: 1, seen: [], round: e.mystery })) ||
          e.trivia !== null ||
          (e.mystery as MysteryRound).guesses.length > (e.limit as number)
        )
          return null
        if (
          (e.kind === 'who' || e.kind === 'identify') &&
          (!(raw[seenKey(e.kind)] as string[]).includes((e.mystery as MysteryRound).id) ||
            (e.result === 'active' && game.ended(e.mystery as MysteryRound)) ||
            (e.result === 'cleared' &&
              e.method === 'played' &&
              !game.solved(e.mystery as MysteryRound)) ||
            (e.result === 'failed' && !(e.mystery as MysteryRound).revealed))
        )
          return null
      } else if (e.mystery !== null) return null
      if (isTrivia(e.kind as NodeKind)) {
        const t = e.trivia
        if (
          !record(t) ||
          typeof t.id !== 'string' ||
          !questionById.has(t.id) ||
          !raw.seenTrivia.includes(t.id) ||
          !Array.isArray(t.order) ||
          !t.order.every((index) => integer(index, 0, 3)) ||
          [...t.order].sort().join(',') !== '0,1,2,3' ||
          (t.choice !== null && !integer(t.choice, 0, 3)) ||
          (t.correct !== null && typeof t.correct !== 'boolean') ||
          (t.choice === null) !== (t.correct === null) ||
          !integer(t.answered, 0, 500) ||
          !integer(t.score, 0, t.answered) ||
          !integer(t.streak, 0, t.score) ||
          !Array.isArray(t.eliminated) ||
          t.eliminated.length > 2 ||
          new Set(t.eliminated).size !== t.eliminated.length ||
          !t.eliminated.every((index) => integer(index, 0, 3))
        )
          return null
        const choices = (t.order as number[]).map(
          (index) => questionById.get(t.id as string)!.choices[index],
        )
        if (
          (t.eliminated as number[]).some(
            (index) => choices[index] === questionById.get(t.id as string)!.answer,
          ) ||
          (t.choice !== null &&
            (t.correct !== (choices[t.choice as number] === questionById.get(t.id)!.answer) ||
              (t.eliminated as number[]).includes(t.choice as number)))
        )
          return null
        if (t.correct === false && t.streak !== 0) return null
        if (t.choice !== null && (t.answered === 0 || (t.correct && t.streak === 0))) return null
        if (e.kind === 'trivia' && t.answered > 3) return null
        if (
          e.result === 'cleared' &&
          e.method === 'played' &&
          (e.kind === 'trivia'
            ? t.answered !== 3 || t.score < 2
            : t.streak < (e.kind === 'boss' ? 3 : 2))
        )
          return null
      } else if (e.trivia !== null) return null
      if (
        e.result === 'active'
          ? raw.outcomes[e.nodeId as string] !== undefined
          : raw.outcomes[e.nodeId as string] !== e.result
      )
        return null
    }
    if (path.slice(0, raw.encounter ? -1 : undefined).some((node) => !outcomes[node.id]))
      return null
    if (
      (raw.status === 'playing' &&
        (raw.hearts === 0 ||
          ((raw.encounter as Encounter | null)?.kind === 'boss' &&
            (raw.encounter as Encounter).result !== 'active'))) ||
      (raw.status === 'won' &&
        ((raw.encounter as Encounter | null)?.kind !== 'boss' ||
          (raw.encounter as Encounter).result !== 'cleared' ||
          raw.hearts === 0)) ||
      (raw.status === 'lost' && raw.hearts !== 0)
    )
      return null
    if (raw.version === 1) {
      // Keep preview progress, purchases and in-flight trials when adding the extra route row.
      const nextId = (id: string) => {
        const [row, lane] = id.split('-').map(Number)
        return `${row >= 6 ? row + 1 : row}-${lane}`
      }
      const migratedPath = pathIds.map(nextId)
      const migratedOutcomes = Object.fromEntries(
        Object.entries(outcomes).map(([id, result]) => [nextId(id), result]),
      )
      if (pathIds.length > 6) {
        migratedPath.splice(6, 0, '6-1')
        migratedOutcomes['6-1'] = 'cleared'
      }
      const scene = raw.encounter as Encounter | null
      return parseAdventure(
        JSON.stringify({
          ...raw,
          version: 2,
          map: [
            ...map.map((node) => ({
              ...node,
              id: nextId(node.id),
              row: node.row >= 6 ? node.row + 1 : node.row,
            })),
            ...shuffle(previousRows[6]).map((kind, lane) => ({
              id: `6-${lane}`,
              row: 6,
              lane,
              kind,
            })),
          ].sort((a, b) => a.row - b.row || a.lane - b.lane),
          path: migratedPath,
          outcomes: migratedOutcomes,
          encounter: scene
            ? {
                ...scene,
                nodeId: nextId(scene.nodeId),
                method: String(scene.method) === 'dev' ? 'carried' : scene.method,
              }
            : null,
          message: /developer/i.test(raw.message)
            ? 'Your adventure is ready to continue.'
            : raw.message,
        }),
      )
    }
    if (raw.version === 2) {
      // Insert a third section before the old boss; never send an active boss battle backwards.
      const nextId = (id: string) => (id === '8-1' ? '12-1' : id)
      const migratedPath = pathIds.map(nextId)
      const migratedOutcomes = Object.fromEntries(
        Object.entries(outcomes).map(([id, result]) => [nextId(id), result]),
      )
      if (pathIds.includes('8-1')) {
        migratedPath.splice(8, 0, '8-1', '9-1', '10-1', '11-1')
        for (const id of ['8-1', '9-1', '10-1', '11-1']) migratedOutcomes[id] = 'cleared'
      }
      const scene = raw.encounter as Encounter | null
      return parseAdventure(
        JSON.stringify({
          ...raw,
          version: 3,
          map: [
            ...map.map((node) => ({
              ...node,
              id: nextId(node.id),
              row: node.row === 8 ? 12 : node.row,
            })),
            ...previousRows.slice(8, 12).flatMap((kinds, index) =>
              shuffle(kinds).map((kind, lane) => ({
                id: `${index + 8}-${kinds.length === 1 ? 1 : lane}`,
                row: index + 8,
                lane: kinds.length === 1 ? 1 : lane,
                kind,
              })),
            ),
          ].sort((a, b) => a.row - b.row || a.lane - b.lane),
          path: migratedPath,
          outcomes: migratedOutcomes,
          encounter: scene
            ? {
                ...scene,
                nodeId: nextId(scene.nodeId),
                method: scene.kind === 'boss' && scene.method === 'item' ? 'carried' : scene.method,
              }
            : null,
        }),
      )
    }
    if (
      (raw.encounter as Encounter | null)?.kind === 'boss' &&
      (raw.encounter as Encounter).method === 'item'
    )
      return null
    if (raw.version === 3) {
      // Keep every visited node and in-flight trial intact; introduce new trials only ahead.
      const lastRow = path.at(-1)?.row ?? -1
      return parseAdventure(
        JSON.stringify({
          ...raw,
          version: 4,
          seenWho: [],
          seenPortraits: [],
          map: map.map((node) => ({
            ...node,
            kind:
              node.row > lastRow && node.kind === newTrials.get(node.row)?.[0]
                ? newTrials.get(node.row)![1]
                : node.kind,
          })),
        }),
      )
    }
    return raw as unknown as AdventureRun
  } catch {
    return null
  }
}
export function loadAdventure(): { run: AdventureRun; warning?: string } {
  try {
    const saved = localStorage.getItem(ADVENTURE_KEY)
    const restored = parseAdventure(saved)
    return restored
      ? { run: restored }
      : {
          run: newAdventure(),
          ...(saved
            ? {
                warning: 'The saved adventure could not be restored. A fresh adventure is ready.',
              }
            : {}),
        }
  } catch {
    return {
      run: newAdventure(),
      warning: 'Browser storage is unavailable. This run may not survive a refresh.',
    }
  }
}
