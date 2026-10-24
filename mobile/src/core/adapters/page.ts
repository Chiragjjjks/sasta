import { PlatformSession } from '@/native/platformSession'
import { NeedsLocationError, NeedsLoginError, ProviderBlockedError, ProviderUnavailableError, type Adapter, type Location, type Offer, type Platform } from '../types'

export interface PageProduct {
  id: string; title: string; packLabel?: string; price: number; mrp?: number
  inStock: boolean; imageUrl?: string; url: string; brand?: string; etaMinutes?: number
}
export interface PageSnapshot {
  kind: 'products' | 'needs_login' | 'needs_location' | 'blocked' | 'unavailable'
  products?: PageProduct[]
  message?: string
  location?: { lat: number; lng: number }
}

export function parsePageProducts(platform: Platform, snapshot: PageSnapshot, now = Date.now()): Offer[] {
  if (snapshot.kind === 'needs_login') throw new NeedsLoginError(platform)
  if (snapshot.kind === 'needs_location') throw new NeedsLocationError(snapshot.message || 'Choose a delivery area in this app.')
  if (snapshot.kind === 'blocked') throw new ProviderBlockedError(snapshot.message || 'The shopping site blocked this request.')
  if (snapshot.kind !== 'products') throw new ProviderUnavailableError(snapshot.message || 'This quick-delivery store is unavailable.')
  const seen = new Set<string>()
  return (snapshot.products ?? []).filter((p) => {
    if (!p.id || seen.has(p.id) || !p.title || !Number.isFinite(p.price) || p.price <= 0 || !/^https:\/\//.test(p.url)) return false
    seen.add(p.id)
    return true
  }).map((p) => ({
    platform, productId: p.id, title: `${p.title}${p.packLabel ? ` ${p.packLabel}` : ''}`,
    brand: p.brand, packLabel: p.packLabel, price: p.price,
    mrp: p.mrp && p.mrp >= p.price ? p.mrp : undefined, inStock: p.inStock,
    imageUrl: p.imageUrl, deepLink: p.url, etaMinutes: p.etaMinutes, fetchedAt: now,
  }))
}

/** An account's selected delivery area must agree with the location being compared. */
export function assertDeliveryArea(actual: PageSnapshot['location'], expected: Location, name: string) {
  if (!actual || expected.lat === undefined || expected.lng === undefined) return
  const rad = Math.PI / 180
  const dy = (actual.lat - expected.lat) * rad
  const dx = (actual.lng - expected.lng) * rad
  const a = Math.sin(dy / 2) ** 2 + Math.cos(actual.lat * rad) * Math.cos(expected.lat * rad) * Math.sin(dx / 2) ** 2
  const km = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  if (km > 2) throw new NeedsLocationError(`${name}'s selected delivery area differs from ${expected.label}. Choose the same area in both apps.`)
}

/** Serialize each provider's pages: cart refreshes may search several queries concurrently. */
export function createPageAdapter(platform: Platform, origin: string, name: string, path: (q: string) => string, script: (q: string, loc: Location) => string): Adapter {
  let location: Location
  let generation = 0
  return {
    platform, timeoutMs: 25000, attempts: 1, serial: true,
    async setLocation(next) { location = { ...next } },
    async search(query, signal) {
      const at = { ...location }
      const own = ++generation
      const reset = () => { if (own === generation) return PlatformSession.pageReset({ origin }).catch(() => {}) }
      signal.addEventListener('abort', reset, { once: true })
      try {
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
        await PlatformSession.pageReset({ origin })
        const result = await PlatformSession.pageRun({ origin, path: path(query), script: script(query, at), timeoutMs: 22000 })
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
        if (!result.ok) {
          if (/403|429|blocked|captcha/i.test(result.error ?? '')) throw new ProviderBlockedError(`${name} blocked this request. Open its delivery area screen and try again.`)
          throw new Error(result.error || `${name} could not search`)
        }
        const snapshot = result.value as PageSnapshot
        if (!snapshot || typeof snapshot !== 'object') throw new ProviderUnavailableError(`${name} did not return a search response.`)
        assertDeliveryArea(snapshot.location, at, name)
        return parsePageProducts(platform, snapshot)
      } finally { signal.removeEventListener('abort', reset); await reset() }
    },
  }
}
