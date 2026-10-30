import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PlatformSession } from '@/native/platformSession'
import { createZomatoSource, parseZomatoMenu, parseZomatoRestaurants, zomatoMenuScript, zomatoSearchScript } from './zomato'

const list = JSON.parse(readFileSync('fixtures/zomato/delivery-list.json', 'utf8'))
const menu = JSON.parse(readFileSync('fixtures/zomato/restaurant-menu.json', 'utf8'))
const live = JSON.parse(readFileSync('fixtures/zomato/rajajinagar-live.json', 'utf8'))
const loc = { lat: 12.9915, lng: 77.5544, pincode: '560010', label: 'Rajajinagar' }
const items = (json: typeof menu) => json.page_data.order.menuList.menus[0].menu.categories[0].category.items
const rows = (json: typeof list) => json.page_data.sections.SECTION_SEARCH_RESULT

afterEach(() => vi.restoreAllMocks())

const delivery = { entityId: 5210, entityType: 'subzone', locationType: 'poi', cityId: 4, cityName: 'Bengaluru', deliverySubzoneId: 781, entityName: 'Rajajinagar', o2Serviceable: true }
const liveList = () => ({ ...structuredClone(live.restaurants), location: { deliverySubzoneId: 781, fetchedFromCookie: true } })
const response = (json: unknown, status = 200) => new Response(JSON.stringify(json), { status, headers: { 'content-type': 'application/json' } })
const execute = (script: string, fetch: unknown, document: object = {}) => new Function('fetch', 'document', `return (async () => {${script}})()`)(fetch, document)
const route = async (path: string) => {
  const url = new URL(path, 'https://www.zomato.com')
  if (url.pathname.endsWith('/location/get')) return response({ locationDetails: delivery })
  if (url.pathname.endsWith('/autoSuggest')) return response(live.suggest)
  const page = url.searchParams.get('page_url')
  if (page?.includes('/delivery/')) return response(liveList())
  const menu = live.menus.find((m: typeof live.menus[number]) => m.json.page_data.sections.SECTION_BASIC_INFO.resUrl + '/order' === page)
  if (!menu) throw new Error('Unexpected request: ' + path)
  return response(menu.json)
}

describe('Zomato Rajajinagar fixture and WebView source', () => {
  it('parses nearby outlets and real rupee dishes, using the card link when the order link is invalid', () => {
    const outlets = parseZomatoRestaurants(live.restaurants)
    expect(outlets).toHaveLength(2)
    expect(outlets[0]).toMatchObject({ id: '19544819', name: 'Meghana Foods', area: 'Rajajinagar, Bangalore', distanceKm: 0.994 })
    expect(outlets[1]).toMatchObject({ id: '20511954', distanceKm: 0.455 })
    const dishes = live.menus.flatMap((m: typeof live.menus[number]) => parseZomatoMenu(m.json, outlets.find((o) => o.id === m.resId)))
    expect(dishes).toHaveLength(6)
    expect(dishes[2]).toMatchObject({ name: 'Meghana Special Boneless Biryani', price: 383, outlet: { id: '19544819', open: true } })
    expect(dishes[3]).toMatchObject({ price: 359, outlet: { id: '20511954' } })
    const json = structuredClone(live.restaurants)
    rows(json)[0].order.actionInfo.clickUrl = 'https://evil.test/bangalore/a/order'
    expect(parseZomatoRestaurants(json)[0].deepLink).toBe('https://www.zomato.com/bangalore/meghana-foods-rajajinagar-bangalore/order')
  })

  it('sets all four location cookies before searching in a single WebView script', async () => {
    const document = {}, writes: string[] = []
    Object.defineProperty(document, 'cookie', { set: (value: string) => writes.push(value) })
    const fetch = vi.fn(async (path: string) => {
      if (!path.includes('/location/get')) expect(writes).toHaveLength(4)
      return route(path)
    })
    const page = vi.spyOn(PlatformSession, 'pageRun').mockImplementation(async (options) => ({ ok: true, value: await execute(options.script, fetch, document) }))
    const source = createZomatoSource()
    await source.setLocation(loc)
    expect(await source.search('biryani', new AbortController().signal)).toHaveLength(6)
    expect(source).toMatchObject({ attempts: 1, serial: true, timeoutMs: 25000 })
    expect(page).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ origin: 'https://www.zomato.com', path: '/robots.txt', timeoutMs: 22000 }))
    expect(fetch).toHaveBeenCalledTimes(4)
    const url = new URL(fetch.mock.calls[0][0], 'https://www.zomato.com')
    expect(url.searchParams.get('userDefinedLatitude')).toBe('12.9915')
    expect(url.searchParams.get('userDefinedLongitude')).toBe('77.5544')
    const cookies = Object.fromEntries(writes.map((value) => {
      expect(value).toContain('; path=/; domain=.zomato.com; max-age=86400; secure')
      const [key, encoded] = value.split(';')[0].split('=')
      return [key, decodeURIComponent(encoded)]
    }))
    expect(cookies).toMatchObject({ ltv: '5210', lty: '5210', fbcity: '4' })
    expect(JSON.parse(cookies.locus)).toEqual({ addressId: 0, lat: loc.lat, lng: loc.lng, cityId: 4, ltv: 5210, lty: 'subzone', fetchFromGoogle: false, dszId: 781, fen: 'Rajajinagar' })
  })

  it('falls back from a 200/404 dish page to location-aware restaurant-name suggestions', async () => {
    const fetch = vi.fn(async (path: string) => path.includes('dish-') ? response({ page_info: { name: '404' } }) : route(path))
    const result = await execute(zomatoSearchScript('meghana', loc), fetch)
    const outlets = parseZomatoRestaurants(result.restaurants)
    expect(outlets).toHaveLength(1)
    expect(outlets[0]).toMatchObject({ id: '19544819', rating: 4.5, etaMinutes: 30, open: true })
    expect(fetch).toHaveBeenCalledTimes(4)
    const url = new URL(fetch.mock.calls[2][0], 'https://www.zomato.com')
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ addressId: '0', entityId: '5210', entityType: 'subzone', locationType: 'poi', isOrderLocation: '1', cityId: '4', latitude: '12.9915', longitude: '77.5544', q: 'meghana', context: 'delivery' })
  })

  it('caps fallback at seven requests, deduplicates outlets and fetches four menus sequentially', async () => {
    const suggestions = Array.from({ length: 6 }, (_, i) => {
      const row = structuredClone(live.suggest.results[0])
      row.info.resId = 100 + i
      row.order.actionInfo.clickUrl = `/bangalore/test-${100 + i}/order?ignored=1`
      return row
    })
    suggestions.splice(1, 0, suggestions[0])
    let active = 0, maxActive = 0
    const fetch = vi.fn(async (path: string) => {
      if (path.includes('/location/get')) return response({ locationDetails: delivery })
      if (path.includes('dish-')) return response({}, 404)
      if (path.includes('/autoSuggest')) return response({ results: suggestions })
      active++; maxActive = Math.max(active, maxActive)
      await Promise.resolve()
      active--
      const page = new URL(path, 'https://www.zomato.com').searchParams.get('page_url')!
      expect(page).not.toContain('?')
      const resId = Number(page.match(/test-(\d+)/)![1])
      return response({ location: { deliverySubzoneId: 781 }, page_data: { sections: { SECTION_BASIC_INFO: { res_id: resId } } } })
    })
    const result = await execute(zomatoSearchScript('meghana "&x=1', loc), fetch)
    expect(fetch).toHaveBeenCalledTimes(7)
    expect(maxActive).toBe(1)
    expect(result.menus.map((m: { resId: string }) => m.resId)).toEqual(['100', '101', '102', '103'])
    expect(new URL(fetch.mock.calls[2][0], 'https://www.zomato.com').searchParams.get('q')).toBe('meghana "&x=1')
  })

  it('sets location for a single menu and rejects swapped menus at both parsing boundaries', async () => {
    const at = parseZomatoRestaurants(live.restaurants)[0], fetch = vi.fn(route)
    await execute(zomatoMenuScript({ ...at, deepLink: at.deepLink + '?discard=1' }, loc), fetch)
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(new URL(fetch.mock.calls[1][0], 'https://www.zomato.com').searchParams.get('page_url')).toBe('/bangalore/meghana-foods-rajajinagar-bangalore/order')
    const wrong = vi.fn(async (path: string) => path.includes('/location/get') ? route(path) : response(live.menus[1].json))
    await expect(execute(zomatoMenuScript(at, loc), wrong)).rejects.toThrow('menu mismatch')
    await expect(execute(zomatoSearchScript('biryani', loc), vi.fn(async (path: string) => new URL(path, 'https://www.zomato.com').searchParams.get('page_url')?.endsWith('/order') ? response(live.menus[1].json) : route(path)))).rejects.toThrow('menu mismatch')
    const page = vi.spyOn(PlatformSession, 'pageRun').mockResolvedValue({ ok: true, value: live.menus[0].json })
    expect(await createZomatoSource().menu!(at, loc, new AbortController().signal)).toHaveLength(3)
    page.mockResolvedValue({ ok: true, value: { restaurants: live.restaurants, menus: [{ resId: at.id, json: live.menus[1].json }] } })
    const source = createZomatoSource()
    await source.setLocation(loc)
    await expect(source.search('biryani', new AbortController().signal)).rejects.toThrow('selected restaurant')
    expect(() => zomatoMenuScript({ ...at, deepLink: 'https://evil.test/bangalore/a/order' }, loc)).toThrow('Choose a Zomato')
  })

  it('stops before search on failed, incomplete or unserviceable location resolution', async () => {
    for (const [json, status, error] of [[{}, 500, 'location:'], [{ locationDetails: {} }, 200, 'location:'], [{ locationDetails: { ...delivery, o2Serviceable: false } }, 200, 'unserviceable:']] as const) {
      const fetch = vi.fn().mockResolvedValue(response(json, status)), document = { cookie: '' }
      await expect(execute(zomatoSearchScript('biryani', loc), fetch, document)).rejects.toThrow(error)
      expect(fetch).toHaveBeenCalledTimes(1)
      expect(document.cookie).toBe('')
    }
  })

  it('refuses default-area responses and stops on WAF and invalid JSON without retrying', async () => {
    const mismatch = vi.fn(async (path: string) => path.includes('/location/get') ? route(path) : response({ ...liveList(), location: { deliverySubzoneId: 3655 } }))
    await expect(execute(zomatoSearchScript('biryani', loc), mismatch)).rejects.toThrow('location:response area mismatch')
    expect(mismatch).toHaveBeenCalledTimes(2)
    for (const status of [202, 403, 429]) {
      const fetch = vi.fn(async (path: string) => path.includes('/location/get') ? route(path) : new Response('', { status }))
      await expect(execute(zomatoSearchScript('biryani', loc), fetch)).rejects.toThrow('blocked:')
      expect(fetch).toHaveBeenCalledTimes(2)
    }
    for (const body of ['<html>verify you are human</html>', 'invalid JSON']) {
      const fetch = vi.fn(async (path: string) => path.includes('/location/get') ? route(path) : new Response(body))
      await expect(execute(zomatoSearchScript('biryani', loc), fetch)).rejects.toThrow(body.includes('html') ? 'blocked:challenge' : 'invalid JSON')
    }
  })

  it('maps location, serviceability, WAF and timeout errors to typed failures', async () => {
    const page = vi.spyOn(PlatformSession, 'pageRun'), source = createZomatoSource()
    await source.setLocation(loc)
    for (const [error, name] of [['location:resolver failed', 'NeedsLocationError'], ['unserviceable:location', 'ProviderUnavailableError'], ['blocked:403', 'ProviderBlockedError'], ['timeout', 'TimeoutError'], ['http:500', 'ProviderUnavailableError']]) {
      page.mockResolvedValue({ ok: false, error })
      await expect(source.search('biryani', new AbortController().signal)).rejects.toMatchObject({ name, ...(error.startsWith('unserviceable:') ? { message: "Zomato doesn't deliver to Rajajinagar yet." } : {}) })
    }
  })

  it('rejects invalid coordinates before opening a page and discards aborted results', async () => {
    const page = vi.spyOn(PlatformSession, 'pageRun'), source = createZomatoSource(), controller = new AbortController()
    for (const coords of [{}, { lat: NaN, lng: 77 }, { lat: 91, lng: 77 }, { lat: 12, lng: 181 }]) {
      await source.setLocation({ label: 'Rajajinagar', pincode: '560010', ...coords })
      await expect(source.search('biryani', controller.signal)).rejects.toMatchObject({ name: 'NeedsLocationError' })
    }
    expect(page).not.toHaveBeenCalled()
    await source.setLocation(loc)
    page.mockImplementation(async () => { controller.abort(); return { ok: true, value: {} } })
    const reset = vi.spyOn(PlatformSession, 'pageReset')
    await expect(source.search('biryani', controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect(reset).toHaveBeenCalledWith({ origin: 'https://www.zomato.com' })
    await expect(source.search('biryani', controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
  })
})

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
      rows(json)[0].cardAction.clickUrl = bad
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
