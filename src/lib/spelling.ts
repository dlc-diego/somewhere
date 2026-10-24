// One insertion, deletion, substitution, or adjacent transposition only.
// Short/ambiguous names and exact answers elsewhere in the catalog get no nudge.
export function oneEditApart(a: string, b: string): boolean {
  if (a === b || Math.abs(a.length - b.length) > 1) return false
  if (a.length === b.length) {
    const different = [...a].flatMap((char, i) => (char === b[i] ? [] : [i]))
    return (
      different.length === 1 ||
      (different.length === 2 &&
        different[1] === different[0] + 1 &&
        a[different[0]] === b[different[1]] &&
        a[different[1]] === b[different[0]])
    )
  }
  const [shorter, longer] = a.length < b.length ? [a, b] : [b, a]
  let i = 0
  while (i < shorter.length && shorter[i] === longer[i]) i++
  return shorter.slice(i) === longer.slice(i + 1)
}
export function spellingSlip(input: string, catalog: Map<string, Set<string>>) {
  if (input.length < 5 || catalog.has(input)) return false
  const owners = new Set<string>()
  for (const [answer, ids] of catalog) {
    if (answer.length < 5 || !oneEditApart(input, answer)) continue
    for (const id of ids) owners.add(id)
    if (owners.size > 1) return false
  }
  return owners.size === 1
}
