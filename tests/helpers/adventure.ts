import {
  newAdventure,
  chooseNode,
  availableNodes,
  resolveRest,
  resolveEvent,
  leaveShop,
  returnToRoute,
  answerAdventureTrivia,
  nextAdventureQuestion,
  triviaChoices,
  guessAdventureCountry,
  guessAdventureMystery,
  adventureMysteryGame,
  type AdventureRun,
  type NodeKind,
} from '../../src/lib/adventure'
import { questionById } from '../../src/lib/something'
import { shortestBorderRoute } from '../../src/lib/journey'

// Test fixtures use ordinary game actions; production has no testing shortcuts.
export function stockedAdventure(): AdventureRun {
  const run = newAdventure()
  return {
    ...run,
    coins: 100,
    inventory: {
      potion: 3,
      container: 2,
      fifty: 3,
      star: 3,
      shield: 3,
      hint: 3,
      boots: 3,
      reroll: 3,
      feather: 1,
    },
  }
}
export function answer(run: AdventureRun, correct = true): AdventureRun {
  const choices = triviaChoices(run.encounter!)
  const expected = questionById.get(run.encounter!.trivia!.id)!.answer
  return answerAdventureTrivia(
    run,
    choices.findIndex((choice) => (correct ? choice === expected : choice !== expected)),
  ).run
}
export function completeEncounter(run: AdventureRun): AdventureRun {
  const scene = run.encounter!
  if (scene.kind === 'rest') return resolveRest(run).run
  if (scene.kind === 'shop') return leaveShop(run).run
  if (scene.kind === 'event') return resolveEvent(run, 'supplies').run
  if (scene.trivia) {
    while (run.encounter!.result === 'active') {
      if (run.encounter!.trivia!.choice !== null) run = nextAdventureQuestion(run).run
      run = answer(run)
    }
    return run
  }
  if (scene.geography) {
    const geo = scene.geography
    const route =
      geo.mode === 'journey'
        ? shortestBorderRoute(geo.guesses.at(-1) || geo.start!, geo.answer)!.slice(1)
        : [geo.answer]
    for (const id of route) run = guessAdventureCountry(run, id).run
    return run
  }
  return guessAdventureMystery(
    run,
    adventureMysteryGame(scene.kind).byId.get(scene.mystery!.id)!.answer,
  ).run
}
export function closeStop(run: AdventureRun): AdventureRun {
  return returnToRoute(completeEncounter(run)).run
}
export function at(kind: NodeKind): AdventureRun {
  let run = stockedAdventure()
  const target = run.map.find((node) => node.kind === kind)!
  while (run.path.length < target.row) {
    run = chooseNode(run, availableNodes(run).find((node) => node.lane === 1)!.id).run
    run = closeStop(run)
  }
  return chooseNode(run, target.id).run
}

export function previousSave(run: AdventureRun): string {
  const legacy = JSON.parse(legacySave(run)) as AdventureRun
  const keep = (id: string) => {
    const row = Number(id.split('-')[0])
    return row < 8 || row === 12
  }
  const oldId = (id: string) => (id === '12-1' ? '8-1' : id)
  return JSON.stringify({
    ...legacy,
    version: 2,
    map: legacy.map
      .filter((node) => keep(node.id))
      .map((node) => ({ ...node, id: oldId(node.id), row: node.row === 12 ? 8 : node.row })),
    path: run.path.filter(keep).map(oldId),
    outcomes: Object.fromEntries(
      Object.entries(run.outcomes)
        .filter(([id]) => keep(id))
        .map(([id, result]) => [oldId(id), result]),
    ),
    encounter: run.encounter ? { ...run.encounter, nodeId: oldId(run.encounter.nodeId) } : null,
  })
}

// Model the real version-3 layout, before Someone trials existed.
export function legacySave(run: AdventureRun): string {
  if (run.encounter?.kind === 'who' || run.encounter?.kind === 'identify')
    throw new Error('Someone trials did not exist in legacy adventures')
  const oldKinds: Record<number, NodeKind> = {
    1: 'capitals',
    4: 'trivia',
    8: 'mystery',
    9: 'trivia',
  }
  return JSON.stringify({
    ...run,
    version: 3,
    seenWho: undefined,
    seenPortraits: undefined,
    map: run.map.map((node) => ({
      ...node,
      kind: node.kind === 'who' || node.kind === 'identify' ? oldKinds[node.row] : node.kind,
    })),
  })
}
export function previewSave(run: AdventureRun): string {
  const oldId = (id: string) => {
    const [row, lane] = id.split('-').map(Number)
    return `${row > 6 ? row - 1 : row}-${lane}`
  }
  const previous = JSON.parse(previousSave(run)) as AdventureRun
  return JSON.stringify({
    ...previous,
    version: 1,
    map: previous.map
      .filter((node) => node.row !== 6)
      .map((node) => ({
        ...node,
        id: oldId(node.id),
        row: node.row > 6 ? node.row - 1 : node.row,
      })),
    path: previous.path.filter((id) => !id.startsWith('6-')).map(oldId),
    outcomes: Object.fromEntries(
      Object.entries(previous.outcomes)
        .filter(([id]) => !id.startsWith('6-'))
        .map(([id, result]) => [oldId(id), result]),
    ),
    encounter: previous.encounter
      ? { ...previous.encounter, nodeId: oldId(previous.encounter.nodeId) }
      : null,
  })
}
