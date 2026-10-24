export const rupee = (n: number) => `₹${Number.isInteger(n) ? n : n.toFixed(1)}`

export function formatSize(g?: number): string {
  if (!g) return ''
  return g >= 1000 ? `${+(g / 1000).toFixed(2)} kg` : `${g} g`
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** Recent searches worth keeping: not junk, not essays. */
export function isReasonableQuery(q: string): boolean {
  const t = q.trim()
  return t.length >= 2 && t.length <= 40 && /[a-z0-9]/i.test(t)
}
