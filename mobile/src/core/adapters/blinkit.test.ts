import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { groupOffers } from '@/core/normalize'
import { parseBlinkitSearch, searchScript } from './blinkit'

const fixture = JSON.parse(readFileSync(new URL('../../../fixtures/blinkit/lays.json', import.meta.url), 'utf8'))

describe('Blinkit adapter', () => {
  const offers = parseBlinkitSearch(fixture, 0)

  it('parses every product from the real search response', () => {
    expect(offers).toHaveLength(19)
    const masala80 = offers.find((o) => o.productId === '432779')!
    expect(masala80).toMatchObject({ platform: 'blinkit', price: 39, mrp: 48, inStock: true, brand: "Lay's" })
    expect(masala80.title).toBe("Lay's India's Magic Masala Potato Chips 80 g")
  })

  it('groups real Blinkit titles into clean flavor and size cards', () => {
    const groups = groupOffers(offers)
    const lays = groups.filter((g) => g.brand === "Lay's")
    const keys = new Set(lays.map((g) => g.variantKey))
    for (const k of ['magic-masala', 'cream-onion', 'classic-salted', 'chile-limon', 'hot-sweet-chilli', 'sizzling-hot']) expect(keys).toContain(k)
    // West Indies Hot n Sweet Chilli must not be mistaken for Chile Limón.
    expect(lays.find((g) => g.variantKey === 'chile-limon')!.offers.every((o) => /limon/i.test(o.title))).toBe(true)
    // Multipacks are separate packs: 80 g, 2 x 80 g (160 g), 3 x 80 g (240 g).
    const masalaSizes = lays.filter((g) => g.variantKey === 'magic-masala').map((g) => g.sizeGrams).sort((a, b) => a! - b!)
    expect(masalaSizes).toEqual([58, 75, 80, 160, 240])
  })

  it('builds a search script with the query safely quoted', () => {
    const s = searchScript('lays "cream" onion', 12.99, 77.55)
    expect(s).toContain(JSON.stringify('lays "cream" onion'))
    expect(s).toContain("'lat': \"12.99\"")
  })
})

describe('Blinkit cart hand-off', () => {
  it('writes items into blinkit.com storage without dropping what is already there', async () => {
    const { handoffScript } = await import('./blinkit')
    const store: Record<string, string> = { cart: JSON.stringify({ count: 1, items: { '1': { product: { price: 10 }, quantity: 1 } }, version: 1 }) }
    const localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v } }
    const script = handoffScript([{ cartItem: { product_id: 432779, price: 39, mrp: 48, unit: '80 g', group_id: 2593130, display_name: 'Magic Masala' }, qty: 2 }], { pincode: '560010', label: 'Rajajinagar', lat: 12.99, lng: 77.55 })
    const result = await new Function('localStorage', `return (async () => {${script}})()`)(localStorage)
    expect(result).toEqual({ count: 3, total: 88 })
    expect(Object.keys(JSON.parse(store.cart).items)).toEqual(['1', '432779'])
    expect(JSON.parse(store.location).coords).toMatchObject({ lat: 12.99, lon: 77.55, locality: 'Rajajinagar', isDefault: false })
  })
})

describe('Blinkit sign-in helpers', () => {
  const run = (script: string, store: Record<string, string>) =>
    new Function('localStorage', `return (async () => {${script}})()`)({ getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v } })

  it('sets the delivery location before login', async () => {
    const { locationScript } = await import('./blinkit')
    const store: Record<string, string> = { location: JSON.stringify({ coords: { isDefault: true, lat: 28.4, lon: 77.0, locality: 'Gurugram', id: 1849 } }) }
    await run(locationScript({ pincode: '560010', label: 'Rajajinagar', lat: 12.99, lng: 77.55 }), store)
    expect(JSON.parse(store.location).coords).toMatchObject({ isDefault: false, lat: 12.99, lon: 77.55, locality: 'Rajajinagar', id: 1849 })
  })
  it('reports who is signed in with only a masked number', async () => {
    const { WHO_AM_I_SCRIPT } = await import('./blinkit')
    expect(await run(WHO_AM_I_SCRIPT, { auth: JSON.stringify({ accessToken: 'v2::x', phoneNumber: '9876543210' }) })).toEqual({ signedIn: true, phone: '•••• 3210' })
    expect(await run(WHO_AM_I_SCRIPT, {})).toEqual({ signedIn: false, phone: '' })
  })
})
