import type { Adapter, AdapterStatus, Location, Offer, Platform, Source } from './types'
import { relevantOffers } from './normalize'
import { NeedsLocationError, NeedsLoginError, NotLiveError, ProviderBlockedError, ProviderUnavailableError } from './types'

export const ADAPTER_TIMEOUT_MS = 15000
const CACHE_TTL_MS = 10 * 60 * 1000

const cache = new Map<string, { at: number; offers: unknown[] }>()
const turns = new WeakMap<object, Promise<void>>()

/** A full shopping page can serve one query at a time. Queue wait is outside its timeout. */
async function withAdapterTurn(adapter: { serial?: boolean }, signal: AbortSignal, work: () => Promise<void>) {
  if (!adapter.serial) return work()
  const job = (turns.get(adapter) ?? Promise.resolve()).then(() => signal.aborted ? undefined : work())
  const tail = job.then(() => {}, () => {})
  turns.set(adapter, tail)
  void tail.then(() => { if (turns.get(adapter) === tail) turns.delete(adapter) })
  let onAbort: () => void = () => {}
  const cancelled = new Promise<void>(resolve => { onAbort = resolve; signal.addEventListener('abort', onAbort, { once: true }); if (signal.aborted) resolve() })
  try { await Promise.race([job, cancelled]) } finally { signal.removeEventListener('abort', onAbort) }
}

export interface SearchCallbacks<P extends string = Platform, R = Offer> {
  onStatus: (s: AdapterStatus<P>) => void
  onOffers: (platform: P, offers: R[]) => void
}

export async function withTimeout<T>(p: (signal: AbortSignal) => Promise<T>, parent: AbortSignal, ms: number): Promise<T> {
  const ctrl = new AbortController()
  let onAbort: () => void = () => {}
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    // Native WebViews may ignore AbortSignal. Reject independently of the adapter.
    const cancelled = new Promise<never>((_, reject) => {
      onAbort = () => { ctrl.abort(); reject(new DOMException('Aborted', 'AbortError')) }
      parent.addEventListener('abort', onAbort, { once: true })
      timer = setTimeout(() => {
        const error = new DOMException('Timed out', 'TimeoutError')
        ctrl.abort(error)
        reject(error)
      }, ms)
      if (parent.aborted) onAbort()
    })
    return await Promise.race([cancelled, Promise.resolve().then(() => {
      if (ctrl.signal.aborted) throw new DOMException('Aborted', 'AbortError')
      return p(ctrl.signal)
    })])
  } finally {
    clearTimeout(timer)
    parent.removeEventListener('abort', onAbort)
  }
}

/** Grocery search: every store in parallel, keeping offers that match the query. */
export function runSearch(
  adapters: Adapter[], query: string, loc: Location, signal: AbortSignal, cb: SearchCallbacks,
  opts: { force?: boolean } = {},
): Promise<void> {
  return runSources(adapters, query, loc, signal, cb, { ...opts, filter: relevantOffers })
}

/**
 * Runs every source in parallel and streams results as each finishes.
 * One source failing, timing out or needing login never breaks the others.
 */
export async function runSources<P extends string, R>(
  adapters: Source<P, R>[], query: string, loc: Location, signal: AbortSignal, cb: SearchCallbacks<P, R>,
  opts: { force?: boolean; filter: (items: R[], query: string) => R[] },
): Promise<void> {
  await Promise.all(
    adapters.map((adapter) => withAdapterTurn(adapter, signal, async () => {
      const { platform } = adapter
      if (signal.aborted) return
      const key = JSON.stringify([platform, loc.pincode, loc.lat, loc.lng, query.trim().toLowerCase()])
      const started = performance.now()
      const hit = cache.get(key)
      if (!opts.force && hit && Date.now() - hit.at < CACHE_TTL_MS) {
        cb.onOffers(platform, hit.offers as R[])
        cb.onStatus({ platform, state: 'done', count: hit.offers.length, ms: 0 })
        return
      }
      cb.onStatus({ platform, state: 'searching', count: 0 })
      const attempts = adapter.attempts ?? 2
      for (let attempt = 0; attempt < attempts; attempt++) {
        try {
          const offers = await withTimeout(async (s) => {
            await adapter.setLocation(loc)
            if (s.aborted) throw new DOMException('Aborted', 'AbortError')
            return opts.filter(await adapter.search(query, s), query)
          }, signal, adapter.timeoutMs ?? ADAPTER_TIMEOUT_MS)
          if (signal.aborted) return
          cache.set(key, { at: Date.now(), offers })
          cb.onOffers(platform, offers)
          cb.onStatus({ platform, state: 'done', count: offers.length, ms: performance.now() - started })
          return
        } catch (err) {
          if (signal.aborted) return
          const e = err as Error
          if (err instanceof NotLiveError) {
            cb.onStatus({ platform, state: 'unavailable', count: 0 })
            return
          }
          if (err instanceof ProviderUnavailableError) {
            cb.onStatus({ platform, state: 'unavailable', count: 0, error: err.message })
            return
          }
          if (err instanceof NeedsLoginError) {
            cb.onStatus({ platform, state: 'needs_login', count: 0 })
            return
          }
          if (err instanceof NeedsLocationError || err instanceof ProviderBlockedError) {
            cb.onStatus({ platform, state: err instanceof NeedsLocationError ? 'needs_location' : 'blocked', count: 0, error: err.message })
            return
          }
          if (attempt === attempts - 1) {
            cb.onStatus({ platform, state: e?.name === 'AbortError' || e?.name === 'TimeoutError' ? 'timeout' : 'failed', count: 0, error: e?.message })
          }
        }
      }
    })),
  )
}

export function clearSearchCache() {
  cache.clear()
}
