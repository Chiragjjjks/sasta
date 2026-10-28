import readerScripts from './readers.generated.json'
import { McpAuthError, toolPayload, toolText, type McpClient } from '../mcp'
import { hasMcpSession, mcpClient } from '../mcp-connect'
import { NeedsLocationError, NeedsLoginError, ProviderUnavailableError, type Adapter, type Location, type Offer } from '../types'
import { createPageAdapter, type PageSnapshot } from './page'

export const ZEPTO_ORIGIN = 'https://www.zepto.com'
export const zeptoSearchPath = (query: string) => `/search?query=${encodeURIComponent(query)}`

/** Runs only inside Zepto's own page, with its normal session, signing and store selection. */
export async function readZeptoPage(query: string, waitMs = 12000): Promise<PageSnapshot> {
  const end = Date.now() + waitMs
  while (true) {
    const text = document.body?.innerText ?? ''
    if (/verify you are human|captcha|access denied|request blocked/i.test(text)) return { kind: 'blocked', message: 'Zepto needs verification on its own page.' }
    let point: { latitude?: number; longitude?: number } | undefined
    try { point = JSON.parse(localStorage.getItem('user-position') || '{}').state?.userPosition } catch { /* no selected area */ }
    const location = Number.isFinite(point?.latitude) && Number.isFinite(point?.longitude)
      ? { lat: point!.latitude!, lng: point!.longitude! } : undefined
    const cards = [...document.querySelectorAll<HTMLAnchorElement>('a[data-testid="product-card"][href*="/pvid/"]')]
    if (/login to continue searching|please log\s?in/i.test(text) && location) return { kind: 'needs_login' }
    if (cards.length && location) {
      const products = cards.slice(0,80).flatMap((card) => {
        const title = card.querySelector('[data-slot-id="ProductName"]')?.textContent?.trim() || card.querySelector('img')?.alt || ''
        const packLabel = card.querySelector('[data-slot-id="PackSize"]')?.textContent?.trim()
        const priceRoot = card.querySelector<HTMLElement>('[data-slot-id="EdlpPrice"]') ?? card.querySelector<HTMLElement>('[data-slot-id$="Price"]') ?? card
        const prices = [...priceRoot.innerText.matchAll(/₹\s*([\d,]+(?:\.\d+)?)/g)]
          .map((m) => +m[1].replace(/,/g, ''))
        const id = card.pathname.split('/pvid/')[1]?.split('/')[0]
        if (!id || !title || !prices.length) return []
        return [{ id, title, packLabel, price: prices[0], mrp: prices[1],
          inStock: card.querySelector('[data-is-out-of-stock]')?.getAttribute('data-is-out-of-stock') !== 'true' && !/out of stock|notify me|sold out/i.test(card.innerText),
          imageUrl: card.querySelector('img')?.src, url: new URL(card.getAttribute('href')!, locationOrigin()).href }]
      })
      if (products.length) return { kind: 'products', location, products }
    }
    if (/select location|your location/i.test(text) && !location && Date.now() > end - waitMs + 1500) return { kind: 'needs_location', message: 'Choose a delivery area in Zepto, then search again.' }
    if (location && /no (?:products|results)|couldn.t find|no matches/i.test(text)) return { kind: 'products', products: [], location }
    if (Date.now() >= end) return { kind: location ? 'unavailable' : 'needs_location', message: location ? `Zepto did not finish searching for “${query}”. Try again.` : 'Choose a delivery area in Zepto, then search again.' }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  function locationOrigin() { return 'https://www.zepto.com' }
}

export const zeptoReadScript = (query: string, _loc?: Location) => `return await (${readerScripts.readZeptoPage})(${JSON.stringify(query)});`

/* ---------------------------------------------------------------- official MCP (mcp.zepto.co.in) */

const record = (v: unknown): Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {}
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'product'

/** get_location_serviceability answers in text. It also links the location to the MCP session. */
export function parseZeptoServiceability(raw: unknown): { serviceable: boolean; etaMinutes?: number } {
  const text = toolText(raw)
  if (record(raw).isError) throw new ProviderUnavailableError(`Zepto: ${text.split('\n')[0] || 'could not check this location'}`)
  const serviceable = /delivers to your location|store id/i.test(text) && !/(does not|doesn.t|not) (deliver|serviceable)|unserviceable/i.test(text)
  const eta = text.match(/\bETA:\s*(\d+)\s*min/i)
  return { serviceable, etaMinutes: eta ? +eta[1] : undefined }
}

/** search_products: prices are paise (8800 = ₹88), checked against the storefront on 2026-10-28. */
export function parseZeptoMcpSearch(raw: unknown, etaMinutes?: number, now = Date.now()): Offer[] {
  if (record(raw).isError) throw new ProviderUnavailableError(`Zepto: ${toolText(raw).split('\n')[0] || 'search failed'}`)
  const payload = toolPayload(raw)
  if (!payload || !Array.isArray(payload.products)) throw new ProviderUnavailableError('Zepto changed its product response. No prices were guessed.')
  const seen = new Set<string>()
  return payload.products.map(record).flatMap(p => {
    const id = p.productVariantId ?? p.id, name = p.name, paise = p.price
    if (typeof id !== 'string' || !id || seen.has(id) || typeof name !== 'string' || !name.trim() || typeof paise !== 'number' || !Number.isFinite(paise) || paise <= 0) return []
    seen.add(id)
    const price = Math.round(paise) / 100
    const mrp = typeof p.mrp === 'number' && Number.isFinite(p.mrp) && p.mrp >= paise ? Math.round(p.mrp) / 100 : undefined
    const packLabel = typeof p.packSize === 'string' && p.packSize ? p.packSize : undefined
    return [{ platform: 'zepto' as const, productId: id, title: `${name}${packLabel ? ` ${packLabel}` : ''}`, packLabel, price, mrp,
      inStock: typeof p.availableQuantity === 'number' ? p.availableQuantity > 0 : p.outOfStock !== true,
      imageUrl: typeof p.imageUrl === 'string' && p.imageUrl.startsWith('https://') ? p.imageUrl : undefined,
      deepLink: `${ZEPTO_ORIGIN}/pn/${slug(name)}/pvid/${id}`, etaMinutes, fetchedAt: now,
      meta: { storeProductId: p.storeProductId, promoted: p.isAd === true } }]
  })
}

/**
 * Zepto through its official MCP server when connected, else the storefront in a hidden WebView.
 * One MCP session is kept so the location set by get_location_serviceability stays linked to it.
 */
export function createZeptoAdapter(opts: { connected?: () => Promise<boolean>; client?: () => McpClient } = {}): Adapter {
  const page = createPageAdapter('zepto', ZEPTO_ORIGIN, 'Zepto', zeptoSearchPath, zeptoReadScript)
  const connected = opts.connected ?? (() => hasMcpSession('zepto'))
  let client: McpClient | undefined
  let linked: { key: string; session?: string; etaMinutes?: number } | undefined
  let location: Location
  return {
    platform: 'zepto', timeoutMs: page.timeoutMs, attempts: 1, serial: true,
    async setLocation(next) { location = { ...next }; await page.setLocation(next) },
    async search(query, signal) {
      if (!(await connected())) { client = undefined; linked = undefined; return page.search(query, signal) }
      const { lat, lng } = location ?? {}
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new NeedsLocationError('Set an exact location in Sasta to search Zepto.')
      client ??= opts.client?.() ?? mcpClient('zepto')
      try {
        const key = `${lat!.toFixed(5)},${lng!.toFixed(5)}`
        const c = client
        const link = async () => {
          const area = parseZeptoServiceability(await c.callTool('get_location_serviceability', { latitude: lat, longitude: lng }, signal))
          if (!area.serviceable) throw new ProviderUnavailableError(`Zepto does not deliver to ${location.label}.`)
          return { key, session: c.sessionId, etaMinutes: area.etaMinutes }
        }
        if (linked?.key !== key || linked.session !== c.sessionId) linked = await link()
        let result = await c.callTool('search_products', { query }, signal)
        // A new server session (the old one expired mid-call) has no location: link it and search again.
        if (c.sessionId !== linked.session) { linked = await link(); result = await c.callTool('search_products', { query }, signal) }
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
        return parseZeptoMcpSearch(result, linked.etaMinutes)
      } catch (error) {
        if (error instanceof McpAuthError) { client = undefined; linked = undefined; throw new NeedsLoginError('zepto') }
        throw error
      }
    },
  }
}
