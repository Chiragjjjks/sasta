import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PlatformSession } from '@/native/platformSession'
import { createSwiggyFoodSource, parseSwiggyMenu, parseSwiggyRestaurants, parseSwiggySearch, swiggyMenuScript, swiggySearchScript } from './swiggy'

const fixture = JSON.parse(readFileSync('fixtures/swiggy_food/search-dish.json', 'utf8'))
const restaurants = JSON.parse(readFileSync('fixtures/swiggy_food/search-restaurant.json', 'utf8'))
const loc = { lat: 12.9915, lng: 77.5544, pincode: '560010', label: 'Rajajinagar' }
const group = (json: typeof fixture) => json.data.cards[1].groupedCard.cardGroupMap.DISH.cards[0].card.card
const execute = (script: string, fetch: unknown) => new Function('fetch', 'crypto', `return (async () => {${script}})()`)(fetch, { randomUUID: () => 'test-uuid' })
afterEach(() => vi.restoreAllMocks())

describe('Swiggy Food fixtures', () => {
  it('converts paise and preserves metadata and variant default price', () => {
    const dishes = parseSwiggySearch(fixture, 'biryani', 7)
    expect(dishes).toHaveLength(8)
    expect(dishes[0]).toMatchObject({ id: '179560165', price: 345, veg: false, available: true, fetchedAt: 7,
      outlet: { id: '690552', area: 'Rajajinagar', open: true, etaMinutes: 22, distanceKm: 1.8, rating: 4.3 } })
    expect(dishes[0].deepLink).toBe('https://www.swiggy.com/city/bangalore/narmada-chain-of-restaurant-rajajinagar-rajajinagar-rest690552')
    expect(dishes[0].imageUrl).toContain('/fl_lossy,f_auto,q_auto,w_300/')
    expect(dishes[1].veg).toBe(true)
    expect(dishes.find((d) => d.id === '181222165')?.price).toBe(469)
  })
  it('reads the restaurant tab without manufacturing dishes', () => {
    expect(parseSwiggyRestaurants(restaurants)).toHaveLength(3)
    expect(parseSwiggyRestaurants(restaurants)[1]).toMatchObject({ id: '25118', pureVeg: true, etaMinutes: 47 })
    expect(parseSwiggySearch(restaurants)).toEqual([])
  })
  it('rejects junk prices, ids and duplicate rows and drops unsafe images', () => {
    for (const bad of [0, -1, NaN, Infinity, Number.MIN_VALUE, '34500', null]) {
      const json = structuredClone(fixture)
      group(json).dishes[0].info.price = bad
      expect(parseSwiggySearch(json).some((d) => d.id === '179560165')).toBe(false)
    }
    const json = structuredClone(fixture), g = group(json)
    g.dishes.push(g.dishes[0], null, {})
    g.dishes[0].info.imageId = 'http://evil.test/a'
    expect(parseSwiggySearch(json)).toHaveLength(8)
    expect(parseSwiggySearch(json)[0].imageUrl).toBeUndefined()
    g.restaurant.info.id = ''
    expect(parseSwiggySearch(json)).toHaveLength(6)
    expect(() => parseSwiggySearch({ data: {} })).toThrow('restaurant response')
  })
  it('keeps closed and unavailable rows, offers and safe fallback links', () => {
    const json = structuredClone(fixture), g = group(json)
    g.restaurant.info.availability.opened = false
    g.restaurant.info.aggregatedDiscountInfoV3 = { header: '50% OFF', subHeader: 'UPTO ₹100' }
    delete g.restaurant.info.slugs
    delete g.dishes[0].info.inStock
    expect(parseSwiggySearch(json, 'biryani')[0]).toMatchObject({ available: false, outlet: { open: false, offer: '50% OFF UPTO ₹100' }, deepLink: 'https://www.swiggy.com/search?query=biryani' })
  })
  it('reads nested menu itemCards without addons (synthetic menu envelope)', () => {
    const at = parseSwiggyRestaurants(restaurants)[0]
    const items = group(fixture).dishes.map((d: unknown) => ({ card: d }))
    const menu = { data: { cards: [{ groupedCard: { cardGroupMap: { REGULAR: { cards: [{ card: { card: { categories: [{ itemCards: [...items, ...items] }] } } }] } } } }] } }
    expect(parseSwiggyMenu(menu, at, 4)).toHaveLength(2)
    expect(parseSwiggyMenu(menu, { ...at, deepLink: 'http://www.swiggy.com/menu' })).toEqual([])
  })
})

describe('Swiggy Food WebView source', () => {
  it('makes one encoded search with exact coordinates and an explicit menu request', async () => {
    const fetch = vi.fn().mockImplementation(async () => new Response(JSON.stringify(fixture), { headers: { 'content-type': 'application/json' } }))
    await execute(swiggySearchScript('biryani "&veg=1', loc), fetch)
    expect(fetch).toHaveBeenCalledTimes(1)
    const url = new URL(fetch.mock.calls[0][0], 'https://www.swiggy.com')
    expect(url.searchParams.get('str')).toBe('biryani "&veg=1')
    expect(url.searchParams.get('lat')).toBe('12.9915')
    expect(url.searchParams.get('lng')).toBe('77.5544')
    expect(url.searchParams.get('queryUniqueId')).toBe('test-uuid')
    await execute(swiggyMenuScript(parseSwiggyRestaurants(restaurants)[0], loc), fetch)
    expect(fetch.mock.calls[1][0]).toContain('restaurantId=690552')
  })
  it('stops on WAF and HTTP challenges', async () => {
    for (const status of [202, 403, 429]) await expect(execute(swiggySearchScript('biryani', loc), vi.fn().mockResolvedValue(new Response('', { status })))).rejects.toThrow('blocked:')
    await expect(execute(swiggySearchScript('biryani', loc), vi.fn().mockResolvedValue(new Response('<html>awswaf challenge</html>')))).rejects.toThrow('blocked:challenge')
  })
  it('requires coordinates before opening a page and propagates blocking', async () => {
    const page = vi.spyOn(PlatformSession, 'pageRun').mockResolvedValue({ ok: false, error: 'blocked:202' })
    const source = createSwiggyFoodSource(), signal = new AbortController().signal
    await source.setLocation({ label: 'Rajajinagar', pincode: '560010' })
    await expect(source.search('biryani', signal)).rejects.toMatchObject({ name: 'NeedsLocationError' })
    expect(page).not.toHaveBeenCalled()
    await source.setLocation(loc)
    await expect(source.search('biryani', signal)).rejects.toMatchObject({ name: 'ProviderBlockedError' })
  })
  it('discards aborted results and resets its WebView', async () => {
    const controller = new AbortController()
    vi.spyOn(PlatformSession, 'pageRun').mockImplementation(async () => { controller.abort(); return { ok: true, value: fixture } })
    const reset = vi.spyOn(PlatformSession, 'pageReset'), source = createSwiggyFoodSource()
    await source.setLocation(loc)
    await expect(source.search('biryani', controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect(reset).toHaveBeenCalled()
  })
})
