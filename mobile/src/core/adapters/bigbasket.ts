import readerScripts from './readers.generated.json'
import type { Location } from '../types'
import { createPageAdapter, type PageSnapshot } from './page'

export const BIGBASKET_ORIGIN = 'https://www.bigbasket.com'
export const bigbasketSearchPath = (q: string) => `/ps/?q=${encodeURIComponent(q)}`

/** Read displayed quick-delivery cards, never the site's default unlocated catalogue. */
export async function readBigbasketPage(query: string, pincode: string, waitMs = 12000): Promise<PageSnapshot> {
  const started = Date.now()
  const end = started + waitMs
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
    if (products.length) return { kind: 'products', products }
    if (!chooseArea && /no results|no products found/i.test(text)) return { kind: 'products', products: [] }
    if (Date.now() >= end) return { kind: 'unavailable', message: `BigBasket did not expose quick-delivery prices for “${query}”. Choose a delivery area with minute delivery and try again.` }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
}

export const bigbasketReadScript = (query: string, loc: Location) => `return await (${readerScripts.readBigbasketPage})(${JSON.stringify(query)},${JSON.stringify(loc.pincode)});`
export const createBigbasketAdapter = () => createPageAdapter('bigbasket', BIGBASKET_ORIGIN, 'BigBasket', bigbasketSearchPath, bigbasketReadScript)
