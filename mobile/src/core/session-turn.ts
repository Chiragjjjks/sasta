/** Account checks and storefront searches share one WebView per origin. */
const turns = new Map<string, Promise<void>>()
export async function withSessionTurn<T>(origin: string, work: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  const aborted = () => new DOMException('Aborted', 'AbortError')
  if (signal?.aborted) throw aborted()
  const job = (turns.get(origin) ?? Promise.resolve()).then(() => {
    if (signal?.aborted) throw aborted()
    return work()
  })
  const tail = job.then(() => {}, () => {})
  turns.set(origin, tail)
  void tail.then(() => { if (turns.get(origin) === tail) turns.delete(origin) })
  let onAbort: (() => void) | undefined
  const cancelled = new Promise<never>((_, reject) => {
    onAbort = () => reject(aborted())
    signal?.addEventListener('abort', onAbort, { once: true })
  })
  try { return await Promise.race([job, cancelled]) }
  finally { if (onAbort) signal?.removeEventListener('abort', onAbort) }
}
