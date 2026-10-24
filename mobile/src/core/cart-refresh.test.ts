import { describe, expect, it } from 'vitest'
import { mergeRefreshedCart, refreshCart, type CartItem } from './cart'
import type { Adapter, Offer } from './types'

const offer: Offer = { platform: 'blinkit', productId: '1', title: 'Test snack 100 g', price: 20, inStock: true, deepLink: 'https://blinkit.com', fetchedAt: 1 }
const item: CartItem = { key: 'test', brand: 'Test', variant: 'Snack', variantKey: 'raw:test', query: 'test', qty: 1, offers: [offer], updatedAt: 1 }
const location = { label: 'Test', pincode: '560010', lat: 13, lng: 77 }

describe('refreshing cart prices', () => {
  it('removes a stale offer when a successful search no longer finds the product', async () => {
    const adapter: Adapter = { platform: 'blinkit', setLocation: async () => {}, search: async () => [] }
    const [fresh] = await refreshCart([item], [adapter], location, new AbortController().signal)
    expect(fresh.offers).toEqual([])
    expect(fresh.updatedAt).toBeGreaterThan(item.updatedAt)
  })

  it('keeps the original timestamp and prices when offline', async () => {
    const adapter: Adapter = { platform: 'blinkit', setLocation: async () => {}, search: async () => { throw new Error('offline') } }
    expect(await refreshCart([item], [adapter], location, new AbortController().signal)).toEqual([item])
  })

  it('preserves new quantities, pins, and removed items while updating prices', () => {
    const current = [{ ...item, qty: 5, pinned: 'zepto' as const }]
    const fresh = [{ ...item, updatedAt: 2, offers: [{ ...offer, price: 18 }] }, { ...item, key: 'removed' }]
    expect(mergeRefreshedCart(current, fresh)).toEqual([{ ...current[0], updatedAt: 2, offers: fresh[0].offers }])
  })
})
