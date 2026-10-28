import { fromGroup, type CartItem } from './cart'
import { compareOffers } from './normalize'
import { PLATFORMS } from './platforms'
import type { Offer, Platform, ProductGroup } from './types'
import { formatSize } from './utils'

/** A saved product. Same identity as a cart item, so it can go straight into the cart. */
export interface ListItem {
  key: string
  brand: string
  variant: string
  variantKey: string
  sizeGrams?: number
  packLabel?: string
  query: string
  /** Usual quantity, pre-filled when ticked. */
  qty: number
  lastOffers: Offer[]
  lastSeenAt: number
  /** Cheapest in-stock price when first saved, for "price dropped". */
  savedPrice?: number
  addedAt: number
  lastPickedAt?: number
  timesPicked: number
  note?: string
  /** App the user chose for this item. Absent means "cheapest in stock". */
  pinned?: Platform
}

export interface ShoppingList {
  id: string
  name: string
  emoji: string
  items: ListItem[]
  createdAt: number
  updatedAt: number
}

export const STARTER_LISTS: { name: string; emoji: string }[] = [
  { name: 'Monthly groceries', emoji: '🛒' },
  { name: 'Office snacks', emoji: '🏢' },
  { name: 'Party', emoji: '🎉' },
]

const touch = (l: ShoppingList, now = Date.now()): ShoppingList => ({ ...l, updatedAt: now })

export function createList(lists: ShoppingList[], name: string, emoji = '🛍️', now = Date.now()): [ShoppingList[], ShoppingList] {
  const list: ShoppingList = { id: `l${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`, name: name.trim() || 'My list', emoji, items: [], createdAt: now, updatedAt: now }
  return [[...lists, list], list]
}

export function renameList(lists: ShoppingList[], id: string, name: string, emoji?: string): ShoppingList[] {
  return lists.map((l) => (l.id === id ? touch({ ...l, name: name.trim() || l.name, emoji: emoji ?? l.emoji }) : l))
}

export function deleteList(lists: ShoppingList[], id: string): ShoppingList[] {
  return lists.filter((l) => l.id !== id)
}

export function listItemFromGroup(g: ProductGroup, query: string, now = Date.now()): ListItem {
  const cheapest = g.offers.find((o) => o.inStock)
  return {
    key: g.key, brand: g.brand, variant: g.variant, variantKey: g.variantKey, sizeGrams: g.sizeGrams, packLabel: g.packLabel, query,
    qty: 1, lastOffers: g.offers, lastSeenAt: now, savedPrice: cheapest?.price, addedAt: now, timesPicked: 0,
  }
}

export function isSaved(lists: ShoppingList[], key: string): boolean {
  return lists.some((l) => l.items.some((i) => i.key === key))
}

export function listsContaining(lists: ShoppingList[], key: string): string[] {
  return lists.filter((l) => l.items.some((i) => i.key === key)).map((l) => l.id)
}

/** Adds the product to the list, or refreshes its prices if it is already there. */
export function saveToList(lists: ShoppingList[], listId: string, item: ListItem): ShoppingList[] {
  return lists.map((l) => {
    if (l.id !== listId) return l
    const existing = l.items.find((i) => i.key === item.key)
    const items = existing
      ? l.items.map((i) => (i.key === item.key ? { ...i, lastOffers: item.lastOffers, lastSeenAt: item.lastSeenAt } : i))
      : [...l.items, item]
    return touch({ ...l, items })
  })
}

export function removeFromList(lists: ShoppingList[], listId: string, key: string): ShoppingList[] {
  return lists.map((l) => (l.id === listId ? touch({ ...l, items: l.items.filter((i) => i.key !== key) }) : l))
}

export function setItemQty(lists: ShoppingList[], listId: string, key: string, qty: number): ShoppingList[] {
  return lists.map((l) => (l.id === listId ? { ...l, items: l.items.map((i) => (i.key === key ? { ...i, qty: Math.max(1, qty) } : i)) } : l))
}

export function moveItem(lists: ShoppingList[], fromId: string, toId: string, key: string, copy = false): ShoppingList[] {
  const item = lists.find((l) => l.id === fromId)?.items.find((i) => i.key === key)
  if (!item || fromId === toId) return lists
  const added = saveToList(lists, toId, item)
  return copy ? added : removeFromList(added, fromId, key)
}

export const itemTitle = (i: Pick<ListItem, 'brand' | 'variant'>) => `${i.brand !== 'Other' && !i.variant.startsWith(i.brand) ? `${i.brand} ` : ''}${i.variant}`
export const itemPack = (i: Pick<ListItem, 'packLabel' | 'sizeGrams'>) => i.packLabel ?? formatSize(i.sizeGrams)

/** One offer per app, cheapest first (ties: faster delivery), then the apps where it is out of stock. */
export function rankedOffers(item: Pick<ListItem, 'lastOffers'>): { inStock: Offer[]; outOfStock: Platform[] } {
  const best = new Map<Platform, Offer>()
  for (const o of [...item.lastOffers].sort(compareOffers)) if (!best.has(o.platform)) best.set(o.platform, o)
  const all = [...best.values()]
  return { inStock: all.filter((o) => o.inStock && o.price > 0), outOfStock: all.filter((o) => !o.inStock).map((o) => o.platform) }
}

/** The app this item will be bought from: the user's pick while it is in stock, else the cheapest. */
export function chosenListOffer(item: ListItem): Offer | undefined {
  const { inStock } = rankedOffers(item)
  return (item.pinned && inStock.find((o) => o.platform === item.pinned)) || inStock[0]
}

export interface PlanGroup { platform: Platform; lines: { item: ListItem; offer: Offer; total: number }[]; total: number; etaMinutes?: number }
export interface ListPlan { total: number; groups: PlanGroup[]; missing: ListItem[]; available: number; count: number; pinned: boolean }

/** What to order where: items grouped by the app each comes from, biggest spend first. */
export function listPlan(items: ListItem[]): ListPlan {
  const byApp = new Map<Platform, PlanGroup>()
  const missing: ListItem[] = []
  for (const item of items) {
    const offer = chosenListOffer(item)
    if (!offer) { missing.push(item); continue }
    const g = byApp.get(offer.platform) ?? { platform: offer.platform, lines: [], total: 0 }
    g.lines.push({ item, offer, total: offer.price * item.qty })
    g.total += offer.price * item.qty
    if (offer.etaMinutes) g.etaMinutes = Math.max(g.etaMinutes ?? 0, offer.etaMinutes)
    byApp.set(offer.platform, g)
  }
  const groups = [...byApp.values()].sort((a, b) => b.total - a.total)
  return { total: groups.reduce((s, g) => s + g.total, 0), groups, missing, available: items.length - missing.length, count: items.length, pinned: items.some((i) => !!i.pinned) }
}

export interface SingleAppTotal { platform: Platform; covered: number; total: number }

/** Everything from one app: apps that have the most items first, then the cheapest. */
export function singleAppTotals(items: ListItem[]): SingleAppTotal[] {
  return PLATFORMS.map(({ id }) => {
    let covered = 0, total = 0
    for (const item of items) {
      const offer = rankedOffers(item).inStock.find((o) => o.platform === id)
      if (offer) { covered++; total += offer.price * item.qty }
    }
    return { platform: id, covered, total }
  }).filter((x) => x.covered > 0).sort((a, b) => b.covered - a.covered || a.total - b.total)
}

/** Buy one item from a chosen app (or back to the cheapest with undefined). */
export function pinItem(lists: ShoppingList[], listId: string, key: string, platform: Platform | undefined): ShoppingList[] {
  return lists.map((l) => (l.id === listId ? touch({ ...l, items: l.items.map((i) => (i.key === key ? { ...i, pinned: platform } : i)) }) : l))
}

/** Buy every item from one app where it has it, or clear every choice with undefined. */
export function pinAllItems(lists: ShoppingList[], listId: string, platform: Platform | undefined): ShoppingList[] {
  return lists.map((l) => (l.id === listId ? touch({ ...l, items: l.items.map((i) => ({ ...i, pinned: platform })) }) : l))
}

export function currentPrice(item: ListItem): number | undefined {
  return item.lastOffers.filter((o) => o.inStock).sort((a, b) => a.price - b.price)[0]?.price
}

/** Rupees the cheapest price fell since the product was saved (0 if it did not). */
export function priceDrop(item: ListItem): number {
  const now = currentPrice(item)
  return item.savedPrice !== undefined && now !== undefined && now < item.savedPrice ? item.savedPrice - now : 0
}

export function estimateTotal(items: ListItem[]): number {
  return items.reduce((s, i) => s + (currentPrice(i) ?? 0) * i.qty, 0)
}

/** Keys picked on the most recent "Add to cart" from this list. */
export function sameAsLastTime(list: ShoppingList): string[] {
  const last = Math.max(0, ...list.items.map((i) => i.lastPickedAt ?? 0))
  return last ? list.items.filter((i) => i.lastPickedAt === last).map((i) => i.key) : []
}

export type ListSort = 'saved' | 'often' | 'cheapest' | 'az'

export function sortItems(items: ListItem[], sort: ListSort): ListItem[] {
  const s = [...items]
  if (sort === 'often') s.sort((a, b) => b.timesPicked - a.timesPicked || (b.lastPickedAt ?? 0) - (a.lastPickedAt ?? 0))
  if (sort === 'cheapest') s.sort((a, b) => (currentPrice(a) ?? Infinity) - (currentPrice(b) ?? Infinity))
  if (sort === 'az') s.sort((a, b) => `${a.brand} ${a.variant}`.localeCompare(`${b.brand} ${b.variant}`))
  return s
}

/** Cart items for the picked products, using each one's list quantity. */
export function toCartItems(list: ShoppingList, keys: string[], now = Date.now()): CartItem[] {
  return list.items.filter((i) => keys.includes(i.key)).map((i) => ({
    ...fromGroup({ key: i.key, brand: i.brand, variant: i.variant, variantKey: i.variantKey, sizeGrams: i.sizeGrams, packLabel: i.packLabel, offers: i.lastOffers, best: i.lastOffers[0] }, i.query),
    qty: i.qty,
    pinned: i.pinned,
    updatedAt: i.lastSeenAt ?? now,
  }))
}

/** Records the pick so "Same as last time" and "Often bought" work next time. */
export function markPicked(lists: ShoppingList[], listId: string, keys: string[], now = Date.now()): ShoppingList[] {
  return lists.map((l) => (l.id !== listId ? l : touch({
    ...l,
    items: l.items.map((i) => (keys.includes(i.key) ? { ...i, lastPickedAt: now, timesPicked: i.timesPicked + 1 } : i)),
  }, now)))
}

/** Updates saved prices from freshly fetched cart items (after a refresh). */
export function updatePrices(lists: ShoppingList[], listId: string, fresh: CartItem[], now = Date.now()): ShoppingList[] {
  const byKey = new Map(fresh.map((c) => [c.key, c]))
  return lists.map((l) => (l.id !== listId ? l : {
    ...l,
    items: l.items.map((i) => { const c = byKey.get(i.key); return c && c.updatedAt >= now ? { ...i, lastOffers: c.offers, lastSeenAt: c.updatedAt } : i }),
  }))
}

export function shareText(list: ShoppingList, keys?: string[]): string {
  const items = keys ? list.items.filter((i) => keys.includes(i.key)) : list.items
  const lines = items.map((i) => `• ${i.brand === 'Other' ? '' : `${i.brand} `}${i.variant}${i.packLabel ? ` ${i.packLabel}` : i.sizeGrams ? ` ${i.sizeGrams} g` : ''} × ${i.qty}`)
  return `${list.emoji} ${list.name}\n${lines.join('\n')}`
}

export function exportLists(lists: ShoppingList[]): string {
  return JSON.stringify({ app: 'sasta', kind: 'lists', version: 1, exportedAt: new Date().toISOString(), lists }, null, 2)
}

/** Merges an export into the current lists. Lists with the same id are replaced. */
export function importLists(current: ShoppingList[], text: string): ShoppingList[] {
  const data = JSON.parse(text) as { app?: string; kind?: string; lists?: ShoppingList[] } | null
  if (!data || data.app !== 'sasta' || data.kind !== 'lists' || !Array.isArray(data.lists) || !data.lists.every(isShoppingList)) {
    throw new Error('This file is not a valid Sasta lists export. Your lists have not changed.')
  }
  const incoming = new Map(data.lists.map((l) => [l.id, l]))
  if (incoming.size !== data.lists.length) throw new Error('This backup has duplicate list IDs. Your lists have not changed.')
  return [...current.filter((l) => !incoming.has(l.id)), ...data.lists]
}

/** Check nested data before a backup reaches native screens or cart calculations. */
export function isShoppingList(value: unknown): value is ShoppingList {
  if (!value || typeof value !== 'object') return false
  const l = value as ShoppingList
  return typeof l.id === 'string' && !!l.id && typeof l.name === 'string' && typeof l.emoji === 'string'
    && Number.isFinite(l.createdAt) && Number.isFinite(l.updatedAt) && Array.isArray(l.items)
    && l.items.every((i) => i && ['key', 'brand', 'variant', 'variantKey', 'query'].every((k) => typeof i[k as keyof ListItem] === 'string')
      && Number.isInteger(i.qty) && i.qty > 0 && Number.isFinite(i.lastSeenAt) && Number.isFinite(i.addedAt)
      && Number.isFinite(i.timesPicked) && Array.isArray(i.lastOffers)
      && (i.pinned === undefined || PLATFORMS.some((p) => p.id === i.pinned))
      && i.lastOffers.every((o) => o && PLATFORMS.some((p) => p.id === o.platform)
        && typeof o.title === 'string' && typeof o.deepLink === 'string' && typeof o.inStock === 'boolean'
        && Number.isFinite(o.price) && o.price >= 0 && Number.isFinite(o.fetchedAt)))
}
