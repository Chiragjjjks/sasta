import { compareOffers, groupOffers } from './normalize'
import { PLATFORMS } from './platforms'
import { runSearch } from './search'
import type { Adapter, Location, Offer, Platform, ProductGroup } from './types'

/** One product in the cart. Keeps every platform's offer so the cheapest can be re-picked at any time. */
export interface CartItem {
  key: string
  brand: string
  variant: string
  variantKey: string
  sizeGrams?: number
  query: string
  qty: number
  offers: Offer[]
  /** Platform the user pinned for this item. Absent means "cheapest in stock". */
  pinned?: Platform
  updatedAt: number
}

export interface CartLine {
  item: CartItem
  offer?: Offer // undefined when no platform has it in stock
  lineTotal: number
  lineMrp: number
}

export interface CartSummary {
  lines: CartLine[]
  total: number
  mrpTotal: number
  savingsVsMrp: number
  itemCount: number
  platforms: Platform[]
  unavailable: CartItem[]
}

export interface SingleAppOption {
  platform: Platform
  covered: number
  total: number
  missing: CartItem[]
}

export function fromGroup(group: ProductGroup, query: string): CartItem {
  return {
    key: group.key,
    brand: group.brand,
    variant: group.variant,
    variantKey: group.variantKey,
    sizeGrams: group.sizeGrams,
    query,
    qty: 1,
    offers: group.offers,
    updatedAt: Date.now(),
  }
}

export function cheapestOffer(item: CartItem): Offer | undefined {
  return [...item.offers].filter((o) => o.inStock).sort(compareOffers)[0]
}

/** The pinned platform if it still has stock, otherwise the cheapest in-stock offer. */
export function chosenOffer(item: CartItem): Offer | undefined {
  if (item.pinned) {
    const pinned = item.offers.find((o) => o.platform === item.pinned && o.inStock)
    if (pinned) return pinned
  }
  return cheapestOffer(item)
}

export function summarize(items: CartItem[]): CartSummary {
  const lines: CartLine[] = items.map((item) => {
    const offer = chosenOffer(item)
    return {
      item,
      offer,
      lineTotal: offer ? offer.price * item.qty : 0,
      lineMrp: offer ? (offer.mrp ?? offer.price) * item.qty : 0,
    }
  })
  const total = lines.reduce((s, l) => s + l.lineTotal, 0)
  const mrpTotal = lines.reduce((s, l) => s + l.lineMrp, 0)
  const platforms = [...new Set(lines.flatMap((l) => (l.offer ? [l.offer.platform] : [])))]
  return {
    lines,
    total,
    mrpTotal,
    savingsVsMrp: mrpTotal - total,
    itemCount: items.reduce((s, i) => s + i.qty, 0),
    platforms,
    unavailable: lines.filter((l) => !l.offer).map((l) => l.item),
  }
}

/** Total if the whole cart came from one app. Full-coverage apps first, then cheapest. */
export function singleAppOptions(items: CartItem[]): SingleAppOption[] {
  return PLATFORMS.map(({ id }) => {
    let total = 0
    const missing: CartItem[] = []
    for (const item of items) {
      const offer = item.offers.find((o) => o.platform === id && o.inStock)
      if (offer) total += offer.price * item.qty
      else missing.push(item)
    }
    return { platform: id, covered: items.length - missing.length, total, missing }
  })
    .filter((o) => o.covered > 0)
    .sort((a, b) => b.covered - a.covered || a.total - b.total)
}

export function addItem(items: CartItem[], next: CartItem): CartItem[] {
  const existing = items.find((i) => i.key === next.key)
  if (existing) return items.map((i) => (i.key === next.key ? { ...i, qty: i.qty + 1, offers: next.offers, updatedAt: next.updatedAt } : i))
  return [...items, next]
}

export function setQty(items: CartItem[], key: string, qty: number): CartItem[] {
  return qty <= 0 ? items.filter((i) => i.key !== key) : items.map((i) => (i.key === key ? { ...i, qty } : i))
}

export function pin(items: CartItem[], key: string, platform: Platform | undefined): CartItem[] {
  return items.map((i) => (i.key === key ? { ...i, pinned: platform } : i))
}

/** Pin every item to one app (items that app lacks fall back to cheapest), or clear all pins. */
export function pinAll(items: CartItem[], platform: Platform | undefined): CartItem[] {
  return items.map((i) => ({ ...i, pinned: platform }))
}

/** Re-runs each distinct query and swaps in fresh offers for items whose pack is still found. */
export async function refreshCart(items: CartItem[], adapters: Adapter[], loc: Location, signal: AbortSignal): Promise<CartItem[]> {
  const queries = [...new Set(items.map((i) => i.query))]
  const fresh = new Map<string, ProductGroup>()
  // All queries at once: refresh time is the slowest search, not the sum.
  await Promise.all(queries.map(async (q) => {
    const offers: Offer[] = []
    await runSearch(adapters, q, loc, signal, { onStatus: () => {}, onOffers: (_, o) => offers.push(...o) }, { force: true })
    for (const g of groupOffers(offers)) fresh.set(g.key, g)
  }))
  if (signal.aborted) return items
  return items.map((i) => {
    const g = fresh.get(i.key)
    return g ? { ...i, offers: g.offers, updatedAt: Date.now() } : i
  })
}

/** The cart with every pin cleared, so each item comes from its cheapest in-stock app. */
export function cheapestCart(items: CartItem[]): CartItem[] {
  return pinAll(items, undefined)
}

/** How much more the current selection costs than the cheapest cart (0 when it is the cheapest). */
export function extraOverCheapest(items: CartItem[]): number {
  return summarize(items).total - summarize(cheapestCart(items)).total
}

/** Adds several items, increasing quantity for packs already in the cart. Never empties the cart. */
export function addItems(items: CartItem[], next: CartItem[]): CartItem[] {
  let out = items
  for (const n of next) {
    const existing = out.find((i) => i.key === n.key)
    out = existing
      ? out.map((i) => (i.key === n.key ? { ...i, qty: i.qty + n.qty, offers: n.offers, updatedAt: Math.max(i.updatedAt, n.updatedAt) } : i))
      : [...out, n]
  }
  return out
}
