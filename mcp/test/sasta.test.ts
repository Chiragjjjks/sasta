import { beforeEach, describe, expect, it } from 'vitest'
import { mockAdapters } from '@/core/adapters/mock'
import { mockFoodSources } from '@/core/food/adapters/mock'
import { clearSearchCache } from '@/core/search'
import { DEFAULT_LOCATION } from '@/core/storage'
import { NeedsLoginError, type Adapter } from '@/core/types'
import { Sasta } from '../src/sasta'

const blocked: Adapter = { platform: 'instamart', async setLocation() {}, async search() { throw new NeedsLoginError('instamart') } }
const make = () => new Sasta({ grocery: [...mockAdapters.filter((a) => a.platform !== 'instamart'), blocked], food: mockFoodSources.filter((s) => s.platform === 'zomato' || s.platform === 'swiggy_food'), pauseMs: 0, geocode: async () => ({ lat: 12.97, lng: 77.59, label: 'MG Road' }) })

beforeEach(() => clearSearchCache())

describe('location', () => {
  it('defaults to Rajajinagar and validates pincodes', async () => {
    const s = make()
    expect(await s.location()).toEqual(DEFAULT_LOCATION)
    await expect(s.setLocation({ pincode: '5600' })).rejects.toThrow('6 digits')
    expect(await s.setLocation({ pincode: '560001' })).toEqual({ pincode: '560001', lat: 12.97, lng: 77.59, label: 'MG Road' })
    expect(await s.setLocation({ pincode: '560010', lat: 12.9915, lng: 77.5544, label: 'Rajajinagar' })).toEqual(DEFAULT_LOCATION)
    expect(await s.location()).toEqual(DEFAULT_LOCATION)
  })
})

describe('catalog.search', () => {
  it('groups packs across apps, cheapest in stock first, with a state per app', async () => {
    const r = await make().searchProducts('lays magic masala')
    expect(r.action).toBe('catalog.search')
    expect(r.results.length).toBeGreaterThan(0)
    expect(r.cheapest?.inStock).toBe(true)
    const first = r.results[0]
    expect(first.perApp.map((o) => o.price)).toEqual([...first.perApp.map((o) => o.price)].sort((a, b) => a - b))
    expect(r.platforms.find((p) => p.platform === 'instamart')).toMatchObject({ state: 'needs_login', strategy: 'mcp', error: expect.stringContaining('connect_app') })
    expect(r.platforms.find((p) => p.platform === 'blinkit')).toMatchObject({ state: 'done', strategy: 'api-in-page' })
  })
  it('limits to the apps asked for', async () => {
    const r = await make().searchProducts('maggi', { platforms: ['blinkit'] })
    expect(r.platforms.map((p) => p.platform)).toEqual(['blinkit'])
  })
})

describe('price.check', () => {
  it('prices each product and adds up the cheapest plan', async () => {
    const r = await make().priceCheck(['maggi', 'lays', ' maggi '])
    expect(r.items.map((i) => i.query)).toEqual(['maggi', 'lays'])
    const sum = r.items.reduce((t, i) => t + (i.match?.cheapest.price ?? 0), 0)
    expect(r.plan.cheapestTotal).toBe(sum)
    expect(r.plan.byApp.reduce((n, b) => n + b.items, 0)).toBe(r.items.filter((i) => i.match).length)
  })
  it('refuses more than five products instead of dropping some', async () => {
    await expect(make().priceCheck(['a', 'b', 'c', 'd', 'e', 'f'])).rejects.toThrow('Up to 5')
  })
})

describe('food', () => {
  it('matches dishes across apps and calls ties ties', async () => {
    const s = make()
    const r = await s.searchFood('biryani', { limit: 40 })
    expect(r.totalDishes).toBeGreaterThan(0)
    const shared = r.dishes.filter((d) => d.perApp.filter((o) => o.available).length > 1)
    expect(shared.length).toBeGreaterThan(0)
    for (const d of shared) expect(d.verdict).toMatch(d.saving > 0 ? /^Save ₹\d+ on / : /^Same price on every app$/)
    for (const d of r.dishes.filter((d) => d.perApp.length > 1 && d.perApp.filter((o) => o.available).length === 1)) expect(d.verdict).toMatch(/^Only orderable on /)
    expect(r.platforms.filter((p) => p.state === 'app_only').map((p) => p.platform).sort()).toEqual(['ownly', 'swish'])
    // Restaurants on two apps lead the list.
    expect(r.restaurants[0].apps.length).toBeGreaterThanOrEqual(r.restaurants.at(-1)!.apps.length)
  })
  it('reads a restaurant menu and quotes an order on every app', async () => {
    const s = make()
    const found = await s.searchFood('biryani')
    const key = found.restaurants[0].key
    const menu = await s.restaurantMenu(key)
    expect(menu.restaurant.key).toBe(key)
    const dish = menu.restaurant.dishes!.find((d) => d.perApp.length > 1)!
    const q = await s.quoteFoodOrder(key, [{ dish: dish.key, qty: 2 }, { dish: 'no such dish' }])
    expect(q.notFound).toEqual(['no such dish'])
    expect(q.order).toEqual([{ dish: dish.dish, qty: 2 }])
    for (const quote of q.quotes) if (!quote.missing.length) expect(quote.itemTotal).toBe(2 * dish.perApp.find((o) => o.platform === quote.platform)!.price)
  })
  it('says so when a restaurant is not found', async () => {
    await expect(make().restaurantMenu('zzzz no such place')).rejects.toThrow('No restaurant')
  })
})
