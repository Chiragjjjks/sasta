import type { Location } from '../types'
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
      return { kind: 'products', location, products: cards.slice(0,80).flatMap((card) => {
        const title = card.querySelector('[data-slot-id="ProductName"]')?.textContent?.trim() || card.querySelector('img')?.alt || ''
        const packLabel = card.querySelector('[data-slot-id="PackSize"]')?.textContent?.trim()
        const prices = [...(card.querySelector('[data-slot-id="EdlpPrice"]') ?? card.querySelector('[data-slot-id$="Price"]') ?? card).querySelectorAll('span')]
          .map((e) => e.textContent?.trim() ?? '').filter((s) => /^₹\s*[\d,]+(?:\.\d+)?$/.test(s))
          .map((s) => +s.replace(/[^\d.]/g, ''))
        const id = card.pathname.split('/pvid/')[1]?.split('/')[0]
        if (!id || !title || !prices.length) return []
        return [{ id, title, packLabel, price: prices[0], mrp: prices[1],
          inStock: card.querySelector('[data-is-out-of-stock]')?.getAttribute('data-is-out-of-stock') !== 'true' && !/out of stock|notify me|sold out/i.test(card.innerText),
          imageUrl: card.querySelector('img')?.src, url: new URL(card.getAttribute('href')!, locationOrigin()).href }]
      }) }
    }
    if (/select location|your location/i.test(text) && !location && Date.now() > end - waitMs + 1500) return { kind: 'needs_location', message: 'Choose a delivery area in Zepto, then search again.' }
    if (location && /no (?:products|results)|couldn.t find|no matches/i.test(text)) return { kind: 'products', products: [], location }
    if (Date.now() >= end) return { kind: location ? 'unavailable' : 'needs_location', message: location ? `Zepto did not finish searching for “${query}”. Try again.` : 'Choose a delivery area in Zepto, then search again.' }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  function locationOrigin() { return 'https://www.zepto.com' }
}

export const zeptoReadScript = (query: string, _loc?: Location) => `return await (${readZeptoPage.toString()})(${JSON.stringify(query)});`
export const createZeptoAdapter = () => createPageAdapter('zepto', ZEPTO_ORIGIN, 'Zepto', zeptoSearchPath, zeptoReadScript)
