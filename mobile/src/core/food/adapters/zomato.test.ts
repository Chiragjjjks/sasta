import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PlatformSession } from '@/native/platformSession'
import { createZomatoSource, parseZomatoMenu, parseZomatoRestaurants } from './zomato'

const list = JSON.parse(readFileSync('fixtures/zomato/delivery-list.json', 'utf8'))
const menu = JSON.parse(readFileSync('fixtures/zomato/restaurant-menu.json', 'utf8'))
const loc = { lat: 12.9915, lng: 77.5544, pincode: '560010', label: 'Rajajinagar' }
const items = (json: typeof menu) => json.page_data.order.menuList.menus[0].menu.categories[0].category.items
const rows = (json: typeof list) => json.page_data.sections.SECTION_SEARCH_RESULT

afterEach(() => vi.restoreAllMocks())

describe('Zomato fixtures (UB City, not a live Rajajinagar check)', () => {
  it('parses outlet ids, upper ETA bounds, metres and kilometres, offers and serviceability', () => {
    const outlets = parseZomatoRestaurants(list)
    expect(outlets).toHaveLength(3)
    expect(outlets[0]).toMatchObject({ platform: 'zomato', id: '50715', name: 'Nandhana Palace', rating: 4.4, etaMinutes: 45, distanceKm: 5.3, offer: '30% OFF', open: true, deepLink: 'https://www.zomato.com/bangalore/nandhana-palace-indiranagar/order' })
    expect(outlets[1]).toMatchObject({ etaMinutes: 30, distanceKm: 0.648 })
    expect(outlets[2].distanceKm).toBe(1)
    const json = structuredClone(list)
    rows(json)[0].distance = '1.6 km'
    rows(json)[0].order.isServiceable = false
    expect(parseZomatoRestaurants(json)[0]).toMatchObject({ distanceKm: 1.6, open: false })
  })

  it('reads rupees without dividing by 100 or choosing modifier/variant prices', () => {
    const dishes = parseZomatoMenu(menu, parseZomatoRestaurants(list)[0], 6)
    expect(dishes).toHaveLength(4)
    expect(dishes[0]).toMatchObject({ id: 'ctl_481102763', name: 'Supreme Boneless Chicken Biryani', price: 375, veg: false, available: true, fetchedAt: 6,
      outlet: { id: '50715', area: 'Indiranagar, Bangalore', etaMinutes: 44, open: true, offer: '30% OFF' } })
    expect(dishes[0].strikePrice).toBeUndefined()
    expect(dishes[0].imageUrl).toMatch(/^https:\/\/b.zmtcdn.com\//)
    expect(parseZomatoMenu(menu)[3].price).toBe(289)
  })

  it('keeps unavailable, veg, unknown dietary flags and closed restaurants honest', () => {
    const json = structuredClone(menu)
    items(json)[0].item.item_state = 'unavailable'
    items(json)[0].item.dietary_slugs = ['veg']
    items(json)[1].item.dietary_slugs = []
    json.page_data.sections.SECTION_BASIC_INFO.is_temp_closed = true
    const dishes = parseZomatoMenu(json)
    expect(dishes[0]).toMatchObject({ available: false, veg: true, outlet: { open: false } })
    expect(dishes[1].veg).toBeUndefined()
  })

  it('rejects unsafe links and images, junk rows, duplicate ids and malformed lists', () => {
    for (const bad of ['http://www.zomato.com/bangalore/a/order', 'https://evil.test/bangalore/a/order', '//evil.test/bangalore/a/order', 'javascript:alert(1)', 'https://user@www.zomato.com/bangalore/a/order']) {
      const json = structuredClone(list)
      rows(json)[0].order.actionInfo.clickUrl = bad
      expect(parseZomatoRestaurants(json)).toHaveLength(2)
    }
    const json = structuredClone(list)
    rows(json).push(rows(json)[0], null, {})
    rows(json)[0].info.image.url = 'http://image.test/a.jpg'
    expect(parseZomatoRestaurants(json)).toHaveLength(3)
    expect(parseZomatoRestaurants(json)[0].imageUrl).toBeUndefined()
    rows(json)[0].info.resId = null
    expect(parseZomatoRestaurants(json)).toHaveLength(2)
    expect(() => parseZomatoRestaurants({})).toThrow('restaurant list')
  })

  it('rejects missing ids and invalid prices without falling back to default_price', () => {
    for (const bad of [0, -1, NaN, Infinity, null, undefined, '375']) {
      const json = structuredClone(menu)
      items(json)[0].item.price = bad
      expect(parseZomatoMenu(json)).toHaveLength(3)
    }
    const json = structuredClone(menu)
    items(json)[0].item.id = ''
    items(json)[1].item.item_image_url = 'data:image/png;base64,AA'
    expect(parseZomatoMenu(json)).toHaveLength(3)
    expect(parseZomatoMenu(json)[0].imageUrl).toBeUndefined()
  })

  it('walks nested categories and deduplicates dishes (synthetic nesting)', () => {
    const json = structuredClone(menu), category = json.page_data.order.menuList.menus[0].menu.categories[0].category
    category.categories = [{ category: { items: [...items(json), null, {}] } }]
    expect(parseZomatoMenu(json)).toHaveLength(4)
  })

  it('rejects a menu for a different outlet or without a safe restaurant header', () => {
    expect(() => parseZomatoMenu(menu, parseZomatoRestaurants(list)[1])).toThrow('selected restaurant')
    const json = structuredClone(menu)
    json.page_data.sections.SECTION_BASIC_INFO.resUrl = 'http://www.zomato.com/bangalore/a'
    expect(() => parseZomatoMenu(json)).toThrow('selected restaurant')
    expect(() => parseZomatoMenu({})).toThrow('selected restaurant')
  })
})

describe('Zomato location gate', () => {
  it('never opens a WebView or returns default-area prices, even with exact coordinates', async () => {
    const page = vi.spyOn(PlatformSession, 'pageRun'), source = createZomatoSource(), signal = new AbortController().signal
    await source.setLocation(loc)
    await expect(source.search('biryani', signal)).rejects.toMatchObject({ name: 'NeedsLocationError', message: expect.stringContaining('could not be verified') })
    await expect(source.menu!(parseZomatoRestaurants(list)[0], loc, signal)).rejects.toMatchObject({ name: 'NeedsLocationError' })
    expect(page).not.toHaveBeenCalled()
  })

  it('rejects invalid coordinates and respects cancellation', async () => {
    const source = createZomatoSource(), controller = new AbortController()
    for (const coords of [{}, { lat: NaN, lng: 77 }, { lat: 91, lng: 77 }, { lat: 12, lng: 181 }]) {
      await source.setLocation({ label: 'Rajajinagar', pincode: '560010', ...coords })
      await expect(source.search('biryani', controller.signal)).rejects.toMatchObject({ name: 'NeedsLocationError' })
    }
    controller.abort()
    await expect(source.search('biryani', controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
  })
})
