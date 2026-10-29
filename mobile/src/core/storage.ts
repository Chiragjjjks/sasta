import { Preferences } from '@/native/kv'
import type { Location } from './types'
import { migrateCart, migrateLists } from './identity'

const RECENTS = 'sasta.recents'
const LOCATION = 'sasta.location'

export const DEFAULT_RECENTS = ['lays', 'lays cream onion', 'lays magic masala', 'lays chile', 'maggi']
export const DEFAULT_LOCATION: Location = { pincode: '560010', label: 'Rajajinagar', lat: 12.9915, lng: 77.5544 }

async function get<T>(key: string, fallback: T): Promise<T> {
  try {
    const { value } = await Preferences.get({ key })
    return value ? (JSON.parse(value) as T) : fallback
  } catch {
    return fallback
  }
}

async function set(key: string, value: unknown) {
  try { await Preferences.set({ key, value: JSON.stringify(value) }) } catch { /* storage is best effort */ }
}

export const loadRecents = () => get<string[]>(RECENTS, DEFAULT_RECENTS)
export const saveRecents = (r: string[]) => set(RECENTS, r)
export const loadLocation = async () => {
  const l = await get<Location>(LOCATION, DEFAULT_LOCATION)
  // Locations saved before v0.3 had no coordinates; the default pin gets its coordinates back.
  return l.lat === undefined && l.pincode === DEFAULT_LOCATION.pincode && l.label === DEFAULT_LOCATION.label ? DEFAULT_LOCATION : l
}
export const saveLocation = (l: Location) => set(LOCATION, l)

export function pushRecent(recents: string[], q: string): string[] {
  const clean = q.trim().toLowerCase()
  return [clean, ...recents.filter((r) => r !== clean)].slice(0, 8)
}

const LISTS = 'sasta.lists'
export const loadLists = async () => migrateLists(await get<import('./lists').ShoppingList[]>(LISTS, []))
export const saveLists = (l: import('./lists').ShoppingList[]) => set(LISTS, l)

const FEES = 'sasta.fees'
export const loadFees = () => get<import('./fees').FeeRules>(FEES, {})
export const saveFees = (f: import('./fees').FeeRules) => set(FEES, f)

const CART = 'sasta.cart'
export const loadCart = async () => migrateCart(await get<import('./cart').CartItem[]>(CART, []))
export const saveCart = (c: import('./cart').CartItem[]) => set(CART, c)

const APPEARANCE = 'sasta.appearance'
export type AppearancePref = 'system' | 'light' | 'dark'
export const loadAppearance = async (): Promise<AppearancePref> => {
  const v = await get<string>(APPEARANCE, 'system')
  return v === 'light' || v === 'dark' ? v : 'system'
}
export const saveAppearance = (a: AppearancePref) => set(APPEARANCE, a)

const FOOD_RECENTS = 'sasta.food.recents'
export const DEFAULT_FOOD_RECENTS = ['biryani', 'masala dosa', 'butter chicken', 'burger', 'meghana']
export const loadFoodRecents = () => get<string[]>(FOOD_RECENTS, DEFAULT_FOOD_RECENTS)
export const saveFoodRecents = (r: string[]) => set(FOOD_RECENTS, r)
