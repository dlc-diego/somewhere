import {
  ADVENTURE_BALANCE as balance,
  COIN_REWARDS,
  availableNodes,
  type AdventureRun,
  type NodeKind,
} from './adventure'

export const ROUTE_SECTIONS = [
  { first: 0, last: 3, title: 'First steps' },
  { first: 4, last: 7, title: 'The middle path' },
  { first: 8, last: 12, title: 'The final stretch' },
] as const

export function currentRouteSection(run: AdventureRun): number {
  const nodeId = run.encounter?.nodeId || availableNodes(run)[0]?.id || run.path.at(-1)
  const row = run.map.find((node) => node.id === nodeId)?.row ?? 0
  return ROUTE_SECTIONS.findIndex((section) => row <= section.last)
}

export function trialPreview(kind: NodeKind) {
  let budget: string, goal: string, risk: string, reward: string
  if (kind === 'shop')
    return {
      budget: 'Browse supplies',
      goal: 'Buy supplies for the trials ahead. Buying and using are separate actions.',
      risk: 'No heart risk. Spend only the coins you choose; leaving is free.',
      reward: 'Items at their listed prices. Lucky stars are not sold.',
    }
  if (kind === 'rest')
    return {
      budget: 'Restore 1 heart',
      goal: 'Take a quiet break before continuing.',
      risk: 'No heart risk.',
      reward: 'Restore 1 heart, up to your current maximum.',
    }
  if (kind === 'event')
    return {
      budget: 'Choose a discovery',
      goal: 'Choose between a supply cache and a healing spring.',
      risk: 'No heart risk.',
      reward: `A supply item + ${balance.discoveryCoins} coins, or restore 1 heart up to your maximum.`,
    }
  if (kind === 'elite' || kind === 'boss') {
    const target = kind === 'boss' ? balance.bossStreak : balance.eliteStreak
    budget = `${target} correct in a row`
    goal = `Build a streak of ${target} correct answers. Each wrong answer resets the streak.`
    risk = 'Each wrong answer risks 1 heart.'
    if (kind === 'boss')
      risk += ' Abandoning the final boss ends the run. Lucky stars cannot clear it.'
    reward = `+${kind === 'boss' ? COIN_REWARDS.boss : COIN_REWARDS.elite} coins on clear${kind === 'boss' ? ' and adventure complete.' : '.'}`
  } else {
    risk = 'Failing or giving up risks 1 heart.'
    reward = `+${COIN_REWARDS.normal} coins on clear.`
    if (kind === 'trivia') {
      budget = '3 questions'
      goal = `Get ${balance.triviaTarget} of 3 questions correct. Finish all three before the trial is scored.`
    } else if (kind === 'journey') {
      budget = `Shortest route + ${balance.journeySpareCrossings} crossing`
      goal =
        'Cross continuous land borders through Africa–Eurasia. The route needs at least 5 crossings; its exact budget appears when you begin.'
    } else if (kind === 'mystery' || kind === 'who' || kind === 'identify') {
      budget = `${balance.mysteryGuesses} guesses`
      goal =
        kind === 'identify'
          ? 'Identify a person from a portrait, with one optional free text clue.'
          : `Solve the clues with up to ${balance.freeMysteryClues} free clues, including the first.`
    } else {
      budget = `${balance.geographyGuesses} guesses`
      goal =
        kind === 'capitals'
          ? 'Find the mystery capital using geographic feedback.'
          : kind === 'flags'
            ? 'Identify the country from its flag. A continent hint is free.'
            : kind === 'shapes'
              ? 'Identify the country from its shape. A continent hint is free.'
              : 'Find the mystery country using geographic feedback.'
    }
  }
  return { budget, goal, risk, reward }
}
