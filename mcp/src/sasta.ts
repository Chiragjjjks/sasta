import { ACCOUNT_CONFIG, judgeWebSignIn, loadAccounts, saveAccounts, connectWeb, disconnectWeb, type Account } from '@/core/accounts'
import { createAmazonNowAdapter } from '@/core/adapters/amazon-now'
import { createBigbasketAdapter } from '@/core/adapters/bigbasket'
import { createBlinkitAdapter } from '@/core/adapters/blinkit'
import { createFlipkartAdapter } from '@/core/adapters/flipkart'
import { createInstamartAdapter } from '@/core/adapters/instamart'
import { createZeptoAdapter } from '@/core/adapters/zepto'
import { createSwiggyFoodSource } from '@/core/food/adapters/swiggy'
import { createZomatoSource } from '@/core/food/adapters/zomato'
import { cheapestFirst, groupDishes, orderable, quoteOrder, relevantDishes, restaurantKey, savingsFirst, usualWinner } from '@/core/food/match'
import type { Dish, DishGroup, FoodOutlet, FoodSource, RestaurantMatch } from '@/core/food/types'
import { connectMcp, disconnectMcp, hasMcpSession, isMcpPlatform } from '@/core/mcp-connect'
import { groupOffers } from '@/core/normalize'
import { APP, FOOD_PLATFORMS, PLATFORM, PLATFORMS } from '@/core/platforms'
import { MAX_TERMS, rankGroups } from '@/core/search-batch'
import { clearSearchCache, runSearch, runSources, withTimeout } from '@/core/search'
import { DEFAULT_LOCATION, loadLocation, saveLocation } from '@/core/storage'
import { PlatformSession } from '@/native/platformSession'
import { chrome } from './host/chrome'
import type { Adapter, AdapterStatus, FoodPlatform, Location, Offer, Platform, ProductGroup } from '@/core/types'

export type Strategy = 'mcp' | 'api-in-page' | 'dom' | 'none'

/** Per-platform metadata on every result (docs/ACTIONS.md "Result metadata"). */
export interface PlatformResult {
  platform: string
  name: string
  state: string
  strategy: Strategy
  count: number
  ms?: number
  error?: string
  /** App-only apps: where to open them instead. */
  openUrl?: string
}

const STATE_WORDS: Record<string, string> = {
  needs_login: 'needs sign-in (use connect_app)',
  needs_location: 'needs its delivery area chosen on its own site (use open_app)',
  blocked: 'blocked this request', timeout: 'timed out', unavailable: 'not available here', failed: 'failed',
}

const round = (n?: number) => n === undefined ? undefined : Math.round(n)

export function describeOffer(o: Offer) {
  return {
    app: PLATFORM[o.platform].name, platform: o.platform, title: o.title, price: o.price, mrp: o.mrp,
    inStock: o.inStock, etaMinutes: o.etaMinutes, url: o.deepLink,
  }
}

export function describeGroup(g: ProductGroup) {
  const name = [g.brand, g.variant].filter((s) => s && s !== 'Other').join(' ') || g.best.title
  return {
    product: name, pack: g.packLabel, cheapest: describeOffer(g.best),
    perApp: g.offers.map(describeOffer), pricePer100g: g.pricePer100g === undefined ? undefined : Math.round(g.pricePer100g * 100) / 100,
  }
}

export function describeDish(d: Dish) {
  return {
    app: APP[d.platform].name, platform: d.platform, dish: d.name, portion: d.portion, price: d.price, strikePrice: d.strikePrice,
    veg: d.veg, available: orderable(d), bestseller: d.bestseller || undefined,
    outlet: describeOutlet(d.outlet), url: d.deepLink,
  }
}

export function describeOutlet(o: FoodOutlet) {
  return {
    name: o.name, area: o.area, open: o.open, rating: o.rating, etaMinutes: o.etaMinutes, distanceKm: o.distanceKm,
    deliveryFee: o.deliveryFee, deliveryFeeShown: o.deliveryFee !== undefined, offer: o.offer, url: o.deepLink,
  }
}

export function describeDishGroup(g: DishGroup) {
  const live = g.offers.filter(orderable)
  return {
    key: g.key, restaurantKey: g.restaurantKey, restaurant: g.restaurant, area: g.area, dish: g.dish, portion: g.portion, veg: g.veg,
    // A tie is a tie: no app is "cheapest" when every app charges the same.
    verdict: live.length > 1 ? (g.saving > 0 ? `Save ₹${g.saving} on ${APP[g.best.platform].name}` : 'Same price on every app') : live.length === 1 ? (g.offers.length > 1 ? `Only orderable on ${APP[live[0].platform].name} right now` : `Only on ${APP[live[0].platform].name}`) : 'Not available now',
    saving: g.saving, best: describeDish(g.best), perApp: g.offers.map(describeDish),
  }
}

export interface SastaDeps {
  grocery?: Adapter[]
  food?: FoodSource[]
  /** Between products in price_check, like the app's several-product search (2 s after network work). */
  pauseMs?: number
  geocode?: (pincode: string) => Promise<{ lat: number; lng: number; label?: string } | null>
}

/** Sasta's read-only actions for MCP clients. Never orders, pays, or edits addresses. */
export class Sasta {
  readonly grocery: Adapter[]
  readonly food: FoodSource[]
  private lastFood = new Map<string, Dish[]>()
  private menus = new Map<string, Dish[]>()

  constructor(private deps: SastaDeps = {}) {
    this.grocery = deps.grocery ?? [createBlinkitAdapter(), createZeptoAdapter(), createInstamartAdapter(), createBigbasketAdapter(), createFlipkartAdapter(), createAmazonNowAdapter()]
    this.food = deps.food ?? [createZomatoSource(), createSwiggyFoodSource()]
  }

  location = () => loadLocation()

  async setLocation(input: { pincode?: string; lat?: number; lng?: number; label?: string }): Promise<Location> {
    const current = await loadLocation()
    let { lat, lng } = input
    const pincode = (input.pincode ?? current.pincode).replace(/\D/g, '')
    if (!/^\d{6}$/.test(pincode)) throw new Error('A pincode has 6 digits, e.g. 560010.')
    let label = input.label?.trim()
    if (lat === undefined || lng === undefined) {
      if (pincode === DEFAULT_LOCATION.pincode && !label) return this.save({ ...DEFAULT_LOCATION })
      const found = await (this.deps.geocode ?? geocodePincode)(pincode)
      if (!found) throw new Error(`Could not place ${pincode} on the map. Pass lat and lng as well.`)
      ;({ lat, lng } = found)
      label ||= found.label
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat!) > 90 || Math.abs(lng!) > 180) throw new Error('lat/lng are not valid coordinates.')
    return this.save({ pincode, lat, lng, label: label || pincode })
  }

  private async save(l: Location) { await saveLocation(l); this.lastFood.clear(); this.menus.clear(); return l }

  private async groceryStrategy(p: Platform): Promise<Strategy> {
    if (p === 'instamart') return 'mcp'
    if (p === 'zepto') return (await hasMcpSession('zepto')) ? 'mcp' : 'api-in-page'
    return 'api-in-page'
  }

  private async statuses<P extends string>(raw: Map<P, AdapterStatus<P>>, strategy: (p: P) => Promise<Strategy>): Promise<PlatformResult[]> {
    return Promise.all([...raw.values()].map(async (s) => ({
      platform: s.platform, name: APP[s.platform as Platform]?.name ?? s.platform, state: s.state, strategy: await strategy(s.platform),
      count: s.count, ms: round(s.ms), error: s.error ?? (s.state === 'done' ? undefined : STATE_WORDS[s.state]),
    })))
  }

  /** catalog.search: one product on every grocery app at the saved location. */
  async searchProducts(query: string, opts: { platforms?: Platform[]; limit?: number; fresh?: boolean; signal?: AbortSignal } = {}) {
    const q = query.trim()
    if (!q) throw new Error('Type a product, e.g. "amul butter 100 g".')
    const loc = await loadLocation()
    const adapters = opts.platforms?.length ? this.grocery.filter((a) => opts.platforms!.includes(a.platform)) : this.grocery
    const offers: Offer[] = []
    const status = new Map<Platform, AdapterStatus>()
    const started = Date.now()
    await runSearch(adapters, q, loc, opts.signal ?? new AbortController().signal, {
      onOffers: (_p, o) => offers.push(...o),
      onStatus: (s) => status.set(s.platform, s),
    }, { force: opts.fresh })
    const groups = rankGroups(groupOffers(offers), q)
    const best = groups.find((g) => g.best.inStock)
    return {
      action: 'catalog.search', query: q, location: loc,
      cheapest: best ? { ...describeOffer(best.best), product: describeGroup(best).product, pack: best.packLabel } : undefined,
      results: groups.slice(0, Math.min(opts.limit ?? 8, 30)).map(describeGroup),
      totalMatches: groups.length,
      platforms: await this.statuses(status, (p) => this.groceryStrategy(p)),
      meta: { fetchedAt: Date.now(), ms: Date.now() - started, note: 'Prices are each app\'s listed price; fees and cart offers are settled in the app.' },
    }
  }

  /** price.check: up to five products, one at a time with a pause, the best match and its price on each app. */
  async priceCheck(queries: string[], opts: { platforms?: Platform[]; fresh?: boolean; signal?: AbortSignal } = {}) {
    const terms = [...new Set(queries.map((q) => q.trim()).filter(Boolean))]
    if (!terms.length) throw new Error('Give at least one product.')
    if (terms.length > MAX_TERMS) throw new Error(`Up to ${MAX_TERMS} products at once (got ${terms.length}). Split the list.`)
    const items = []
    for (const [i, q] of terms.entries()) {
      if (i > 0) await new Promise((r) => setTimeout(r, this.deps.pauseMs ?? 2000))
      const r = await this.searchProducts(q, { platforms: opts.platforms, limit: 3, fresh: opts.fresh, signal: opts.signal })
      const [match, ...alternatives] = r.results.filter((g) => g.cheapest.inStock)
      items.push({
        query: q, match: match ? { product: match.product, pack: match.pack, cheapest: match.cheapest, perApp: match.perApp } : undefined,
        alternatives: alternatives.slice(0, 2).map((g) => ({ product: g.product, pack: g.pack, cheapest: g.cheapest })),
        platforms: r.platforms.map(({ platform, state, error }) => ({ platform, state, error })),
      })
    }
    const byApp = new Map<string, { app: string; items: number; total: number }>()
    for (const it of items) {
      if (!it.match) continue
      const b = byApp.get(it.match.cheapest.platform) ?? { app: it.match.cheapest.app, items: 0, total: 0 }
      b.items++; b.total += it.match.cheapest.price
      byApp.set(it.match.cheapest.platform, b)
    }
    const location = await loadLocation()
    return {
      action: 'price.check', location, items,
      plan: { cheapestTotal: items.reduce((t, it) => t + (it.match?.cheapest.price ?? 0), 0), byApp: [...byApp.values()], notFound: items.filter((it) => !it.match).map((it) => it.query) },
      meta: { fetchedAt: Date.now() },
    }
  }

  /** food.search: one dish or restaurant on every food app, matched dish by dish. */
  async searchFood(query: string, opts: { sort?: 'cheapest' | 'biggest_gap'; veg?: boolean; limit?: number; fresh?: boolean; signal?: AbortSignal } = {}) {
    const q = query.trim()
    if (!q) throw new Error('Type a dish or a restaurant, e.g. "chicken biryani" or "meghana".')
    const loc = await loadLocation()
    const dishes: Dish[] = []
    const status = new Map<FoodPlatform, AdapterStatus<FoodPlatform>>()
    const started = Date.now()
    await runSources(this.food, q, loc, opts.signal ?? new AbortController().signal, {
      onOffers: (_p, d) => dishes.push(...d),
      onStatus: (s) => status.set(s.platform, s),
    }, { force: opts.fresh, filter: relevantDishes })
    for (const d of dishes) {
      const key = restaurantKey(d.outlet.name)
      this.lastFood.set(key, [...(this.lastFood.get(key) ?? []).filter((x) => x.id !== d.id || x.platform !== d.platform), d])
    }
    const { groups, restaurants } = groupDishes(dishes)
    const shown = groups.filter((g) => opts.veg === undefined || g.veg === opts.veg)
    const sorted = opts.sort === 'biggest_gap' ? savingsFirst(shown) : cheapestFirst(shown)
    const live = await this.statuses(status, async () => 'api-in-page' as Strategy)
    const appOnly: PlatformResult[] = FOOD_PLATFORMS.filter((p) => !this.food.some((s) => s.platform === p.id))
      .map((p) => ({ platform: p.id, name: p.name, state: 'app_only', strategy: 'none', count: 0, error: 'No website or API; compare in the app', openUrl: p.searchUrl(q) }))
    return {
      action: 'food.search', query: q, location: loc,
      dishes: sorted.slice(0, Math.min(opts.limit ?? 10, 40)).map(describeDishGroup),
      totalDishes: shown.length,
      // Restaurants on several apps first: those are the ones a comparison can say something about.
      restaurants: [...restaurants].sort((a, b) => Object.keys(b.outlets).length - Object.keys(a.outlets).length || b.dishes.length - a.dishes.length)
        .slice(0, 10).map((r) => this.describeRestaurant(r, false)),
      platforms: [...live, ...appOnly],
      meta: { fetchedAt: Date.now(), ms: Date.now() - started, note: 'Menu prices before fees, taxes and cart offers. Swiggy does not show its delivery fee in search.' },
    }
  }

  private describeRestaurant(r: RestaurantMatch, withDishes: boolean) {
    const w = usualWinner(r)
    return {
      key: r.key, name: r.name, area: r.area,
      apps: Object.values(r.outlets).map((o) => ({ app: APP[o!.platform].name, platform: o!.platform, ...describeOutlet(o!) })),
      matchedDishes: r.dishes.filter((g) => g.offers.length > 1).length,
      verdict: w.differ === 0 ? (w.same ? `Same menu prices on every app for ${w.same} shared dishes` : 'Not on two apps yet') : `${APP[w.platform!].name} is cheaper on ${w.wins} of ${w.differ} dishes that differ`,
      ...(withDishes ? { dishes: r.dishes.map(describeDishGroup) } : {}),
    }
  }

  /** Everything seen for one restaurant (search results plus any menu read), each app's dish once. */
  private dishesFor(key: string): Dish[] {
    const seen = new Set<string>()
    return [...(this.lastFood.get(key) ?? []), ...(this.menus.get(key) ?? [])].filter((d) => {
      const id = `${d.platform}:${d.outlet.id}:${d.id}`
      return !seen.has(id) && !!seen.add(id)
    })
  }

  private async findRestaurant(nameOrKey: string, signal?: AbortSignal): Promise<RestaurantMatch | undefined> {
    const want = restaurantKey(nameOrKey)
    const pick = () => {
      const key = this.lastFood.has(nameOrKey) || this.menus.has(nameOrKey) ? nameOrKey : want
      return groupDishes(this.dishesFor(key)).restaurants.find((r) => r.key === want || r.key === nameOrKey)
    }
    let r = pick()
    if (!r) { await this.searchFood(nameOrKey, { signal }); r = pick() ?? groupDishes([...this.lastFood.values()].flat()).restaurants.find((x) => x.key.includes(want) || want.includes(x.key)) }
    return r
  }

  /** food.menu: one restaurant's dishes with each app's price side by side. */
  async restaurantMenu(restaurant: string, opts: { signal?: AbortSignal } = {}) {
    const r = await this.findRestaurant(restaurant, opts.signal)
    if (!r) throw new Error(`No restaurant called "${restaurant}" delivers to your location on Zomato or Swiggy. Try search_food first.`)
    const loc = await loadLocation()
    const failed: string[] = []
    const read = await Promise.all(this.food.map(async (src) => {
      const outlet = r.outlets[src.platform]
      if (!outlet || !src.menu) return []
      try { return await withTimeout((s) => src.menu!(outlet, loc, s), opts.signal ?? new AbortController().signal, 20000) } catch { failed.push(APP[src.platform].name); return [] }
    }))
    this.menus.set(r.key, read.flat())
    const full = groupDishes(this.dishesFor(r.key)).restaurants.find((x) => x.key === r.key) ?? r
    return {
      action: 'food.menu', location: loc, restaurant: this.describeRestaurant(full, true),
      menuErrors: failed.length ? `${failed.join(' and ')} menu could not be read; showing dishes from search` : undefined,
      meta: { fetchedAt: Date.now() },
    }
  }

  /** What one order from one restaurant costs on each app (items + known delivery fee). */
  async quoteFoodOrder(restaurant: string, items: { dish: string; qty?: number }[], opts: { signal?: AbortSignal } = {}) {
    const r = await this.findRestaurant(restaurant, opts.signal)
    if (!r) throw new Error(`No restaurant called "${restaurant}" found. Use search_food first.`)
    const full = groupDishes(this.dishesFor(r.key)).restaurants.find((x) => x.key === r.key) ?? r
    const qty: Record<string, number> = {}
    const unknown: string[] = []
    for (const it of items) {
      const want = it.dish.trim().toLowerCase()
      const g = full.dishes.find((d) => d.key === it.dish) ?? full.dishes.find((d) => d.dish.toLowerCase() === want) ?? full.dishes.find((d) => d.dish.toLowerCase().includes(want))
      if (g) qty[g.key] = (qty[g.key] ?? 0) + Math.max(1, Math.round(it.qty ?? 1)); else unknown.push(it.dish)
    }
    const quotes = quoteOrder(full, qty)
    const names = Object.fromEntries(full.dishes.map((d) => [d.key, d.dish]))
    return {
      action: 'food.quote', restaurant: full.name,
      order: Object.entries(qty).map(([k, n]) => ({ dish: names[k], qty: n })), notFound: unknown,
      quotes: quotes.map((q) => ({
        app: APP[q.platform].name, platform: q.platform, itemTotal: q.itemTotal, deliveryFee: q.deliveryFee,
        total: q.total, totalIsMinimum: q.deliveryFee === undefined, missing: q.missing.map((k) => names[k] ?? k), open: q.outlet.open, url: q.outlet.deepLink,
      })),
      note: 'Totals are menu prices plus the delivery fee the app shows. Taxes, packing and offers are settled in the app; Sasta never orders.',
    }
  }

  /** session.status for every app. */
  async platforms() {
    const accounts = await loadAccounts()
    const grocery = await Promise.all(PLATFORMS.map(async (p) => {
      const cfg = ACCOUNT_CONFIG[p.id]
      let signedIn = false
      try {
        if (isMcpPlatform(p.id)) signedIn = await hasMcpSession(p.id)
        else {
          const judged = judgeWebSignIn(cfg, (await PlatformSession.cookieNames({ urls: cfg.origins })).names, accounts[p.id]?.learnedCookies)
          signedIn = judged.status === 'connected' && (judged.verified ?? false)
        }
      } catch { /* status is best effort */ }
      return {
        platform: p.id, name: p.name, section: 'grocery', live: true, signIn: cfg.method, signedIn,
        needsSignInToSearch: p.id === 'instamart', note: cfg.note,
      }
    }))
    const food = FOOD_PLATFORMS.map((p) => ({
      platform: p.id, name: p.name, section: 'food', live: this.food.some((s) => s.platform === p.id), signIn: 'none', signedIn: false,
      needsSignInToSearch: false, note: this.food.some((s) => s.platform === p.id) ? 'Searched logged out at your location' : 'App only: no website or API to read',
    }))
    return { location: await loadLocation(), platforms: [...grocery, ...food] }
  }

  /** Opens the app's website so the user can pick the delivery area the site prices by (BigBasket, Flipkart, Zepto without MCP). */
  async openApp(platform: Platform) {
    const cfg = ACCOUNT_CONFIG[platform]
    const url = cfg.method === 'web' ? cfg.loginUrl : cfg.webFallback?.loginUrl ?? cfg.loginUrl
    await chrome.openForUser(url)
    for (const a of this.grocery) if (a.platform === platform) for (const o of [...cfg.origins, ...(cfg.webFallback?.origins ?? [])]) await chrome.pageReset(new URL(o).origin)
    clearSearchCache()
    return { platform, opened: url }
  }

  /** session.connect: the app's own sign-in page in a visible Chrome window. */
  async connect(platform: Platform): Promise<Account> {
    const acc = isMcpPlatform(platform) ? await connectMcp(platform) : await connectWeb(platform)
    const all = await loadAccounts()
    await saveAccounts({ ...all, [platform]: acc })
    return acc
  }

  async disconnect(platform: Platform): Promise<Account> {
    const acc = isMcpPlatform(platform) ? await disconnectMcp(platform) : await disconnectWeb(platform)
    const all = await loadAccounts()
    await saveAccounts({ ...all, [platform]: acc })
    return acc
  }
}

/** Pincode → coordinates through OpenStreetMap Nominatim (one request, only when no lat/lng is given). */
export async function geocodePincode(pincode: string): Promise<{ lat: number; lng: number; label?: string } | null> {
  const url = `https://nominatim.openstreetmap.org/search?postalcode=${pincode}&country=India&format=json&limit=1&addressdetails=1`
  const res = await fetch(url, { headers: { 'User-Agent': 'sasta-mcp/0.1 (personal price comparison)', 'Accept-Language': 'en-IN' } })
  if (!res.ok) return null
  const [hit] = await res.json() as { lat: string; lon: string; address?: Record<string, string> }[]
  if (!hit) return null
  const a = hit.address ?? {}
  return { lat: +hit.lat, lng: +hit.lon, label: a.suburb || a.neighbourhood || a.city_district || a.city || a.town || a.state_district }
}
