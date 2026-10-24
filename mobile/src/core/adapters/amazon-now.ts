import type { Location } from '../types'
import { createPageAdapter, type PageSnapshot } from './page'

export const AMAZON_ORIGIN = 'https://www.amazon.in'

/** Discover the account's Now storefront. An Amazon/Fresh login alone proves no Now access. */
export async function readAmazonNowPage(query: string, pincode: string): Promise<PageSnapshot> {
  const unavailable = (message = 'Amazon Now is not exposed in this web session. Regular Amazon and Fresh listings were excluded.'): PageSnapshot => ({ kind: 'unavailable', message })
  const text = document.body?.innerText ?? ''
  if (/enter the characters you see|robot check|captcha/i.test(text)) return { kind: 'blocked', message: 'Amazon needs verification on its own page.' }
  const selectedPin = (document.querySelector('#glow-ingress-line2')?.textContent ?? '').match(/\b\d{6}\b/)?.[0]
  if (selectedPin && selectedPin !== pincode) return { kind: 'needs_location', message: `Choose ${pincode} in Amazon Now before comparing prices.` }
  const entry = [...document.querySelectorAll<HTMLAnchorElement>('a[href]')].find((a) => {
    const label = `${a.getAttribute('aria-label') || ''} ${a.textContent || ''} ${a.querySelector('img')?.alt || ''}`.trim()
    const url = new URL(a.href, 'https://www.amazon.in')
    return url.hostname === 'www.amazon.in' && (/amazon\s*now/i.test(label) || /^now$/i.test(label))
      && /\/alm\/|\/fmc\/|\/now(?:\/|\?|$)/.test(url.href) && url.searchParams.get('almBrandId') !== 'ctnow'
  })
  if (!entry) return unavailable()
  const homeResponse = await fetch(entry.href, { credentials: 'include' })
  if (homeResponse.status === 403 || homeResponse.status === 429) return { kind: 'blocked', message: `Amazon Now returned HTTP ${homeResponse.status}.` }
  if (!homeResponse.ok) return unavailable(`Amazon Now returned HTTP ${homeResponse.status}.`)
  if (/\/ap\/signin/.test(homeResponse.url)) return { kind: 'needs_login' }
  const home = new DOMParser().parseFromString(await homeResponse.text(), 'text/html')
  const storeUrl = new URL(homeResponse.url)
  const brand = storeUrl.searchParams.get('almBrandId')
  const form = home.querySelector<HTMLFormElement>('form[name="site-search"],form[role="search"],#nav-search-bar-form')
  const alias = home.querySelector<HTMLSelectElement>('#searchDropdownBox')?.value ?? ''
  if (brand === 'ctnow' || /fresh|grocery/i.test(alias)) return unavailable('Amazon returned Fresh rather than Now. Only quick delivery is enabled.')
  const search = new URL(form?.getAttribute('action') || '/s', 'https://www.amazon.in')
  if (search.hostname !== 'www.amazon.in') return unavailable()
  for (const input of form?.querySelectorAll<HTMLInputElement>('input[type="hidden"]') ?? []) {
    if (['i', 'almBrandId', 'almStoreId', 'node'].includes(input.name)) search.searchParams.set(input.name, input.value)
  }
  if (brand) search.searchParams.set('almBrandId', brand)
  if (/now/i.test(alias)) search.searchParams.set('i', alias.replace(/^search-alias=/, ''))
  if (!brand && !/now/i.test(search.searchParams.get('i') ?? '')) return unavailable('Amazon Now did not expose a store-specific search. Regular listings were excluded.')
  search.searchParams.set('k', query)
  const response = await fetch(search.href, { credentials: 'include' })
  if (response.status === 403 || response.status === 429) return { kind: 'blocked', message: `Amazon Now returned HTTP ${response.status}.` }
  if (!response.ok) return unavailable(`Amazon Now returned HTTP ${response.status}.`)
  const doc = new DOMParser().parseFromString(await response.text(), 'text/html')
  if (doc.querySelector('form[name="signIn"]')) return { kind: 'needs_login' }
  const header = `${doc.querySelector('#nav-subnav')?.textContent || ''} ${doc.querySelector('h1')?.textContent || ''} ${[...doc.querySelectorAll<HTMLImageElement>('header img,#nav-logo img')].map(i=>i.alt).join(' ')}`
  if (!/amazon\s*now|^\s*now\s*$/i.test(header)) return unavailable('Amazon returned a search without a verified Now store. No marketplace prices were included.')
  const products: NonNullable<PageSnapshot['products']> = []
  for (const card of doc.querySelectorAll<HTMLElement>('[data-component-type="s-search-result"][data-asin]')) {
    const title = card.querySelector('h2')?.textContent?.trim() || card.querySelector('img')?.alt
    const price = Number(card.querySelector('.a-price:not(.a-text-price) .a-offscreen')?.textContent?.replace(/[^\d.]/g, ''))
    const mrp = Number(card.querySelector('.a-price.a-text-price .a-offscreen')?.textContent?.replace(/[^\d.]/g, ''))
    const cardText = card.textContent || ''
    if (!title || !Number.isFinite(price) || price <= 0 || /tomorrow|next.day|\b(?:mon|tues|wednes|thurs|fri|satur|sun)day\b|\b\d+\s*(?:hours?|days?)\b/i.test(cardText)) continue
    const id = card.dataset.asin!
    const url = new URL(`/dp/${id}`, 'https://www.amazon.in')
    if (brand) url.searchParams.set('almBrandId', brand)
    const eta = cardText.match(/\b(\d+)\s*(?:mins?|minutes?)\b/i)
    products.push({ id, title, price, mrp, url: url.href, imageUrl: card.querySelector('img')?.src,
      inStock: !/currently unavailable|out of stock/i.test(cardText), etaMinutes: eta ? +eta[1] : undefined })
  }
  return { kind: 'products', products }
}

export const amazonNowReadScript = (query: string, loc: Location) => `return await (${readAmazonNowPage.toString()})(${JSON.stringify(query)},${JSON.stringify(loc.pincode)});`
export const createAmazonNowAdapter = () => createPageAdapter('amazon_now', AMAZON_ORIGIN, 'Amazon Now', () => '/', amazonNowReadScript)
