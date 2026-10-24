import readerScripts from './readers.generated.json'
import type { Location } from '../types'
import { createPageAdapter, type PageSnapshot } from './page'

export const FLIPKART_ORIGIN = 'https://www.flipkart.com'
export const FLIPKART_API = 'https://1.rome.api.flipkart.com/api/4/page/fetch?cacheFirst=false'
export const flipkartSearchPath = (q: string) => `/hyperlocal/pr?q=${encodeURIComponent(q)}&marketplace=HYPERLOCAL&sid=search.flipkart.com`

/** The same Hyperlocal page endpoint used by Flipkart's website. No retail fallback. */
export async function readFlipkartPage(query: string, pincode: string, apiUrl: string): Promise<PageSnapshot> {
  const pageUri = `/hyperlocal/pr?q=${encodeURIComponent(query)}&marketplace=HYPERLOCAL&sid=search.flipkart.com`
  const response = await fetch(apiUrl, {
    method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json', flipkart_secure: 'true',
      'x-user-agent': navigator.userAgent.includes('FKUA/msite') ? navigator.userAgent : `${navigator.userAgent} FKUA/msite/0.0.4/msite/Mobile` },
    body: JSON.stringify({ pageUri, pageContext: { networkSpeed: 1700 }, requestContext: { type: 'BROWSE_PAGE' }, locationContext: { pincode: +pincode, changed: false } }),
  })
  if (response.status === 401) return { kind: 'needs_login' }
  if (response.status === 403 || response.status === 429) return { kind: 'blocked', message: `Flipkart Minutes returned HTTP ${response.status}. Open its delivery area screen and try again.` }
  if (!response.ok) return { kind: 'unavailable', message: `Flipkart Minutes returned HTTP ${response.status}.` }
  const json = await response.json()
  const result = json.RESPONSE ?? json
  const redirect = result.pageMeta?.redirectionObject?.url ?? ''
  if (/login|account\/login/.test(redirect)) return { kind: 'needs_login' }
  if (/hyperlocal-preview|address-map|shippingAddress/i.test(redirect)) return { kind: 'needs_location', message: 'Choose an exact delivery address in Flipkart Minutes, then search again.' }
  if (redirect) return { kind: 'unavailable', message: 'Flipkart did not return a Minutes search. Regular marketplace results were excluded.' }
  const marketplace = result.pageMeta?.marketplace ?? result.pageData?.marketplace
  if (marketplace && marketplace !== 'HYPERLOCAL') return { kind: 'unavailable', message: 'Flipkart returned regular marketplace results; only Minutes is enabled.' }
  const slots = result.slots
  if (!Array.isArray(slots)) return { kind: 'unavailable', message: 'Flipkart changed its search response. No prices were guessed.' }
  const products: NonNullable<PageSnapshot['products']> = []
  const seen = new Set<string>()
  function walk(value: unknown) {
    if (!value || typeof value !== 'object') return
    const v = value as Record<string, any> // provider's server-driven widget tree
    if (v.pricing?.finalPrice && (v.titles || v.productTitle)) {
      const rawUrl = v.baseUrl || v.smartUrl || ''
      let url: URL
      try { url = new URL(rawUrl, 'https://www.flipkart.com') } catch { return }
      if (url.hostname !== 'www.flipkart.com' || !url.pathname.includes('/p/')) return
      if (url.searchParams.has('marketplace') && url.searchParams.get('marketplace') !== 'HYPERLOCAL') return
      const id = v.id || v.productId || url.searchParams.get('pid') || url.pathname.split('/p/')[1]
      if (!id || seen.has(id)) return
      seen.add(id)
      url.searchParams.set('marketplace', 'HYPERLOCAL')
      const price = Number(v.pricing.finalPrice.value)
      const mrp = Number(v.pricing.prices?.find((p: { priceType?: string }) => p.priceType === 'MRP')?.value ?? v.pricing.mrp)
      const title = v.titles?.title || v.titles?.newTitle || v.productTitle
      const subtitle = v.titles?.subtitle
      const image = v.media?.images?.[0]?.url || v.images?.[0]?.url
      products.push({ id: String(id), title, packLabel: typeof subtitle === 'string' && /\d/.test(subtitle) ? subtitle : undefined, price, mrp,
        inStock: !['OUT_OF_STOCK', 'CURRENTLY_UNAVAILABLE', 'NOT_SERVICEABLE'].includes(v.availability?.displayState)
          && v.productAction?.value?.enabled !== false && v.buyability?.intent !== 'negative',
        imageUrl: typeof image === 'string' ? image.replace('{@width}', '240').replace('{@height}', '240').replace('{@quality}', '80') : undefined, url: url.href })
      return
    }
    for (const child of Object.values(v)) if (child && typeof child === 'object') walk(child)
  }
  walk(slots)
  if (!products.length && /not.serviceable|not.deliver|not.available.in|coming.soon/i.test(JSON.stringify(result.pageData ?? {}))) {
    return { kind: 'needs_location', message: 'Flipkart Minutes is not serving the selected address. Choose a serviceable delivery area.' }
  }
  return { kind: 'products', products }
}

export const flipkartReadScript = (query: string, loc: Location, apiUrl = FLIPKART_API) =>
  `return await (${readerScripts.readFlipkartPage})(${JSON.stringify(query)},${JSON.stringify(loc.pincode)},${JSON.stringify(apiUrl)});`
export const createFlipkartAdapter = () => createPageAdapter('flipkart_minutes', FLIPKART_ORIGIN, 'Flipkart Minutes', flipkartSearchPath, flipkartReadScript)
