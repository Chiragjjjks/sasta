import readerScripts from './readers.generated.json'
import type { Location } from '../types'
import { createPageAdapter, type PageSnapshot } from './page'

export const BIGBASKET_ORIGIN = 'https://www.bigbasket.com'
export const bigbasketSearchPath = (q: string) => `/ps/?q=${encodeURIComponent(q)}`

/**
 * BigBasket's own listing API, called from inside its page (verified 2026-10-28), then the displayed cards as a fallback.
 * The selected area lives in the `_bb_addressinfo` cookie: base64 "lat|lng|area|pincode|city|…". With no area chosen,
 * the site prices a default store, which is never used.
 */
export async function readBigbasketPage(query: string, pincode: string, exact = false, waitMs = 12000): Promise<PageSnapshot> {
  const started = Date.now()
  const end = started + waitMs
  const cookies: Record<string, string> = {}
  for (const part of document.cookie.split(';')) {
    const at = part.indexOf('=')
    if (at > 0) cookies[part.slice(0, at).trim()] = decodeURIComponent(part.slice(at + 1).trim())
  }
  let area: { lat: number; lng: number; pin: string } | undefined
  try {
    const fields = atob((cookies._bb_addressinfo || '').replace(/-/g, '+').replace(/_/g, '/')).split('|')
    if (Number.isFinite(+fields[0]) && Number.isFinite(+fields[1]) && fields[0] && fields[1]) area = { lat: +fields[0], lng: +fields[1], pin: fields[3] || cookies._bb_pin_code || '' }
  } catch { /* no area chosen */ }
  if (!area) return { kind: 'needs_location', message: 'Choose your delivery area in BigBasket (Account → Delivery area), then search again.' }
  const location = { lat: area.lat, lng: area.lng }
  // With exact coordinates Sasta checks the distance instead (page.ts); a postcode is all there is otherwise.
  if (!exact && area.pin && area.pin !== pincode) return { kind: 'needs_location', location, message: `Choose ${pincode} in BigBasket before comparing prices.` }
  if (cookies.xentrycontext && cookies.xentrycontext !== 'bbnow') return { kind: 'unavailable', location, message: 'BigBasket is set to scheduled delivery. Switch it to bb now (10 minutes) and search again.' }
  try {
    const response = await fetch(`/listing-svc/v2/products?type=ps&slug=${encodeURIComponent(query)}&page=1`, { credentials: 'include', headers: { accept: 'application/json' } })
    if (response.status === 403 || response.status === 429) return { kind: 'blocked', message: `BigBasket returned HTTP ${response.status}. Open Delivery area and try again.` }
    if (response.ok) {
      const json = await response.json()
      const list = json?.tabs?.[0]?.product_info?.products
      if (Array.isArray(list)) {
        const products: NonNullable<PageSnapshot['products']> = []
        const add = (p: any) => { // provider's listing schema
          const price = Number(p?.pricing?.discount?.prim_price?.sp)
          const mrp = Number(p?.pricing?.discount?.mrp)
          const url = new URL(String(p?.absolute_url || ''), 'https://www.bigbasket.com')
          if (!p?.id || !p?.desc || !Number.isFinite(price) || price <= 0 || url.hostname !== 'www.bigbasket.com') return
          const brand = typeof p.brand?.name === 'string' ? p.brand.name : undefined
          const pack = [p.w, p.pack_desc].filter((x: unknown) => typeof x === 'string' && x).join(' - ')
          const a = p.availability ?? {}
          products.push({ id: String(p.id), title: brand && !String(p.desc).startsWith(brand) ? `${brand} ${p.desc}` : String(p.desc), brand, packLabel: pack || undefined,
            price, mrp: Number.isFinite(mrp) && mrp >= price ? mrp : undefined, url: url.href, imageUrl: p.images?.[0]?.m,
            inStock: a.avail_status === '001' && a.not_for_sale !== true && !/notify/i.test(String(a.button || '')) })
        }
        for (const p of list) { add(p); for (const child of Array.isArray(p?.children) ? p.children : []) add(child) }
        return { kind: 'products', location, products }
      }
    }
  } catch { /* fall back to the displayed cards */ }
  while (true) {
    const text = document.body?.innerText ?? ''
    if (/access denied|captcha|verify you are human|request blocked/i.test(text)) return { kind: 'blocked', message: 'BigBasket needs verification. Open Delivery area and try again.' }
    const chooseArea = [...document.querySelectorAll('button')].some(b => /select location/i.test(b.textContent ?? ''))
    if (chooseArea && Date.now() >= Math.min(end, started + 1500)) return { kind: 'needs_location', message: 'Choose your delivery area in BigBasket, then search again.' }
    const selectedPin = document.querySelector('header')?.textContent?.match(/\b\d{6}\b/)?.[0]
    if (selectedPin && selectedPin !== pincode) return { kind: 'needs_location', message: `Choose ${pincode} in BigBasket before comparing prices.` }
    const products: NonNullable<PageSnapshot['products']> = []
    for (const heading of chooseArea ? [] : document.querySelectorAll('h3')) {
      const link = heading.querySelector<HTMLAnchorElement>('a[href*="/pd/"]')
      if (!link) continue
      let card = heading.parentElement
      // The compact and desktop cards use different wrappers. Stop before another product.
      while (card && !/₹\s*[\d,]+/.test(card.innerText)) {
        const parent = card.parentElement
        if (!parent || parent.querySelectorAll('h3').length !== 1) { card = null; break }
        card = parent
      }
      if (!card || card.querySelectorAll('h3').length !== 1) continue
      const cardText = card.innerText
      const eta = cardText.match(/\b(\d+)\s*mins?\b/i)
      if (!eta || +eta[1] > 60 || /tomorrow|\d+\s*(?:hours?|days?)/i.test(cardText)) continue
      const title = link.textContent?.trim()
      const url = new URL(link.getAttribute('href')!, 'https://www.bigbasket.com')
      const id = url.pathname.match(/^\/pd\/(\d+)\//)?.[1]
      const prices = [...cardText.matchAll(/₹\s*([\d,]+(?:\.\d+)?)/g)].map(m => +m[1].replace(/,/g, ''))
      if (!title || !id || url.hostname !== 'www.bigbasket.com' || !prices.length) continue
      const packLabel = heading.textContent?.replace(title, '').trim()
      products.push({ id, title, packLabel, price: prices[0], mrp: prices[1], url: url.href,
        inStock: !/out of stock|notify me|sold out/i.test(cardText) && [...card.querySelectorAll('button')].some(b => /^add$/i.test(b.textContent?.trim() ?? '') && !b.disabled),
        imageUrl: card.querySelector('img')?.src, etaMinutes: +eta[1] })
    }
    if (products.length) return { kind: 'products', location, products }
    if (!chooseArea && /no results|no products found/i.test(text)) return { kind: 'products', location, products: [] }
    if (Date.now() >= end) return { kind: 'unavailable', message: `BigBasket did not expose quick-delivery prices for “${query}”. Choose a delivery area with minute delivery and try again.` }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
}

export const bigbasketReadScript = (query: string, loc: Location) =>
  `return await (${readerScripts.readBigbasketPage})(${JSON.stringify(query)},${JSON.stringify(loc.pincode)},${Number.isFinite(loc.lat) && Number.isFinite(loc.lng)});`
export const createBigbasketAdapter = () => createPageAdapter('bigbasket', BIGBASKET_ORIGIN, 'BigBasket', bigbasketSearchPath, bigbasketReadScript)
