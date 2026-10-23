import type { CartItem } from './cart'
import { PLATFORMS } from './platforms'
import type { Platform } from './types'

/**
 * Delivery and handling fees per app, learned from a real bill (live) so the cart can pick the
 * cheapest way to buy everything after fees, not just the cheapest sticker prices.
 */
export interface FeeRule {
  platform: Platform
  /** Delivery fee below the free-delivery threshold. */
  delivery: number
  /** Order value at or above which delivery is free. */
  freeAbove?: number
  /** Handling / packaging fee charged on every order. */
  handling: number
  smallCartFee?: number
  smallCartBelow?: number
  source: 'live'
  fetchedAt: number
}

export type FeeRules = Partial<Record<Platform, FeeRule>>

export interface PlatformBill {
  platform: Platform
  itemsTotal: number
  delivery: number
  handling: number
  other: number
  total: number
  known: boolean
}

export function feesFor(rule: FeeRule | undefined, itemsTotal: number): Omit<PlatformBill, 'platform' | 'itemsTotal' | 'total'> {
  if (!rule || itemsTotal <= 0) return { delivery: 0, handling: 0, other: 0, known: !!rule }
  const delivery = rule.freeAbove !== undefined && itemsTotal >= rule.freeAbove ? 0 : rule.delivery
  const other = rule.smallCartFee && rule.smallCartBelow && itemsTotal < rule.smallCartBelow ? rule.smallCartFee : 0
  return { delivery, handling: rule.handling, other, known: true }
}

/** Reads Blinkit's /v5/carts bill into a fee rule. */
export function blinkitRuleFromBill(json: unknown, now = Date.now()): FeeRule | undefined {
  const b = (json as { cart_data?: { bill_details?: Record<string, unknown> } })?.cart_data?.bill_details
  if (!b) return undefined
  const flat = b.flat_delivery_charge_attributes as { flat_delivery_charge?: number; free_delivery_mov?: number } | undefined
  const surge = b.surge_charge_v2 as { small_cart_fee?: number; small_cart_mov?: number } | undefined
  const delivery = flat?.flat_delivery_charge ?? (typeof b.delivery_charge === 'number' ? b.delivery_charge : 0)
  return {
    platform: 'blinkit',
    delivery,
    freeAbove: flat?.free_delivery_mov && flat.free_delivery_mov > 1 ? flat.free_delivery_mov : undefined,
    handling: typeof b.additional_charge === 'number' ? b.additional_charge : 0,
    smallCartFee: surge?.small_cart_fee || undefined,
    smallCartBelow: surge?.small_cart_mov || undefined,
    source: 'live',
    fetchedAt: now,
  }
}

type Assignment = Record<string, Platform>

function offerOn(item: CartItem, p: Platform) {
  return item.offers.find((o) => o.platform === p && o.inStock)
}

export function billsFor(items: CartItem[], assign: Assignment, rules: FeeRules): PlatformBill[] {
  const byPlatform = new Map<Platform, number>()
  for (const item of items) {
    const p = assign[item.key]
    const offer = p && offerOn(item, p)
    if (offer) byPlatform.set(p, (byPlatform.get(p) ?? 0) + offer.price * item.qty)
  }
  return [...byPlatform].map(([platform, itemsTotal]) => {
    const f = feesFor(rules[platform], itemsTotal)
    return { platform, itemsTotal, ...f, total: itemsTotal + f.delivery + f.handling + f.other }
  })
}

export function grandTotal(bills: PlatformBill[]): number {
  return bills.reduce((s, b) => s + b.total, 0)
}

/**
 * Cheapest way to buy the cart once fees count. Starts from the cheapest-per-item mix and every
 * single-app basket, then moves items between apps while that lowers the total. Exact for small
 * carts in practice; never worse than the starting candidates.
 */
export function cheapestAfterFees(items: CartItem[], rules: FeeRules): { assign: Assignment; total: number } {
  const avail = items.map((i) => ({ key: i.key, options: PLATFORMS.map((p) => p.id).filter((p) => offerOn(i, p)) }))
  const cheapestFor = (i: CartItem) => [...i.offers].filter((o) => o.inStock).sort((a, b) => a.price - b.price)[0]?.platform
  const start: Assignment[] = [Object.fromEntries(items.flatMap((i) => { const p = cheapestFor(i); return p ? [[i.key, p]] : [] }))]
  for (const { id } of PLATFORMS) {
    start.push(Object.fromEntries(items.flatMap((i) => { const p = offerOn(i, id) ? id : cheapestFor(i); return p ? [[i.key, p]] : [] })))
  }
  const score = (a: Assignment) => grandTotal(billsFor(items, a, rules))
  let best = start[0]
  let bestScore = score(best)
  for (const s of start.slice(1)) { const v = score(s); if (v < bestScore) { best = s; bestScore = v } }

  for (let round = 0; round < 50; round++) {
    let improved = false
    for (const { key, options } of avail) {
      for (const p of options) {
        if (best[key] === p) continue
        const trial = { ...best, [key]: p }
        const v = score(trial)
        if (v < bestScore) { best = trial; bestScore = v; improved = true }
      }
    }
    if (!improved) break
  }
  return { assign: best, total: bestScore }
}
