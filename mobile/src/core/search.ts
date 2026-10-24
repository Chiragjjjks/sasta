import type { Adapter, AdapterStatus, Location, Offer, Platform } from './types'
import { NeedsLoginError, NotLiveError } from './types'

export const ADAPTER_TIMEOUT_MS = 15000
const CACHE_TTL_MS = 10 * 60 * 1000

const cache = new Map<string, { at: number; offers: Offer[] }>()

export interface SearchCallbacks {
  onStatus: (s: AdapterStatus) => void
  onOffers: (platform: Platform, offers: Offer[]) => void
}

async function withTimeout<T>(p: (signal: AbortSignal) => Promise<T>, parent: AbortSignal, ms: number): Promise<T> {
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

/**
 * Runs every adapter in parallel and streams results as each finishes.
 * One adapter failing, timing out or needing login never breaks the others.
 */
export async function runSearch(
  adapters: Adapter[], query: string, loc: Location, signal: AbortSignal, cb: SearchCallbacks,
  opts: { force?: boolean } = {},
): Promise<void> {
  await Promise.all(
    adapters.map(async (adapter) => {
      const { platform } = adapter
      if (signal.aborted) return
      const key = JSON.stringify([platform, loc.pincode, loc.lat, loc.lng, query.trim().toLowerCase()])
      const started = performance.now()
      const hit = cache.get(key)
      if (!opts.force && hit && Date.now() - hit.at < CACHE_TTL_MS) {
        cb.onOffers(platform, hit.offers)
        cb.onStatus({ platform, state: 'done', count: hit.offers.length, ms: 0 })
        return
      }
      cb.onStatus({ platform, state: 'searching', count: 0 })
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const offers = await withTimeout(async (s) => {
            await adapter.setLocation(loc)
            if (s.aborted) throw new DOMException('Aborted', 'AbortError')
            return adapter.search(query, s)
          }, signal, ADAPTER_TIMEOUT_MS)
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
          if (err instanceof NeedsLoginError) {
            cb.onStatus({ platform, state: 'needs_login', count: 0 })
            return
          }
          if (attempt === 1) {
            cb.onStatus({ platform, state: e?.name === 'AbortError' || e?.name === 'TimeoutError' ? 'timeout' : 'failed', count: 0, error: e?.message })
          }
        }
      }
    }),
  )
}

export function clearSearchCache() {
  cache.clear()
}
