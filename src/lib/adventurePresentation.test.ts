import { describe, expect, it, vi } from 'vitest'
import { availableNodes, chooseNode, newAdventure } from './adventure'
import { currentRouteSection, ROUTE_SECTIONS, trialPreview } from './adventurePresentation'
import { at, closeStop } from '../../tests/helpers/adventure'

describe('adventure route presentation', () => {
  it('focuses the next selectable section, or the active encounter, across gates and rest', () => {
    expect(currentRouteSection(newAdventure())).toBe(0)
    let run = closeStop(at('shop'))
    expect(currentRouteSection(run)).toBe(0)
    run = chooseNode(run, availableNodes(run)[0].id).run
    expect(currentRouteSection(run)).toBe(0)
    expect(currentRouteSection(closeStop(run))).toBe(1)
    expect(currentRouteSection(at('rest'))).toBe(1)
    expect(currentRouteSection(closeStop(at('rest')))).toBe(2)
    expect(currentRouteSection(at('boss'))).toBe(2)
    expect(
      ROUTE_SECTIONS.flatMap((s) =>
        Array.from({ length: s.last - s.first + 1 }, (_, i) => s.first + i),
      ),
    ).toEqual(Array.from({ length: 13 }, (_, i) => i))
  })
  it('previews choices without consuming random content or changing a saved run', () => {
    const run = newAdventure(),
      original = structuredClone(run)
    const random = vi.spyOn(crypto, 'getRandomValues')
    try {
      for (const node of run.map) {
        const preview = trialPreview(node.kind)
        expect(preview.goal).toBeTruthy()
        expect(preview.budget).toBeTruthy()
        expect(preview.risk).toBeTruthy()
        expect(preview.reward).toBeTruthy()
      }
      expect(random).not.toHaveBeenCalled()
      expect(run).toEqual(original)
    } finally {
      random.mockRestore()
    }
  })
  it('communicates the real stakes of trivia, boss, and mystery trials', () => {
    expect(trialPreview('trivia').goal).toContain('3 of 3')
    expect(trialPreview('trivia').reward).toBe('+4 coins on clear.')
    expect(trialPreview('elite')).toMatchObject({
      budget: '3 correct in a row',
      reward: '+7 coins on clear.',
    })
    expect(trialPreview('boss').budget).toBe('4 correct in a row')
    expect(trialPreview('boss').risk).toContain('Lucky stars cannot clear it')
    expect(trialPreview('boss').reward).toContain('adventure complete')
    expect(trialPreview('who').budget).toBe('3 guesses')
    expect(trialPreview('countries').budget).toBe('5 guesses')
    expect(trialPreview('identify').goal).toContain('one optional free text clue')
  })
  it('describes variable journey budgets and non-combat rewards honestly', () => {
    expect(trialPreview('journey')).toMatchObject({ budget: 'Shortest route + 1 crossing' })
    expect(trialPreview('journey').goal).toContain('at least 5 crossings')
    expect(trialPreview('shop').risk).toContain('leaving is free')
    expect(trialPreview('shop').reward).toContain('Lucky stars are not sold')
    expect(trialPreview('rest').reward).toContain('up to your current maximum')
    expect(trialPreview('event').reward).toContain('5 coins, or restore 1 heart')
  })
})
