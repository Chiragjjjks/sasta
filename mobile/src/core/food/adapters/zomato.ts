import { PlatformSession } from '@/native/platformSession'
import { withSessionTurn } from '@/core/session-turn'
import { NeedsLocationError, ProviderBlockedError, ProviderUnavailableError, type Location } from '@/core/types'
import type { Dish, FoodOutlet, FoodSource } from '../types'
import { array, exactLocation, https, id, numeric, positive, record, text } from './shared'

export const ZOMATO_ORIGIN = 'https://www.zomato.com'
const LOCATION_MESSAGE = 'Zomato delivery location could not be verified. Live prices are unavailable until Sasta can confirm the same delivery area on Zomato.'

function menuUrl(value: unknown): string | undefined {
  const url = https(value, ZOMATO_ORIGIN)
  if (!url) return
  const path = new URL(url).pathname.replace(/\/$/, '')
  return /^\/[\w-]+\/[\w-]+\/order$/.test(path) ? ZOMATO_ORIGIN + path : undefined
}

function minutes(value: unknown): number | undefined {
  const match = text(value)?.match(/^(?:Delivery in )?(\d+)(?:\s*[-–—]\s*(\d+))?\s*min(?:s|utes)?$/i)
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
    const url = menuUrl(record(order.actionInfo).clickUrl) ?? menuUrl(record(row.cardAction).clickUrl)
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

/** A string script for Hermes, shared by search and a single outlet's menu. */
function locationScript(loc: Location): string {
  exactLocation(loc, 'Zomato')
  return `
    const lat = ${loc.lat}, lng = ${loc.lng};
    const request = async (path, allow404 = false) => {
      const res = await fetch(path, { credentials: 'include', headers: { Accept: 'application/json' } });
      if ([202, 403, 429].includes(res.status)) throw new Error('blocked:' + res.status);
      if (allow404 && res.status === 404) return {};
      if (!res.ok) throw new Error('http:' + res.status);
      const body = await res.text();
      if (/captcha|access denied|just a moment|verify you are human/i.test(body) && !res.headers.get('content-type')?.includes('application/json')) throw new Error('blocked:challenge');
      try { return JSON.parse(body); } catch { throw new Error('unavailable:invalid JSON'); }
    };
    let delivery;
    try {
      delivery = (await request('/webroutes/location/get?lat=' + lat + '&lon=' + lng + '&userDefinedLatitude=' + lat + '&userDefinedLongitude=' + lng)).locationDetails;
    } catch { throw new Error('location:resolver failed'); }
    if (delivery?.o2Serviceable === false) throw new Error('unserviceable:location');
    if (delivery?.o2Serviceable !== true || !delivery.entityId || !delivery.entityType || !delivery.locationType || !delivery.cityId || !delivery.deliverySubzoneId || !delivery.entityName) throw new Error('location:incomplete resolver');
    const values = {
      ltv: String(delivery.entityId), lty: String(delivery.entityId), fbcity: String(delivery.cityId),
      locus: JSON.stringify({ addressId: 0, lat, lng, cityId: delivery.cityId, ltv: delivery.entityId, lty: delivery.entityType, fetchFromGoogle: false, dszId: delivery.deliverySubzoneId, fen: delivery.entityName })
    };
    for (const [key, value] of Object.entries(values)) document.cookie = key + '=' + encodeURIComponent(value) + '; path=/; domain=.zomato.com; max-age=86400; secure';
    const menuPath = (value) => {
      if (typeof value !== 'string') return;
      try {
        const url = new URL(value, 'https://www.zomato.com');
        const path = url.pathname.replace(/\\/$/, '');
        if (url.origin === 'https://www.zomato.com' && !url.username && !url.password && /^\\/[\\w-]+\\/[\\w-]+\\/order$/.test(path)) return path;
      } catch {}
    };
    const page = async (path, allow404 = false) => {
      const json = await request('/webroutes/getPage?page_url=' + encodeURIComponent(path) + '&location=&isMobile=0', allow404);
      if (json.page_info?.name !== '404' && Object.keys(json).length && String(json.location?.deliverySubzoneId) !== String(delivery.deliverySubzoneId)) throw new Error('location:response area mismatch');
      return json;
    };
  `
}

export function zomatoSearchScript(query: string, loc: Location): string {
  const slug = query.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return locationScript(loc) + `
    const cityName = String(delivery.cityName || '').toLowerCase();
    const cities = { bengaluru: 'bangalore', bangalore: 'bangalore', gurugram: 'gurgaon', 'new delhi': 'ncr', delhi: 'ncr' };
    const city = cities[cityName] || cityName.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'bangalore';
    const dishPage = await page('/' + city + '/delivery/dish-' + ${JSON.stringify(slug)}, true);
    let rows = dishPage.page_data?.sections?.SECTION_SEARCH_RESULT;
    const valid = (row) => row?.type === 'restaurant' && /^[0-9]+$/.test(String(row.info?.resId)) && row.info?.name && (menuPath(row.order?.actionInfo?.clickUrl) || menuPath(row.cardAction?.clickUrl));
    rows = Array.isArray(rows) ? rows.filter(valid) : [];
    if (!rows.length) {
      const params = 'addressId=0&entityId=' + encodeURIComponent(delivery.entityId) + '&entityType=' + encodeURIComponent(delivery.entityType) + '&locationType=' + encodeURIComponent(delivery.locationType) + '&isOrderLocation=1&cityId=' + encodeURIComponent(delivery.cityId) + '&latitude=' + lat + '&longitude=' + lng + '&q=' + encodeURIComponent(${JSON.stringify(query)}) + '&context=delivery';
      const suggest = await request('/webroutes/search/autoSuggest?' + params);
      if (!Array.isArray(suggest.results)) throw new Error('unavailable:restaurant suggestions missing');
      rows = suggest.results.filter((row) => row?.entityType === 'restaurant').map((row) => ({
        ...row, type: 'restaurant', isDisabled: row.info?.isDisabled,
        info: { ...row.info, rating: { aggregate_rating: row.info?.rating?.text } }
      })).filter(valid);
    }
    const seen = new Set();
    const selected = rows.filter((row) => {
      const key = String(row.info.resId);
      if (seen.has(key)) return false;
      seen.add(key);
      return row.order?.isServiceable === true && row.order?.hasOnlineOrdering !== false && row.isDisabled !== true;
    }).slice(0, 4);
    const menus = [];
    for (const row of selected) {
      const path = menuPath(row.order?.actionInfo?.clickUrl) || menuPath(row.cardAction?.clickUrl);
      const json = await page(path);
      const resId = String(row.info.resId);
      if (String(json.page_data?.sections?.SECTION_BASIC_INFO?.res_id) !== resId) throw new Error('unavailable:restaurant menu mismatch');
      menus.push({ resId, json });
    }
    return { restaurants: { page_data: { sections: { SECTION_SEARCH_RESULT: selected } } }, menus };
  `
}

export function zomatoMenuScript(at: FoodOutlet, loc: Location): string {
  const url = menuUrl(at.deepLink)
  if (at.platform !== 'zomato' || !id(at.id) || !url) throw new ProviderUnavailableError('Choose a Zomato restaurant.')
  return locationScript(loc) + `
    const json = await page(${JSON.stringify(new URL(url).pathname)});
    if (String(json.page_data?.sections?.SECTION_BASIC_INFO?.res_id) !== ${JSON.stringify(at.id)}) throw new Error('unavailable:restaurant menu mismatch');
    return json;
  `
}

async function run(script: string, loc: Location, signal: AbortSignal): Promise<unknown> {
  return withSessionTurn(ZOMATO_ORIGIN, async () => {
    const reset = () => { void PlatformSession.pageReset({ origin: ZOMATO_ORIGIN }).catch(() => {}) }
    signal.addEventListener('abort', reset, { once: true })
    try {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
      const result = await PlatformSession.pageRun({ origin: ZOMATO_ORIGIN, path: '/robots.txt', script, timeoutMs: 22000 })
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
      if (!result.ok) {
        const error = result.error ?? ''
        if (/unserviceable:/.test(error)) throw new ProviderUnavailableError(`Zomato doesn't deliver to ${loc.label || 'this area'} yet.`)
        if (/location:/.test(error)) throw new NeedsLocationError(LOCATION_MESSAGE)
        if (/blocked:|HTTP (202|403|429)|captcha|challenge/i.test(error)) throw new ProviderBlockedError('Zomato blocked this request. Try again later in Zomato.')
        if (/timed?\s*out|timeout/i.test(error)) throw new DOMException('Zomato search timed out.', 'TimeoutError')
        throw new ProviderUnavailableError('Zomato could not load its menu or search results.')
      }
      return result.value
    } finally { signal.removeEventListener('abort', reset) }
  }, signal)
}

export function createZomatoSource(): FoodSource {
  let location: Location | undefined
  return {
    platform: 'zomato', serial: true, attempts: 1, timeoutMs: 25000,
    async setLocation(next) { location = { ...next } },
    async search(query, signal) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
      exactLocation(location, 'Zomato')
      const result = record(await run(zomatoSearchScript(query, location), location, signal))
      const outlets = parseZomatoRestaurants(result.restaurants)
      if (!Array.isArray(result.menus)) throw new ProviderUnavailableError('Zomato did not return restaurant menus.')
      return result.menus.flatMap((entry) => {
        const menu = record(entry), at = outlets.find((outlet) => outlet.id === id(menu.resId))
        if (!at) throw new ProviderUnavailableError('Zomato did not return the selected restaurant menu.')
        return parseZomatoMenu(menu.json, at)
      })
    },
    async menu(at, loc, signal) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
      exactLocation(loc, 'Zomato')
      return parseZomatoMenu(await run(zomatoMenuScript(at, loc), loc, signal), at)
    },
  }
}
