// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readBigbasketPage } from './bigbasket'
import { readZeptoPage } from './zepto'

// jsdom has no layout engine; these fixtures contain only visible text.
Object.defineProperty(HTMLElement.prototype, 'innerText', { configurable: true, get() { return this.textContent ?? '' } })
afterEach(() => { document.body.innerHTML = ''; localStorage.clear(); vi.useRealTimers() })
const card = (eta = '10 MINS') => `<article><span>${eta} </span><h3><a href="/pd/40149832/nandini-milk/">Nandini Milk</a><button>500 ml</button></h3><div>₹24.00 ₹27.00</div><button>Add</button></article>`

describe('BigBasket displayed quick-delivery cards', () => {
  it('extracts pack, price and stock from the observed heading/card structure', async () => {
    document.body.innerHTML = `<header><button>Rajajinagar 560010</button></header>${card()}`
    expect(await readBigbasketPage('milk', '560010', 0)).toMatchObject({ kind: 'products', products: [{ id: '40149832', price: 24, mrp: 27, packLabel: '500 ml', inStock: true, etaMinutes: 10 }] })
  })
  it('does not use the default catalogue before location selection', async () => {
    document.body.innerHTML = `<button>Select Location</button>${card()}`
    expect((await readBigbasketPage('milk', '560010', 0)).kind).toBe('needs_location')
  })
  it('rejects another postcode and excludes scheduled delivery', async () => {
    document.body.innerHTML = `<header>Delhi 110001</header>${card()}`
    expect((await readBigbasketPage('milk', '560010', 0)).kind).toBe('needs_location')
    document.body.innerHTML = card('Tomorrow')
    expect((await readBigbasketPage('milk', '560010', 0)).kind).toBe('unavailable')
  })
  it('reports blocked and empty pages separately', async () => {
    document.body.innerHTML = 'Access Denied'
    expect((await readBigbasketPage('milk', '560010', 0)).kind).toBe('blocked')
    document.body.innerHTML = 'No products found'
    expect(await readBigbasketPage('milk', '560010', 0)).toEqual({ kind: 'products', products: [] })
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
