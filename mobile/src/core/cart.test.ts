import { describe, expect, it } from 'vitest'
import { addItem, addItems, cheapestCart, chosenOffer, extraOverCheapest, pin, pinAll, setQty, singleAppOptions, summarize, type CartItem } from './cart'
import type { Offer, Platform } from './types'

const o = (platform: Platform, price: number, inStock = true, mrp = 20): Offer => ({
  platform, productId: platform + price, title: 't', price, mrp, inStock, deepLink: '', fetchedAt: 0,
})
const item = (key: string, offers: Offer[], qty = 1): CartItem => ({
  key, brand: 'B', variant: key, variantKey: key, query: key, qty, offers, updatedAt: 0,
})

const chips = item('chips', [o('zepto', 15), o('blinkit', 17), o('instamart', 12, false)])
const noodles = item('noodles', [o('blinkit', 13, true, 15), o('zepto', 14, true, 15)], 2)
const milk = item('milk', [o('blinkit', 30, true, 32)])

describe('cart', () => {
  it('picks the cheapest in-stock offer per item by default', () => {
    expect(chosenOffer(chips)?.platform).toBe('zepto')
  })
  it('totals quantity × chosen price across apps', () => {
    const s = summarize([chips, noodles])
    expect(s.total).toBe(15 + 13 * 2)
    expect(s.itemCount).toBe(3)
    expect(s.platforms.sort()).toEqual(['blinkit', 'zepto'])
    expect(s.savingsVsMrp).toBe(20 + 30 - s.total)
  })
  it('respects a pin, and falls back to cheapest when the pinned app is out of stock', () => {
    expect(chosenOffer(pin([chips], 'chips', 'blinkit')[0])?.platform).toBe('blinkit')
    expect(chosenOffer(pin([chips], 'chips', 'instamart')[0])?.platform).toBe('zepto')
  })
  it('ranks single-app baskets by coverage then total', () => {
    const opts = singleAppOptions([chips, noodles, milk])
    expect(opts[0]).toMatchObject({ platform: 'blinkit', covered: 3, total: 17 + 26 + 30 })
    expect(opts[1]).toMatchObject({ platform: 'zepto', covered: 2 })
  })
  it('pinAll moves every item to one app', () => {
    const s = summarize(pinAll([chips, noodles], 'zepto'))
    expect(s.platforms).toEqual(['zepto'])
    expect(s.total).toBe(15 + 28)
  })
  it('adding the same pack bumps quantity, qty 0 removes it', () => {
    let c = addItem([], chips)
    c = addItem(c, chips)
    expect(c[0].qty).toBe(2)
    expect(setQty(c, 'chips', 0)).toEqual([])
  })
  it('reports items no app has in stock', () => {
    const gone = item('gone', [o('zepto', 10, false)])
    expect(summarize([gone]).unavailable).toHaveLength(1)
  })
})

describe('cheapest cart', () => {
  it('is the default selection and costs nothing extra', () => {
    expect(extraOverCheapest([chips, noodles])).toBe(0)
  })
  it('reports the extra cost of a pinned selection and resets with cheapestCart', () => {
    const pinned = pinAll([chips, noodles], 'blinkit')
    expect(extraOverCheapest(pinned)).toBe(17 + 26 - (15 + 26))
    expect(extraOverCheapest(cheapestCart(pinned))).toBe(0)
  })
})

describe('addItems', () => {
  it('adds list quantities on top of what is already in the cart', () => {
    const out = addItems([{ ...chips, qty: 1 }], [{ ...chips, qty: 2 }, { ...milk, qty: 3 }])
    expect(out.map((i) => [i.key, i.qty])).toEqual([['chips', 3], ['milk', 3]])
  })
})
