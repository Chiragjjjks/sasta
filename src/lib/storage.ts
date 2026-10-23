import { Preferences } from '@capacitor/preferences'
import type { Location } from './types'

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

const CART = 'sasta.cart'
export const loadCart = () => get<import('./cart').CartItem[]>(CART, [])
export const saveCart = (c: import('./cart').CartItem[]) => set(CART, c)
