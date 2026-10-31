import { PlatformSession } from '@/native/platformSession'
import { withSessionTurn } from '@/core/session-turn'
import { ProviderBlockedError, ProviderUnavailableError, type Location } from '@/core/types'
import type { Dish, FoodOutlet, FoodSource } from '../types'
import { array, exactLocation, https, id, numeric, positive, record, text } from './shared'

export const SWIGGY_FOOD_ORIGIN = 'https://www.swiggy.com'
const IMAGE = 'https://media-assets.swiggy.com/swiggy/image/upload/fl_lossy,f_auto,q_auto,w_300/'

function image(value: unknown): string | undefined {
  const path = text(value)
  return path && /^[\w/.,-]+$/.test(path) ? IMAGE + path : undefined
}

function outlet(value: unknown, query: string): FoodOutlet | undefined {
  const info = record(value), key = id(info.id), name = text(info.name)
  if (!key || !name) return
  const sla = record(info.sla), slugs = record(info.slugs)
  const city = text(slugs.city), slug = text(slugs.restaurant)
  const discount = record(info.aggregatedDiscountInfoV3)
  return {
    platform: 'swiggy_food', id: key, name, area: text(info.areaName), rating: numeric(info.avgRating),
    etaMinutes: positive(sla.deliveryTime), distanceKm: positive(sla.lastMileTravel),
    open: record(info.availability).opened === true && (sla.serviceability === undefined || sla.serviceability === 'SERVICEABLE'),
    pureVeg: info.veg === true, imageUrl: image(info.cloudinaryImageId),
    offer: [text(discount.header), text(discount.subHeader)].filter(Boolean).join(' ') || text(record(info.aggregatedDiscountInfo).header),
    deepLink: city && slug && /^[\w-]+$/.test(city) && /^[\w-]+$/.test(slug)
      ? `${SWIGGY_FOOD_ORIGIN}/city/${city}/${slug}-rest${key}`
      : `${SWIGGY_FOOD_ORIGIN}/search?query=${encodeURIComponent(query)}`,
  }
}

function dish(value: unknown, at: FoodOutlet, now: number): Dish | undefined {
  const info = record(value), key = id(info.id), name = text(info.name)
  const paise = positive(info.price) ?? (info.price === undefined ? positive(info.defaultPrice) : undefined)
  const price = paise === undefined ? undefined : positive(paise / 100)
  if (!key || !name || !price) return
  return {
    platform: 'swiggy_food', id: key, name, description: text(info.description), price,
    veg: info.isVeg === 1, available: info.inStock === 1, imageUrl: image(info.imageId),
    outlet: at, deepLink: at.deepLink, fetchedAt: now,
  }
}

function cards(json: unknown): Record<string, unknown>[] {
  return array(record(record(json).data).cards).flatMap((entry) => {
    const outer = record(entry), groups = record(record(outer.groupedCard).cardGroupMap)
    return [record(record(outer.card).card), ...Object.values(groups).flatMap((g) => array(record(g).cards).map((c) => record(record(record(c).card).card)))]
  })
}

function assertResponse(json: unknown) {
  if (!Array.isArray(record(record(json).data).cards) || (record(json).statusCode !== undefined && record(json).statusCode !== 0)) {
    throw new ProviderUnavailableError('Swiggy Food did not return a restaurant response.')
  }
}

export function parseSwiggySearch(json: unknown, query = '', now = Date.now()): Dish[] {
  assertResponse(json)
  const seen = new Set<string>()
  return cards(json).flatMap((g) => {
    if (!text(g['@type'])?.endsWith('.DishGroup')) return []
    const at = outlet(record(g.restaurant).info, query)
    if (!at) return []
    return array(g.dishes).flatMap((row) => {
      const d = dish(record(row).info, at, now), key = d && `${at.id}:${d.id}`
      if (!d || seen.has(key!)) return []
      seen.add(key!)
      return [d]
    })
  })
}

export function parseSwiggyRestaurants(json: unknown, query = ''): FoodOutlet[] {
  assertResponse(json)
  return cards(json).flatMap((g) => {
    const at = text(g['@type'])?.endsWith('.Restaurant') ? outlet(g.info, query) : undefined
    return at ? [at] : []
  })
}

export function parseSwiggyMenu(json: unknown, at: FoodOutlet, now = Date.now()): Dish[] {
  assertResponse(json)
  if (at.platform !== 'swiggy_food' || !id(at.id) || !https(at.deepLink, SWIGGY_FOOD_ORIGIN)) return []
  const entries = cards(json)
  const header = entries.find((c) => text(c['@type'])?.endsWith('.Restaurant'))
  if (header && id(record(header.info).id) !== at.id) throw new ProviderUnavailableError('Swiggy Food returned a different restaurant menu.')
  const current = header ? outlet(header.info, at.name) : at
  if (!current) return []
  const out: Dish[] = [], seen = new Set<string>()
  const walk = (value: unknown) => {
    const row = record(value)
    for (const item of array(row.itemCards)) {
      const d = dish(record(record(item).card).info, current, now)
      if (d && !seen.has(d.id)) { seen.add(d.id); out.push(d) }
    }
    for (const category of array(row.categories)) walk(category)
  }
  entries.forEach(walk)
  return out
}

function requestScript(path: string, uuid = false, suffix = ''): string {
  return `
    const res = await fetch(${JSON.stringify(path)}${uuid ? ' + crypto.randomUUID()' : ''}${suffix ? ` + ${JSON.stringify(suffix)}` : ''}, { credentials: 'include', headers: { Accept: 'application/json' } });
    if ([202, 403, 429].includes(res.status) || res.headers.get('x-amzn-waf-action') === 'challenge') throw new Error('blocked:' + res.status);
    const body = await res.text();
    if (/captcha|awswaf|waf challenge|access denied|just a moment|verify you are human/i.test(body) && !res.headers.get('content-type')?.includes('application/json')) throw new Error('blocked:challenge');
    if (!res.ok) throw new Error('http:' + res.status);
    try { return JSON.parse(body); } catch { throw new Error('unavailable:invalid JSON'); }
  `
}

/** `tab: 'DISH'` asks for the Dishes tab: a restaurant name ("meghana") otherwise answers with restaurant cards only. */
export function swiggySearchScript(query: string, loc: Location, tab?: 'DISH'): string {
  exactLocation(loc, 'Swiggy Food')
  const params = `lat=${loc.lat}&lng=${loc.lng}&str=${encodeURIComponent(query)}&trackingId=undefined&submitAction=ENTER&queryUniqueId=`
  return requestScript('/dapi/restaurants/search/v3?' + params, true, tab ? `&selectedPLTab=${tab}` : '')
}

export function swiggyMenuScript(at: FoodOutlet, loc: Location): string {
  exactLocation(loc, 'Swiggy Food')
  return requestScript(`/dapi/menu/pl?page-type=REGULAR_MENU&complete-menu=true&restaurantId=${encodeURIComponent(at.id)}&lat=${loc.lat}&lng=${loc.lng}&catalog_qa=undefined&submitAction=ENTER`)
}

async function run(script: string, signal: AbortSignal): Promise<unknown> {
  return withSessionTurn(SWIGGY_FOOD_ORIGIN, async () => {
    const reset = () => { void PlatformSession.pageReset({ origin: SWIGGY_FOOD_ORIGIN }).catch(() => {}) }
    signal.addEventListener('abort', reset, { once: true })
    try {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
      const result = await PlatformSession.pageRun({ origin: SWIGGY_FOOD_ORIGIN, path: '/search', script, timeoutMs: 18000 })
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
      if (!result.ok) {
        if (/blocked:|HTTP (202|403|429)|captcha|challenge/i.test(result.error ?? '')) throw new ProviderBlockedError('Swiggy Food blocked this request. Try again later in Swiggy.')
        if (/timed?\s*out|timeout/i.test(result.error ?? '')) throw new DOMException('Swiggy Food search timed out.', 'TimeoutError')
        throw new ProviderUnavailableError('Swiggy Food could not load its menu or search results.')
      }
      return result.value
    } finally { signal.removeEventListener('abort', reset) }
  }, signal)
}

export function createSwiggyFoodSource(): FoodSource {
  let location: Location | undefined
  return {
    platform: 'swiggy_food', serial: true, attempts: 1, timeoutMs: 22000,
    async setLocation(next) { location = { ...next } },
    async search(query, signal) {
      exactLocation(location, 'Swiggy Food')
      const first = await run(swiggySearchScript(query, location), signal)
      const dishes = parseSwiggySearch(first, query)
      // A restaurant name lands on the Restaurants tab; its dishes are one request away (still ≤ 2 per search).
      if (dishes.length || !parseSwiggyRestaurants(first, query).length) return dishes
      return parseSwiggySearch(await run(swiggySearchScript(query, location, 'DISH'), signal), query)
    },
    async menu(at, loc, signal) {
      exactLocation(loc, 'Swiggy Food')
      if (at.platform !== 'swiggy_food' || !id(at.id)) throw new ProviderUnavailableError('Choose a Swiggy Food restaurant.')
      return parseSwiggyMenu(await run(swiggyMenuScript(at, loc), signal), at)
    },
  }
}
