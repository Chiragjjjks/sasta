import { describe, expect, it } from 'vitest'
import {
  createList, deleteList, estimateTotal, exportLists, importLists, isSaved, listItemFromGroup, markPicked, moveItem,
  priceDrop, renameList, sameAsLastTime, saveToList, setItemQty, shareText, sortItems, toCartItems,
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
})
