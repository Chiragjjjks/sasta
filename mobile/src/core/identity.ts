import { groupOffers } from './normalize'
import type { CartItem } from './cart'
import type { ListItem, ShoppingList } from './lists'
import type { Offer } from './types'

/** Preserve saved quantities/names while updating identities to exact, unit-aware packs. */
function identity(offers: Offer[], pinned?: string) {
  const selected = offers.find(o => o.platform === pinned && o.inStock) ?? offers.find(o => o.inStock) ?? offers[0]
  if (!selected) return undefined
  return groupOffers([selected, ...offers.filter(o => o !== selected)])[0]
}
export function migrateCart(items: CartItem[]): CartItem[] {
  if (!Array.isArray(items)) return []
  return items.filter(i => i && Array.isArray(i.offers)).map(i => {
    const g = identity(i.offers, i.pinned)
    return g ? { ...i, key: g.key, sizeGrams: g.sizeGrams, packLabel: g.packLabel, offers: g.offers } : i
  })
}
export function migrateLists(lists: ShoppingList[]): ShoppingList[] {
  if (!Array.isArray(lists)) return []
  return lists.filter(l => l && Array.isArray(l.items)).map(l => ({ ...l, items: l.items.map((i: ListItem) => {
    const g = identity(i.lastOffers ?? [])
    return g ? { ...i, key: g.key, sizeGrams: g.sizeGrams, packLabel: g.packLabel, lastOffers: g.offers } : i
  }) }))
}
