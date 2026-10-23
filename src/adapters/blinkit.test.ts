import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { groupOffers } from '@/lib/normalize'
import { parseBlinkitSearch, searchScript } from './blinkit'

const fixture = JSON.parse(readFileSync(new URL('../../fixtures/blinkit/lays.json', import.meta.url), 'utf8'))

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
