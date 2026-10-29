import { hash } from '@/core/adapters/mock'
import { FOOD_PLATFORM, FOOD_PLATFORMS } from '@/core/platforms'
import type { Location } from '@/core/types'
import { relevantDishes } from '../match'
import type { Dish, FoodOutlet, FoodPlatform, FoodSource } from '../types'

/**
 * Sample food data for the browser preview. Each app spells restaurants and dishes its own way,
 * the way the real apps do, so the matcher is exercised. Ownly lists dine-in prices; Zomato and
 * Swiggy mark menus up by different amounts; Swish is one kitchen with its own menu.
 */

interface Item { name: string; price: number; veg: boolean; bestseller?: boolean; names?: Partial<Record<FoodPlatform, string>> }
interface Place { name: string; names?: Partial<Record<FoodPlatform, string>>; area: string; km: number; rating: number; on: FoodPlatform[]; closed?: FoodPlatform[]; items: Item[] }

const PLACES: Place[] = [
  { name: 'Meghana Foods', names: { swiggy_food: 'Meghana Foods - Rajajinagar' }, area: 'Rajajinagar', km: 1.8, rating: 4.5, on: ['zomato', 'swiggy_food', 'ownly'], items: [
    { name: 'Chicken Boneless Biryani', price: 360, veg: false, bestseller: true, names: { swiggy_food: 'Chicken Boneless Biryani (Serves 1)', ownly: 'Boneless Chicken Biryani' } },
    { name: 'Special Chicken Biryani', price: 380, veg: false },
    { name: 'Mutton Biryani', price: 420, veg: false },
    { name: 'Paneer Biryani', price: 300, veg: true, names: { zomato: 'Panner Biryani' } },
    { name: 'Veg Biryani', price: 260, veg: true },
    { name: 'Chicken 65', price: 300, veg: false, bestseller: true },
  ] },
  { name: 'Empire Restaurant', names: { swiggy_food: 'Hotel Empire', zomato: 'Empire Restaurant - Malleshwaram' }, area: 'Malleshwaram', km: 2.6, rating: 4.1, on: ['zomato', 'swiggy_food', 'ownly'], items: [
    { name: 'Chicken Biryani', price: 250, veg: false, bestseller: true, names: { zomato: 'Chicken Biriyani' } },
    { name: 'Ghee Rice', price: 120, veg: true },
    { name: 'Butter Chicken', price: 280, veg: false },
    { name: 'Chicken Kabab', price: 200, veg: false, names: { swiggy_food: 'Chicken Kebab' } },
    { name: 'Chicken Shawarma', price: 140, veg: false },
    { name: 'Kerala Parotta', price: 40, veg: true },
  ] },
  { name: 'Nagarjuna', names: { swiggy_food: 'Nagarjuna (Residency Road)' }, area: 'Residency Road', km: 6.4, rating: 4.4, on: ['zomato', 'swiggy_food', 'ownly'], closed: ['zomato'], items: [
    { name: 'Andhra Chicken Biryani', price: 330, veg: false, bestseller: true },
    { name: 'Andhra Veg Meals', price: 260, veg: true },
    { name: 'Chicken Fry Piece Biryani', price: 360, veg: false },
    { name: 'Gongura Mutton', price: 420, veg: false },
  ] },
  { name: 'Behrouz Biryani', area: 'Rajajinagar', km: 2.1, rating: 4.2, on: ['zomato', 'swiggy_food'], items: [
    { name: 'Murgh Makhani Biryani', price: 449, veg: false, bestseller: true },
    { name: 'Dum Gosht Biryani', price: 529, veg: false },
    { name: 'Subz-e-Biryani', price: 359, veg: true },
  ] },
  { name: 'The Rameshwaram Cafe', names: { swiggy_food: 'Rameshwaram Cafe' }, area: 'Rajajinagar', km: 1.2, rating: 4.6, on: ['zomato', 'swiggy_food', 'ownly'], items: [
    { name: 'Ghee Podi Masala Dosa', price: 140, veg: true, bestseller: true, names: { ownly: 'Ghee Podi Masale Dose' } },
    { name: 'Ghee Podi Idli', price: 80, veg: true, names: { swiggy_food: 'Ghee Podi Idly' } },
    { name: 'Masala Dosa', price: 110, veg: true },
    { name: 'Filter Coffee', price: 45, veg: true },
  ] },
  { name: 'Truffles', names: { zomato: 'Truffles - Koramangala' }, area: 'Koramangala', km: 9.5, rating: 4.4, on: ['zomato', 'swiggy_food'], items: [
    { name: 'All American Cheese Burger', price: 300, veg: false, bestseller: true },
    { name: 'Peri Peri Chicken Burger', price: 310, veg: false },
    { name: 'Chicken Wings', price: 290, veg: false },
    { name: 'French Fries', price: 160, veg: true },
  ] },
  { name: 'Leon’s Burgers & Wings', names: { swiggy_food: "Leon's - Burgers & Wings (Leon Grill)" }, area: 'Rajajinagar', km: 2.4, rating: 4.3, on: ['zomato', 'swiggy_food', 'ownly'], items: [
    { name: 'Classic Chicken Burger', price: 219, veg: false, bestseller: true },
    { name: 'Veg Crunch Burger', price: 179, veg: true },
    { name: 'Peri Peri Fries', price: 129, veg: true },
  ] },
  { name: 'Swish', area: 'Swish kitchen, Malleshwaram', km: 2.9, rating: 4.3, on: ['swish'], items: [
    { name: 'Chicken Biryani Bowl', price: 199, veg: false, bestseller: true },
    { name: 'Veg Biryani Bowl', price: 179, veg: true },
    { name: 'Butter Chicken Rice Bowl', price: 229, veg: false },
    { name: 'Paneer Tikka Wrap', price: 159, veg: true },
    { name: 'Masala Dosa', price: 99, veg: true },
    { name: 'Chicken Shawarma', price: 149, veg: false },
    { name: 'Classic Chicken Burger', price: 169, veg: false },
    { name: 'Masala Fries', price: 99, veg: true },
  ] },
]

/** Menu markup over the dine-in price, fee, ETA and the headline offer each app shows. */
const APP: Record<FoodPlatform, { markup: [number, number]; fee?: [number, number]; eta: number; offers: string[] }> = {
  zomato: { markup: [1.08, 1.18], fee: [25, 45], eta: 34, offers: ['50% off up to ₹100', 'Flat ₹125 off above ₹499', ''] },
  swiggy_food: { markup: [1.1, 1.2], fee: [30, 49], eta: 31, offers: ['60% off up to ₹120', 'Items at ₹129', 'Free delivery'] },
  ownly: { markup: [1, 1.03], fee: [19, 29], eta: 38, offers: ['No platform fee', ''] },
  swish: { markup: [1, 1], fee: [0, 0], eta: 12, offers: ['Free delivery'] },
}

function pick(seed: number, [lo, hi]: [number, number]) { return lo + ((seed % 1000) / 1000) * (hi - lo) }

function outletFor(place: Place, platform: FoodPlatform, loc: Location): FoodOutlet {
  const seed = hash(`${platform}|${place.name}|${loc.pincode}`)
  const app = APP[platform]
  const name = place.names?.[platform] ?? place.name
  return {
    platform, id: `${platform}-${seed.toString(36)}`, name, area: place.area,
    rating: Math.round((place.rating + ((seed >>> 4) % 3 - 1) / 10) * 10) / 10, ratingCount: 1000 + (seed % 40) * 250,
    etaMinutes: app.eta + Math.round(place.km * (platform === 'swish' ? 0 : 3)) + ((seed >>> 6) % 6), distanceKm: place.km,
    // Zomato hides the fee for some restaurants until the cart; the UI must say so.
    deliveryFee: app.fee && !(platform === 'zomato' && seed % 4 === 0) ? Math.round(pick(seed >>> 8, app.fee)) : undefined,
    offer: app.offers[(seed >>> 10) % app.offers.length] || undefined,
    open: !place.closed?.includes(platform), pureVeg: place.items.every((i) => i.veg) || undefined,
    deepLink: FOOD_PLATFORM[platform].searchUrl(name),
  }
}

function dishesAt(place: Place, platform: FoodPlatform, loc: Location, now = Date.now()): Dish[] {
  if (!place.on.includes(platform)) return []
  const outlet = outletFor(place, platform, loc)
  return place.items.flatMap((item) => {
    const seed = hash(`${platform}|${place.name}|${item.name}|${loc.pincode}`)
    // About 1 in 8 dishes is missing on an app, 1 in 10 is sold out right now.
    if (platform !== 'swish' && seed % 8 === 0) return []
    const price = Math.round((item.price * pick(seed >>> 3, APP[platform].markup)) / 5) * 5
    const strike = platform === 'swiggy_food' && seed % 5 === 0 ? Math.round(price * 1.25 / 5) * 5 : undefined
    return [{
      platform, id: `${outlet.id}-${seed.toString(36)}`, name: item.names?.[platform] ?? item.name, price, strikePrice: strike,
      veg: item.veg, bestseller: item.bestseller, available: (seed >>> 7) % 10 !== 0, outlet,
      deepLink: outlet.deepLink, fetchedAt: now, sample: true,
    }]
  })
}

/** Unknown dishes still show something: the query at two kitchens and Swish. */
function genericPlaces(query: string): Place[] {
  const name = query.trim().replace(/\b\w/g, (c) => c.toUpperCase())
  const base = 120 + (hash(query) % 18) * 10
  return [
    { name: 'Udupi Grand', area: 'Rajajinagar', km: 1.5, rating: 4.1, on: ['zomato', 'swiggy_food', 'ownly'], items: [{ name, price: base, veg: true }] },
    { name: 'Kitchen 21', area: 'Malleshwaram', km: 3.1, rating: 3.9, on: ['zomato', 'swiggy_food'], items: [{ name, price: base + 40, veg: false }, { name: `${name} (Half)`, price: base - 20, veg: false }] },
    { name: 'Swish', area: 'Swish kitchen, Malleshwaram', km: 2.9, rating: 4.3, on: ['swish'], items: [{ name: `${name} Bowl`, price: base - 10, veg: true }] },
  ]
}

export function mockDishes(platform: FoodPlatform, query: string, loc: Location): Dish[] {
  // Invent dishes only when no app's sample menu answers the query, so known queries never mix in made-up ones.
  const known = FOOD_PLATFORMS.some((p) => relevantDishes(PLACES.flatMap((pl) => dishesAt(pl, p.id, loc)), query).length > 0)
  return (known ? PLACES : genericPlaces(query)).flatMap((p) => dishesAt(p, platform, loc))
}

function delay<T>(ms: number, signal: AbortSignal, value: () => T): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => resolve(value()), ms)
    signal.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('Aborted', 'AbortError')) })
  })
}

export function createMockFoodSource(platform: FoodPlatform): FoodSource {
  let loc: Location = { pincode: '560010', label: 'Rajajinagar' }
  return {
    platform,
    async setLocation(next) { loc = next },
    search: (query, signal) => delay(400 + (hash(platform + query) % 1300), signal, () => mockDishes(platform, query, loc)),
    menu: (outlet, at, signal) => delay(300 + (hash(outlet.id) % 600), signal, () => {
      const place = PLACES.find((p) => (p.names?.[platform] ?? p.name) === outlet.name)
      return place ? dishesAt(place, platform, at) : []
    }),
  }
}

export const mockFoodSources: FoodSource[] = FOOD_PLATFORMS.map((p) => createMockFoodSource(p.id))
