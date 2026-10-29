import { normalizeText, similarity } from '../normalize'
import { FOOD_PLATFORMS } from '../platforms'
import type { Dish, DishGroup, FoodOutlet, FoodPlatform, RestaurantMatch } from './types'

/**
 * Food matching. The same restaurant often prices the same dish differently on each app, so
 * dishes are matched within one restaurant: same restaurant name, same dish, same portion.
 * Different restaurants' dishes are never merged; they are only ranked side by side.
 */

/** Spellings menus use for the same thing, folded to one word. */
const SPELLINGS: [RegExp, string][] = [
  [/\b(biriyani|briyani|biriani|biryanee|biryani)\b/g, 'biryani'],
  [/\b(dosai|dose|dosa)\b/g, 'dosa'],
  [/\bmasale\b/g, 'masala'],
  [/\bchkn\b/g, 'chicken'],
  [/\b(panner|paneer|pannir)\b/g, 'paneer'],
  [/\b(gobhi|gobi)\b/g, 'gobi'],
  [/\b(kabab|kabob|kebab)\b/g, 'kebab'],
  [/\b(shawerma|shawarma)\b/g, 'shawarma'],
  [/\b(idly|idli)\b/g, 'idli'],
  [/\b(vadai|wada|vada)\b/g, 'vada'],
  [/\b(mutter|matar)\b/g, 'matar'],
  [/\b(noodle|noodles)\b/g, 'noodles'],
]

const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'with', 'in'])

/** Lowercase words with menu spellings folded and simple plurals dropped ("momos" → "momo"). */
export function foodWords(text: string): string[] {
  let s = normalizeText(text).replace(/'/g, '')
  for (const [re, to] of SPELLINGS) s = s.replace(re, to)
  return s.split(' ').filter(Boolean).map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w))
}

const PORTIONS: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/\bserves?\s*(\d+)\b/, (m) => `serves ${m[1]}`],
  [/\b(\d+)\s*(?:pcs?|pieces?|piece|nos?)\b/, (m) => `${m[1]} pc`],
  [/\b(\d+(?:\.\d+)?)\s*(ml|ltr?|litres?|liters?|gms?|grams?|g|kg)\b/, (m) => `${m[1]} ${m[2].startsWith('l') ? 'l' : m[2].startsWith('k') ? 'kg' : m[2] === 'ml' ? 'ml' : 'g'}`],
  [/\b(\d+)\s*(?:inch|inches|in)\b/, (m) => `${m[1]} inch`],
  [/\b(half|quarter|full|single|double|regular|medium|large|small|mini|jumbo|family)\b/, (m) => m[1]],
]

/** Portions that mean "the default plate", so a dish that names none still matches them. */
const NEUTRAL = new Set(['serves 1', 'regular', 'single', '1 pc'])

/** Splits a dish into its base name and portion: "Chicken Biryani (Serves 2)" → "chicken biryani" + "serves 2". */
export function dishKey(d: Pick<Dish, 'name' | 'portion'>): { base: string; portion?: string } {
  let text = normalizeText(`${d.name} ${d.portion ?? ''}`)
  let portion: string | undefined
  for (const [re, label] of PORTIONS) {
    const m = text.match(re)
    if (!m) continue
    portion ??= label(m)
    text = text.replace(re, ' ')
  }
  const base = foodWords(text).filter((w) => !STOP.has(w)).join(' ')
  return { base: base || normalizeText(d.name), portion }
}

export function portionsMatch(a?: string, b?: string): boolean {
  if (a === b) return true
  if (!a) return NEUTRAL.has(b!)
  if (!b) return NEUTRAL.has(a)
  return false
}

const GENERIC = new Set(['the', 'restaurant', 'restaurants', 'hotel', 'pvt', 'ltd', 'and'])

/** Restaurant name without the branch: "Hotel Empire - Rajajinagar" and "Empire Restaurant" → "empire". */
export function restaurantKey(name: string): string {
  const head = name.split(/\s+[-|–—]\s+|\s*\(/)[0]
  const words = normalizeText(head).replace(/'/g, '').split(' ').filter(Boolean)
  return words.filter((w) => !GENERIC.has(w)).join(' ') || words.join(' ')
}

/** The restaurant name as people say it, without the branch. */
export function restaurantName(name: string): string {
  return name.split(/\s+[-|–—]\s+|\s*\(/)[0].trim() || name
}

export const orderable = (d: Dish) => d.available && d.outlet.open

function hasWord(words: string[], term: string): boolean {
  return words.some((w) => w === term || (term.length >= 3 && w.startsWith(term)))
}

/** How well a dish answers the query; -1 when it does not. Every query word must be in the dish or its restaurant. */
export function dishRelevance(d: Dish, query: string): number {
  const terms = foodWords(query).filter((w) => !STOP.has(w) && w.length > 1)
  if (!terms.length) return 0
  const dish = foodWords(d.name), place = foodWords(d.outlet.name)
  let score = 0
  for (const t of terms) {
    if (hasWord(dish, t)) score += 2
    else if (hasWord(place, t)) score += 1
    else return -1
  }
  return score + (dish.slice(0, terms.length).join(' ') === terms.join(' ') ? 1 : 0)
}

/** True when every query word is in the dish's own name, not just its restaurant's. */
export function namesDish(d: Dish, query: string): boolean {
  const terms = foodWords(query).filter((w) => !STOP.has(w) && w.length > 1)
  const dish = foodWords(d.name)
  return terms.every((t) => hasWord(dish, t))
}

/** True when every query word is in the restaurant's name: the user searched for a place. */
export function namesRestaurant(name: string, query: string): boolean {
  const terms = foodWords(query).filter((w) => !STOP.has(w) && w.length > 1)
  const place = foodWords(name)
  return terms.length > 0 && terms.every((t) => hasWord(place, t))
}

/** Keeps dishes that answer the query, orderable and most relevant first. */
export function relevantDishes(dishes: Dish[], query: string): Dish[] {
  return dishes
    .map((d) => ({ d, r: Number.isFinite(d.price) && d.price > 0 ? dishRelevance(d, query) : -1 }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => Number(orderable(b.d)) - Number(orderable(a.d)) || b.r - a.r || a.d.price - b.d.price)
    .map((x) => x.d)
}

const ORDER = new Map(FOOD_PLATFORMS.map((p, n) => [p.id, n]))

function compareDishes(a: Dish, b: Dish): number {
  return Number(orderable(b)) - Number(orderable(a)) || a.price - b.price || ORDER.get(a.platform)! - ORDER.get(b.platform)!
}

/** One outlet per app per restaurant: the nearest when an app lists several branches. */
function nearestOutlets(dishes: Dish[]): Map<FoodPlatform, FoodOutlet> {
  const out = new Map<FoodPlatform, FoodOutlet>()
  for (const d of dishes) {
    const cur = out.get(d.platform)
    const far = (o: FoodOutlet) => o.distanceKm ?? o.etaMinutes ?? Infinity
    if (!cur || (cur.id !== d.outlet.id && far(d.outlet) < far(cur))) out.set(d.platform, d.outlet)
  }
  return out
}

interface Cluster { base: string; portion?: string; veg?: boolean; members: Dish[] }

/**
 * Groups dishes into restaurants, and each restaurant's dishes across apps. Input order is kept
 * as the relevance order: the first dish of a group sets where the group appears.
 */
export function groupDishes(dishes: Dish[]): { groups: DishGroup[]; restaurants: RestaurantMatch[] } {
  const byPlace = new Map<string, Dish[]>()
  for (const d of dishes) {
    const k = restaurantKey(d.outlet.name)
    if (!k) continue
    byPlace.set(k, [...(byPlace.get(k) ?? []), d])
  }
  const groups: DishGroup[] = []
  const restaurants: RestaurantMatch[] = []
  for (const [key, all] of byPlace) {
    const outlets = nearestOutlets(all)
    const mine = all.filter((d) => outlets.get(d.platform)?.id === d.outlet.id)
    const clusters: Cluster[] = []
    for (const d of mine) {
      const k = dishKey(d)
      let best: Cluster | undefined
      let score = 0
      for (const c of clusters) {
        if (c.members.some((m) => m.platform === d.platform)) continue
        if (!portionsMatch(c.portion, k.portion)) continue
        if (c.veg !== undefined && d.veg !== undefined && c.veg !== d.veg) continue
        const s = c.base === k.base ? 1 : similarity(c.base, k.base)
        if (s >= 0.8 && s > score) { best = c; score = s }
      }
      if (best) {
        best.members.push(d)
        best.portion ??= k.portion
        best.veg ??= d.veg
      } else clusters.push({ base: k.base, portion: k.portion, veg: d.veg, members: [d] })
    }
    const first = [...outlets.values()].sort((a, b) => ORDER.get(a.platform)! - ORDER.get(b.platform)!)[0]
    const name = restaurantName(first.name)
    const area = [...outlets.values()].find((o) => o.area)?.area
    const own = clusters.map((c): DishGroup => {
      const offers = [...c.members].sort(compareDishes)
      const prices = offers.filter(orderable).map((o) => o.price)
      const label = [...c.members].sort((a, b) => a.name.length - b.name.length)[0]
      return {
        key: `${key}|${c.base}|${c.portion ?? ''}`, restaurantKey: key, restaurant: name, area,
        dish: label.name, portion: c.members.find((m) => m.portion)?.portion, veg: c.veg,
        offers, best: offers[0], saving: prices.length > 1 ? Math.max(...prices) - Math.min(...prices) : 0,
      }
    })
    groups.push(...own)
    restaurants.push({ key, name, area, outlets: Object.fromEntries(outlets), dishes: own })
  }
  return { groups, restaurants }
}

/** Same restaurant on two or more apps, biggest saving first. */
export function savingsFirst(groups: DishGroup[]): DishGroup[] {
  return groups.filter((g) => g.saving > 0).sort((a, b) => b.saving - a.saving || a.best.price - b.best.price)
}

/** Every dish, orderable and cheapest first. */
export function cheapestFirst(groups: DishGroup[]): DishGroup[] {
  return [...groups].sort((a, b) => compareDishes(a.best, b.best))
}

export interface OrderQuote {
  platform: FoodPlatform
  outlet: FoodOutlet
  itemTotal: number
  /** Undefined when the app does not show its delivery fee before the cart. */
  deliveryFee?: number
  /** Items plus the known delivery fee. Taxes, packing and cart offers are settled in the app. */
  total: number
  /** Picked dishes this app does not have, or has sold out. */
  missing: string[]
}

/** What one order (dish key → quantity) costs from this restaurant on each app: complete and cheapest first. */
export function quoteOrder(r: RestaurantMatch, qty: Record<string, number>): OrderQuote[] {
  const picks = r.dishes.filter((g) => (qty[g.key] ?? 0) > 0)
  return FOOD_PLATFORMS.flatMap(({ id }) => {
    const outlet = r.outlets[id]
    if (!outlet) return []
    let itemTotal = 0
    const missing: string[] = []
    for (const g of picks) {
      const d = g.offers.find((o) => o.platform === id && orderable(o))
      if (d) itemTotal += d.price * qty[g.key]
      else missing.push(g.key)
    }
    return [{ platform: id, outlet, itemTotal, deliveryFee: outlet.deliveryFee, total: itemTotal + (outlet.deliveryFee ?? 0), missing }]
  }).sort((a, b) => Number(!a.outlet.open) - Number(!b.outlet.open) || a.missing.length - b.missing.length || a.total - b.total)
}
