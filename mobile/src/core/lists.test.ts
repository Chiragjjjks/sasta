import { describe, expect, it } from 'vitest'
import {
  chosenListOffer, createList, deleteList, estimateTotal, exportLists, importLists, isSaved, listItemFromGroup, listPlan, markPicked, moveItem,
  pinAllItems, pinItem, priceDrop, rankedOffers, renameList, sameAsLastTime, saveToList, setItemQty, shareText, singleAppTotals, sortItems, toCartItems,
} from './lists'
import type { Offer, ProductGroup } from './types'

const o = (platform: Offer['platform'], price: number, inStock = true): Offer => ({ platform, productId: platform + price, title: 't', price, inStock, deepLink: '', fetchedAt: 0 })
const group = (key: string, offers: Offer[], sizeGrams = 48): ProductGroup => ({ key, brand: "Lay's", variant: key, variantKey: key, sizeGrams, offers, best: offers[0] })

describe('lists', () => {
  const [l1, office] = createList([], 'Office snacks', '🏢', 1)
  const masala = listItemFromGroup(group('masala', [o('zepto', 16), o('blinkit', 18)]), 'lays', 10)
  const maggi = listItemFromGroup(group('maggi', [o('blinkit', 11)], 70), 'maggi', 10)
  let lists = saveToList(saveToList(l1, office.id, masala), office.id, maggi)

  it('creates, renames and deletes lists', () => {
    const [two, home] = createList(lists, '  ', '🏠', 2)
    expect(home.name).toBe('My list')
    expect(renameList(two, home.id, 'Home')[1].name).toBe('Home')
    expect(deleteList(two, home.id)).toHaveLength(1)
  })
  it('saves products once and knows where they are', () => {
    expect(saveToList(lists, office.id, masala)[0].items).toHaveLength(2)
    expect(isSaved(lists, 'masala')).toBe(true)
    expect(isSaved(lists, 'nope')).toBe(false)
  })
  it('turns picked items into cart items with list quantities', () => {
    lists = setItemQty(lists, office.id, 'maggi', 4)
    const cart = toCartItems(lists[0], ['maggi'])
    expect(cart).toHaveLength(1)
    expect(cart[0]).toMatchObject({ key: 'maggi', qty: 4, query: 'maggi' })
    expect(estimateTotal(lists[0].items)).toBe(16 + 11 * 4)
  })
  it('remembers the last pick for "Same as last time" and sorts by often bought', () => {
    const picked = markPicked(lists, office.id, ['maggi'], 100)
    expect(sameAsLastTime(picked[0])).toEqual(['maggi'])
    expect(sortItems(picked[0].items, 'often')[0].key).toBe('maggi')
    expect(sameAsLastTime(lists[0])).toEqual([])
  })
  it('detects price drops since saving', () => {
    expect(priceDrop(masala)).toBe(0)
    expect(priceDrop({ ...masala, lastOffers: [o('zepto', 13)] })).toBe(3)
  })
  it('moves and copies between lists', () => {
    const [withHome, home] = createList(lists, 'Home', '🏠', 3)
    const moved = moveItem(withHome, office.id, home.id, 'maggi')
    expect(moved.find((l) => l.id === office.id)!.items.map((i) => i.key)).toEqual(['masala'])
    expect(moved.find((l) => l.id === home.id)!.items.map((i) => i.key)).toEqual(['maggi'])
    const copied = moveItem(withHome, office.id, home.id, 'maggi', true)
    expect(copied.find((l) => l.id === office.id)!.items).toHaveLength(2)
  })
  it('shares as text and round-trips an export', () => {
    expect(shareText(lists[0])).toContain("🏢 Office snacks\n• Lay's masala 48 g × 1")
    expect(importLists([], exportLists(lists))).toEqual(lists)
    expect(() => importLists([], '{"foo":1}')).toThrow()
  })
  it('rejects malformed nested backups before they can corrupt existing lists', () => {
    for (const entries of [[null], [{ ...office, items: null }], [{ ...office, items: [{ ...masala, lastOffers: [null] }] }]]) {
      expect(() => importLists(lists, JSON.stringify({ app: 'sasta', kind: 'lists', lists: entries }))).toThrow('Your lists have not changed')
    }
    expect(lists[0].name).toBe('Office snacks')
    expect(lists[0].items).toHaveLength(2)
  })
  it('rejects duplicate list IDs in a backup', () => {
    expect(() => importLists(lists, exportLists([office, office]))).toThrow('duplicate list IDs')
  })
})

describe('list plan: which app each item comes from', () => {
  const eta = (offer: Offer, etaMinutes: number): Offer => ({ ...offer, etaMinutes })
  const [base, list] = createList([], 'Monthly', '🛒', 1)
  const lays = { ...listItemFromGroup(group('lays', [o('zepto', 19), o('blinkit', 20), eta(o('instamart', 20), 6), o('flipkart_minutes', 18, false), o('zepto', 25)]), 'lays', 10), qty: 5 }
  const milk = { ...listItemFromGroup(group('milk', [eta(o('blinkit', 29), 9), eta(o('instamart', 29), 6)]), 'milk', 10), qty: 2 }
  const bread = listItemFromGroup(group('bread', [o('zepto', 40, false)]), 'bread', 10)
  let lists = [lays, milk, bread].reduce((ls, i) => saveToList(ls, list.id, i), base)
  const items = () => lists[0].items

  it('ranks one offer per app, cheapest then fastest, and lists apps that are out of stock', () => {
    const r = rankedOffers(lays)
    expect(r.inStock.map((x) => [x.platform, x.price])).toEqual([['zepto', 19], ['instamart', 20], ['blinkit', 20]])
    expect(r.outOfStock).toEqual(['flipkart_minutes'])
    expect(rankedOffers(milk).inStock[0].platform).toBe('instamart')
  })
  it('groups the cheapest mix by app and keeps unavailable items apart', () => {
    const plan = listPlan(items())
    expect(plan.total).toBe(19 * 5 + 29 * 2)
    expect(plan.groups.map((g) => [g.platform, g.total, g.lines.length])).toEqual([['zepto', 95, 1], ['instamart', 58, 1]])
    expect(plan.groups[1].etaMinutes).toBe(6)
    expect(plan.missing.map((i) => i.key)).toEqual(['bread'])
    expect(plan).toMatchObject({ available: 2, count: 3, pinned: false })
  })
  it("uses the user's app for an item while it is in stock, and the cheapest otherwise", () => {
    lists = pinItem(lists, list.id, 'lays', 'blinkit')
    expect(chosenListOffer(items()[0])).toMatchObject({ platform: 'blinkit', price: 20 })
    expect(listPlan(items())).toMatchObject({ total: 100 + 58, pinned: true })
    lists = pinItem(lists, list.id, 'lays', 'flipkart_minutes')
    expect(chosenListOffer(items()[0])?.platform).toBe('zepto')
    lists = pinAllItems(lists, list.id, undefined)
    expect(listPlan(items()).pinned).toBe(false)
  })
  it('totals everything from one app, most items first, then cheapest', () => {
    expect(singleAppTotals(items())).toEqual([
      { platform: 'blinkit', covered: 2, total: 158 },
      { platform: 'instamart', covered: 2, total: 158 },
      { platform: 'zepto', covered: 1, total: 95 },
    ])
  })
  it('carries the chosen app into the cart and survives a backup', () => {
    lists = pinItem(lists, list.id, 'milk', 'blinkit')
    expect(toCartItems(lists[0], ['milk'])[0].pinned).toBe('blinkit')
    expect(importLists([], exportLists(lists))[0].items[1].pinned).toBe('blinkit')
    const bad = exportLists(lists).replace('"pinned": "blinkit"', '"pinned": "swiggy-genie"')
    expect(() => importLists([], bad)).toThrow()
  })
})
