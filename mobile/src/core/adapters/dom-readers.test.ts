// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readBigbasketPage } from './bigbasket'
import { readZeptoPage } from './zepto'

// jsdom has no layout engine; these fixtures contain only visible text.
Object.defineProperty(HTMLElement.prototype, 'innerText', { configurable: true, get() { return this.textContent ?? '' } })
afterEach(() => { document.body.innerHTML = ''; localStorage.clear(); vi.useRealTimers(); vi.unstubAllGlobals(); document.cookie = '_bb_addressinfo=; expires=Thu, 01 Jan 1970 00:00:00 GMT'; document.cookie = 'xentrycontext=; expires=Thu, 01 Jan 1970 00:00:00 GMT' })
// BigBasket's area cookie as the site writes it after "Select Location" (2026-10-28): base64 "lat|lng|area|pincode|city|…".
const chooseArea = (pin = '560010') => { document.cookie = `_bb_addressinfo=${btoa(`12.9981732|77.5530446|Rajajinagar|${pin}|Bengaluru|1|false|true|true|Bigbasketeer`)}`; document.cookie = 'xentrycontext=bbnow' }
const listing = JSON.parse(readFileSync('fixtures/bigbasket/listing.json', 'utf8'))
const card = (eta = '10 MINS') => `<article><span>${eta} </span><h3><a href="/pd/40149832/nandini-milk/">Nandini Milk</a><button>500 ml</button></h3><div>₹24.00 ₹27.00</div><button>Add</button></article>`

describe('BigBasket listing API inside the page', () => {
  it('reads every pack, its price, MRP and stock, and reports the selected area', async () => {
    chooseArea()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(listing), { status: 200 })))
    const result = await readBigbasketPage('amul milk', '560010', true, 0)
    expect(result).toMatchObject({ kind: 'products', location: { lat: 12.9981732, lng: 77.5530446 } })
    expect(result.products).toEqual([
      expect.objectContaining({ id: '306926', title: 'Amul Taaza Homogenised Toned Milk', packLabel: '1 L - Tetra Pak', price: 75, mrp: 77, inStock: true, url: 'https://www.bigbasket.com/pd/306926/amul-homogenised-toned-milk-1-l-carton/' }),
      expect.objectContaining({ id: '70001832', packLabel: '200 ml - Tetra Pak', price: 17 }),
      expect.objectContaining({ id: '40090893', title: 'Amul Gold Full Cream Milk', price: 34, inStock: true }),
      expect.objectContaining({ id: '40190712', price: 25, inStock: false }),
    ])
  })
  it('never prices the default store before an area is chosen', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
    expect((await readBigbasketPage('milk', '560010', true, 0)).kind).toBe('needs_location')
    expect(fetch).not.toHaveBeenCalled()
  })
  it('asks for the same postcode when Sasta has no exact location, and refuses scheduled delivery', async () => {
    chooseArea('110001')
    expect((await readBigbasketPage('milk', '560010', false, 0)).kind).toBe('needs_location')
    chooseArea(); document.cookie = 'xentrycontext=scheduled'
    expect((await readBigbasketPage('milk', '560010', true, 0)).kind).toBe('unavailable')
  })
  it('reports a blocked API rather than an empty search', async () => {
    chooseArea()
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 403 })))
    expect((await readBigbasketPage('milk', '560010', true, 0)).kind).toBe('blocked')
  })
})

describe('BigBasket displayed quick-delivery cards (fallback when the API fails)', () => {
  it('extracts pack, price and stock from the observed heading/card structure', async () => {
    chooseArea()
    document.body.innerHTML = `<header><button>Rajajinagar 560010</button></header>${card()}`
    expect(await readBigbasketPage('milk', '560010', true, 0)).toMatchObject({ kind: 'products', products: [{ id: '40149832', price: 24, mrp: 27, packLabel: '500 ml', inStock: true, etaMinutes: 10 }] })
  })
  it('rejects another displayed postcode and excludes scheduled delivery', async () => {
    chooseArea()
    document.body.innerHTML = `<header>Delhi 110001</header>${card()}`
    expect((await readBigbasketPage('milk', '560010', true, 0)).kind).toBe('needs_location')
    document.body.innerHTML = card('Tomorrow')
    expect((await readBigbasketPage('milk', '560010', true, 0)).kind).toBe('unavailable')
  })
  it('reports blocked and empty pages separately', async () => {
    chooseArea()
    document.body.innerHTML = 'Access Denied'
    expect((await readBigbasketPage('milk', '560010', true, 0)).kind).toBe('blocked')
    document.body.innerHTML = 'No products found'
    expect(await readBigbasketPage('milk', '560010', true, 0)).toMatchObject({ kind: 'products', products: [] })
  })
})
describe('Zepto hydration and price markup', () => {
  it('reads a price on the slot itself, without requiring child spans', async () => {
    localStorage.setItem('user-position', JSON.stringify({ state: { userPosition: { latitude: 12.99, longitude: 77.55 } } }))
    document.body.innerHTML = `<a data-testid="product-card" href="/pn/milk/pvid/one"><span data-slot-id="ProductName">Milk</span><span data-slot-id="PackSize">500 ml</span><span data-slot-id="EdlpPrice">₹24</span></a>`
    expect(await readZeptoPage('milk', 0)).toMatchObject({ kind: 'products', products: [{ price: 24, title: 'Milk' }] })
  })
  it('does not mistake incomplete cards for a successful empty search', async () => {
    localStorage.setItem('user-position', JSON.stringify({ state: { userPosition: { latitude: 12.99, longitude: 77.55 } } }))
    document.body.innerHTML = '<a data-testid="product-card" href="/pn/milk/pvid/one">Loading</a>'
    expect((await readZeptoPage('milk', 0)).kind).toBe('unavailable')
  })
})
