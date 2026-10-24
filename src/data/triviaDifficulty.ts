// Editorial difficulty within this pack, not a measured player-skill rating.
// Ten more specialist questions per category; every other question is standard.
export type TriviaDifficulty = 'standard' | 'hard'
const hardByCategory: Record<string, number[]> = {
  animal: [6, 9, 11, 16, 29, 30, 32, 33, 37, 40],
  space: [18, 21, 25, 30, 31, 32, 34, 35, 38, 40],
  science: [5, 7, 16, 23, 28, 30, 31, 32, 35, 39],
  food: [1, 4, 12, 17, 20, 23, 25, 28, 31, 37],
  history: [10, 13, 14, 15, 17, 25, 28, 30, 34, 40],
  arts: [8, 13, 19, 20, 24, 26, 28, 31, 35, 40],
  screen: [8, 11, 12, 21, 24, 27, 29, 31, 34, 35],
  nature: [5, 11, 15, 19, 23, 25, 29, 32, 38, 39],
  body: [12, 14, 15, 20, 21, 27, 30, 31, 36, 39],
  play: [5, 13, 15, 24, 27, 28, 30, 35, 37, 39],
}
export const hardQuestionIds = new Set(
  Object.entries(hardByCategory).flatMap(([category, numbers]) =>
    numbers.map(n => category + '-' + String(n).padStart(2, '0'))),
)
export const difficultyFor = (id: string): TriviaDifficulty =>
  hardQuestionIds.has(id) ? 'hard' : 'standard'
