import { McpAuthError } from '../mcp'
import { swiggyClient } from '../swiggy'
import { NeedsLocationError, NeedsLoginError, ProviderUnavailableError, type Adapter, type Location, type Offer } from '../types'

const record = (v: unknown): Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {}

/** Official search_products schema: prices are rupees; each variation is a separate offer. */
export function parseInstamartSearch(raw: unknown, now = Date.now()): Offer[] {
  const envelope = record(raw)
  let payload = record(envelope.structuredContent ?? raw)
  if (Array.isArray(envelope.content) && !envelope.structuredContent) {
    const text = envelope.content.map(record).find(c => c.type === 'text' && typeof c.text === 'string')?.text
    try { payload = record(JSON.parse(String(text))) } catch { throw new ProviderUnavailableError('Instamart returned an unreadable search response.') }
  }
  if (envelope.isError || payload.success !== true) throw new ProviderUnavailableError('Instamart could not search. Check the official Swiggy connection and delivery location, then retry.')
  const data = record(payload.data)
  if (!Array.isArray(data.products)) throw new ProviderUnavailableError('Instamart changed its product response. No prices were guessed.')
  const seen = new Set<string>()
  return data.products.flatMap(rawProduct => {
    const product = record(rawProduct)
    if (!Array.isArray(product.variations)) return []
    return product.variations.flatMap(rawVariant => {
      const v = record(rawVariant), pricing = record(v.price)
      const id = v.skuId, title = v.displayName || product.displayName, price = pricing.offerPrice
      if (typeof id !== 'string' || !id || seen.has(id) || typeof title !== 'string' || !title.trim() || typeof price !== 'number' || !Number.isFinite(price) || price <= 0) return []
      seen.add(id)
      const packLabel = typeof v.quantityDescription === 'string' ? v.quantityDescription : undefined
      return [{ platform: 'instamart' as const, productId: id, title: `${title}${packLabel ? ` ${packLabel}` : ''}`, packLabel,
        brand: typeof v.brandName === 'string' ? v.brandName : typeof product.brand === 'string' ? product.brand : undefined,
        price, mrp: typeof pricing.mrp === 'number' && Number.isFinite(pricing.mrp) && pricing.mrp >= price ? pricing.mrp : undefined,
        inStock: v.isInStockAndAvailable === true && product.inStock !== false && product.isAvail !== false,
        imageUrl: typeof v.imageUrl === 'string' && v.imageUrl.startsWith('https://') ? v.imageUrl : undefined,
        // The contract does not expose a product URL. Open the provider's real search instead.
        deepLink: `https://www.swiggy.com/instamart/search?custom_back=true&query=${encodeURIComponent(title)}`, fetchedAt: now }]
    })
  })
}

export function createInstamartAdapter(clientFactory = swiggyClient): Adapter {
  let location: Location
  return {
    platform: 'instamart', attempts: 1, serial: true,
    async setLocation(next) { location = { ...next } },
    async search(query, signal) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
      if (!Number.isFinite(location?.lat) || !Number.isFinite(location?.lng) || Math.abs(location.lat!) > 90 || Math.abs(location.lng!) > 180) {
        throw new NeedsLocationError('Set an exact location in Sasta to search Instamart. A postcode alone is not enough.')
      }
      try {
        // Coordinate/guest-price mode is documented by Swiggy. Never guess a saved address ID.
        const result = await clientFactory(signal).callTool('search_products', { query, latitude: location.lat, longitude: location.lng })
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
        return parseInstamartSearch(result)
      } catch (error) {
        if (error instanceof McpAuthError) throw new NeedsLoginError('instamart')
        throw error
      }
    },
  }
}
