import { NeedsLocationError, ProviderUnavailableError, type Location } from '@/core/types'
import type { Dish, FoodOutlet, FoodSource } from '../types'
import { array, exactLocation, https, id, numeric, positive, record, text } from './shared'

export const ZOMATO_ORIGIN = 'https://www.zomato.com'
const LOCATION_MESSAGE = 'Zomato delivery location could not be verified. Live prices are unavailable until Sasta can confirm the same delivery area on Zomato.'

function menuUrl(value: unknown): string | undefined {
  const url = https(value, ZOMATO_ORIGIN)
  return url && /^\/[\w-]+\/[\w-]+\/order\/?$/.test(new URL(url).pathname) ? url : undefined
}

function minutes(value: unknown): number | undefined {
  const match = text(value)?.match(/^(\d+)(?:\s*[-–—]\s*(\d+))?\s*min(?:s|utes)?$/i)
  return match ? positive(Number(match[2] ?? match[1])) : undefined
}

function distance(value: unknown): number | undefined {
  const match = text(value)?.match(/^(\d+(?:\.\d+)?)\s*(km|m)$/i)
  return match ? positive(Number(match[1]) / (match[2].toLowerCase() === 'm' ? 1000 : 1)) : undefined
}

export function parseZomatoRestaurants(json: unknown): FoodOutlet[] {
  const entries = record(record(record(json).page_data).sections).SECTION_SEARCH_RESULT
  if (!Array.isArray(entries)) throw new ProviderUnavailableError('Zomato did not return a restaurant list.')
  const seen = new Set<string>()
  return entries.flatMap((value) => {
    const row = record(value), info = record(row.info), order = record(row.order)
    const key = id(info.resId), name = text(info.name)
    const url = menuUrl(record(order.actionInfo).clickUrl ?? record(row.cardAction).clickUrl)
    if (row.type !== 'restaurant' || !key || !name || !url || seen.has(key)) return []
    seen.add(key)
    return [{
      platform: 'zomato', id: key, name, area: text(record(info.locality).name),
      rating: numeric(record(info.rating).aggregate_rating), etaMinutes: minutes(order.deliveryTime), distanceKm: distance(row.distance),
      offer: array(row.bulkOffers).map((o) => text(record(o).text)).filter(Boolean).join(' · ') || text(row.promoOffer),
      open: order.isServiceable === true && order.hasOnlineOrdering !== false && row.isDisabled !== true,
      imageUrl: https(record(info.image).url), deepLink: url,
    } satisfies FoodOutlet]
  })
}

export function parseZomatoMenu(json: unknown, at?: FoodOutlet, now = Date.now()): Dish[] {
  const page = record(record(json).page_data), basic = record(record(page.sections).SECTION_BASIC_INFO), order = record(page.orderDetails)
  const key = id(basic.res_id), name = text(basic.name)
  const url = menuUrl(typeof basic.resUrl === 'string' ? `${basic.resUrl.replace(/\/$/, '')}/order` : undefined)
  if (!key || !name || !url || (at && (at.platform !== 'zomato' || at.id !== key || !menuUrl(at.deepLink)))) {
    throw new ProviderUnavailableError('Zomato did not return the selected restaurant menu.')
  }
  const menus = record(record(page.order).menuList).menus
  if (!Array.isArray(menus)) throw new ProviderUnavailableError('Zomato did not return a dish list.')
  const outlet: FoodOutlet = {
    ...at, platform: 'zomato', id: key, name, deepLink: url,
    rating: numeric(record(basic.rating).aggregate_rating) ?? at?.rating,
    etaMinutes: minutes(order.deliveryTime) ?? at?.etaMinutes,
    open: order.isServiceable === true && order.hasOnlineOrdering !== false && basic.is_temp_closed !== true && basic.is_perm_closed !== true,
  }
  const dishes: Dish[] = [], seen = new Set<string>()
  const walk = (value: unknown) => {
    const row = record(value)
    for (const entry of array(row.items)) {
      const item = record(record(entry).item), itemId = id(item.id), itemName = text(item.name), price = positive(item.price)
      if (!itemId || !itemName || !price || seen.has(itemId)) continue
      seen.add(itemId)
      const dietary = array(item.dietary_slugs)
      dishes.push({
        platform: 'zomato', id: itemId, name: itemName, price, description: text(item.desc),
        veg: dietary.includes('non-veg') ? false : dietary.includes('veg') ? true : undefined,
        available: item.item_state === 'available', imageUrl: https(item.item_image_url),
        outlet, deepLink: url, fetchedAt: now,
      })
    }
    for (const category of array(row.categories)) walk(record(category).category ?? category)
  }
  for (const menu of menus) walk(record(menu).menu)
  return dishes
}

/** The site's location picker was unreachable; never use its UB City fallback for live prices. */
export function createZomatoSource(): FoodSource {
  let location: Location | undefined
  const requireLocation = (loc: Location | undefined, signal: AbortSignal): never => {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
    exactLocation(loc, 'Zomato')
    throw new NeedsLocationError(LOCATION_MESSAGE)
  }
  return {
    platform: 'zomato', serial: true, attempts: 1,
    async setLocation(next) { location = { ...next } },
    async search(_query, signal) { return requireLocation(location, signal) },
    async menu(_outlet, loc, signal) { return requireLocation(loc, signal) },
  }
}
