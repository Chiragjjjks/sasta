import { describe, expect, it } from 'vitest'
import { catalogFor, mockOffers } from '@/core/adapters/mock'
import { PLATFORMS } from './platforms'
import { detectBrand, detectVariant, discountPercent, groupOffers, parseSizeGrams, unitPrice, variantFromQuery } from './normalize'
import type { Offer } from './types'

const loc = { pincode: '560010', label: 'Rajajinagar' }
const offer = (title: string, price: number, platform: Offer['platform'] = 'blinkit', inStock = true): Offer => ({
  platform, productId: title + platform, title, price, inStock, deepLink: '', fetchedAt: 0,
})

describe('parseSizeGrams', () => {
  it.each([
    ['Lays Magic Masala 48 g', 48],
    ['Lays Magic Masala 48gm', 48],
    ['Maggi Masala Noodles 8 x 70 g', 560],
    ['Atta 1.5kg', 1500],
    ['Pack of 3 (52 g each)', 156],
    ['No size here', undefined],
  ])('%s → %s', (t, g) => expect(parseSizeGrams(t)).toBe(g))
})

describe('brand and variant detection', () => {
  it('recognises brand spellings', () => {
    expect(detectBrand("Lay's Classic")).toBe("Lay's")
    expect(detectBrand('LAYS chips')).toBe("Lay's")
  })
  it('prefers the longest alias', () => {
    expect(detectVariant("Lay's American Style Cream & Onion 48 g", "Lay's")?.key).toBe('cream-onion')
    expect(detectVariant('Lays sour cream and onion', "Lay's")?.key).toBe('cream-onion')
    expect(detectVariant("Lay's India's Magic Masala", "Lay's")?.key).toBe('magic-masala')
    expect(detectVariant("Lay's Chilli Lemon Flavour Chips", "Lay's")?.key).toBe('chile-limon')
  })
  it('reads the variant from the query', () => {
    expect(variantFromQuery('lays cream onion')).toBe('cream-onion')
    expect(variantFromQuery('lays')).toBeUndefined()
  })
})

describe('groupOffers', () => {
  it('groups different spellings of the same pack into one card', () => {
    const groups = groupOffers([
      offer("Lay's India's Magic Masala Potato Chips 48 g", 18, 'blinkit'),
      offer('Lays Magic Masala Chips 48gm', 17, 'zepto'),
      offer("Lay's Indias Magic Masala 50 g", 19, 'bigbasket'),
      offer("Lay's India's Magic Masala 115 g", 45, 'blinkit'),
    ])
    expect(groups).toHaveLength(3)
    const small = groups.find((g) => g.sizeGrams === 48)!
    expect(small.offers).toHaveLength(2)
    expect(small.best.platform).toBe('zepto')
  })
  it('ranks in-stock offers ahead of cheaper out-of-stock ones', () => {
    const [g] = groupOffers([offer('Lays Classic Salted 48 g', 10, 'zepto', false), offer('Lays Classic Salted 48 g', 18)])
    expect(g.best.price).toBe(18)
  })
  it('keeps unmatched offers as their own card', () => {
    const groups = groupOffers([offer('Haldiram Bhujia 200 g', 50), offer('Lays Classic 48 g', 20)])
    expect(groups).toHaveLength(2)
  })
  it('turns the full mock "lays" search into exactly 10 clean groups (5 flavors × 2 sizes)', () => {
    const all = PLATFORMS.flatMap((p) => mockOffers(p.id, 'lays', loc))
    const groups = groupOffers(all)
    expect(catalogFor('lays')).toHaveLength(10)
    expect(groups).toHaveLength(10)
    expect(new Set(groups.map((g) => g.variantKey)).size).toBe(5)
  })
})

describe('mock adapter', () => {
  it('never prices above MRP', () => {
    for (const q of ['lays', 'maggi', 'amul butter'])
      for (const p of PLATFORMS) for (const o of mockOffers(p.id, q, loc)) expect(o.price).toBeLessThanOrEqual(o.mrp!)
  })
})

describe('unitPrice and discountPercent', () => {
  it('prices per 100 g, per 100 ml and per piece', () => {
    expect(unitPrice(58, '500 g')).toEqual({ value: 11.6, per: '100 g' })
    expect(unitPrice(134, '1 l')).toEqual({ value: 13.4, per: '100 ml' })
    expect(unitPrice(120, '1 kg')).toEqual({ value: 12, per: '100 g' })
    expect(unitPrice(60, '2 × 250 g')).toEqual({ value: 12, per: '100 g' })
    expect(unitPrice(72, '6 pcs')).toEqual({ value: 12, per: 'pc' })
  })
  it('falls back to grams and says nothing for unknown or variable packs', () => {
    expect(unitPrice(20, undefined, 50)).toEqual({ value: 40, per: '100 g' })
    expect(unitPrice(40, '1 pcs')).toBeUndefined()
    expect(unitPrice(99, '400-500 g')).toBeUndefined()
    expect(unitPrice(99)).toBeUndefined()
  })
  it('rounds the saving against MRP and skips none or a higher price', () => {
    expect(discountPercent({ price: 45, mrp: 58 })).toBe(22)
    expect(discountPercent({ price: 120, mrp: 145 })).toBe(17)
    expect(discountPercent({ price: 58, mrp: 58 })).toBeUndefined()
    expect(discountPercent({ price: 58 })).toBeUndefined()
  })
})
