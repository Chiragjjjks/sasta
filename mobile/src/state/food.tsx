import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Linking } from 'react-native'
import { foodSources } from '@/core/food/adapters'
import { groupDishes, relevantDishes, restaurantKey } from '@/core/food/match'
import type { Dish, DishGroup, FoodPlatform, FoodStatus, RestaurantMatch } from '@/core/food/types'
import { runSources, withTimeout } from '@/core/search'
import { DEFAULT_FOOD_RECENTS, loadFoodRecents, pushRecent, saveFoodRecents } from '@/core/storage'
import type { Location } from '@/core/types'
import { isReasonableQuery } from '@/core/utils'
import { useStore } from './store'

const MENU_TIMEOUT_MS = 20000

export interface MenuCheck { running: boolean; at?: number; failed: FoodPlatform[] }

/** One order at a time, from one restaurant: dish group key → quantity. */
export interface FoodOrder { restaurantKey: string; qty: Record<string, number> }

interface FoodStore {
  query: string; setQuery: (q: string) => void
  submitted: string
  search: (q: string, opts?: { force?: boolean }) => Promise<void>
  clear: () => void
  statuses: Partial<Record<FoodPlatform, FoodStatus>>
  dishes: Partial<Record<FoodPlatform, Dish[]>>
  groups: DishGroup[]
  restaurants: RestaurantMatch[]
  elapsed: number | null
  recents: string[]
  /** The restaurant from the last search, with every menu read since merged in. */
  restaurant: (key: string) => RestaurantMatch | undefined
  /** Reads each app's whole menu for this restaurant (`food.menu`), so more dishes line up across apps. */
  loadMenu: (key: string) => Promise<void>
  menuChecks: Record<string, MenuCheck>
  order: FoodOrder | null
  /** Sets one dish's quantity. Picking from another restaurant starts a new order. */
  setOrderQty: (restaurantKey: string, dishKey: string, qty: number) => void
  clearOrder: () => void
  /** Hands off to the app. Sasta never orders or pays. */
  openApp: (link: string) => void
}

const Ctx = createContext<FoodStore | null>(null)

export function useFood(): FoodStore {
  const s = useContext(Ctx)
  if (!s) throw new Error('useFood outside FoodProvider')
  return s
}

export function FoodProvider({ children }: { children: ReactNode }) {
  const { location, showToast } = useStore()
  const [query, setQuery] = useState('')
  const [submitted, setSubmitted] = useState('')
  const [statuses, setStatuses] = useState<Partial<Record<FoodPlatform, FoodStatus>>>({})
  const [dishes, setDishes] = useState<Partial<Record<FoodPlatform, Dish[]>>>({})
  const [menus, setMenus] = useState<Record<string, Dish[]>>({})
  const [menuChecks, setMenuChecks] = useState<Record<string, MenuCheck>>({})
  const [elapsed, setElapsed] = useState<number | null>(null)
  const [recents, setRecents] = useState<string[]>(DEFAULT_FOOD_RECENTS)
  const [order, setOrder] = useState<FoodOrder | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const locationRef = useRef<Location>(location)
  const submittedRef = useRef('')

  useEffect(() => { loadFoodRecents().then(setRecents) }, [])

  const search = useCallback(async (raw: string, opts: { force?: boolean } = {}) => {
    const q = raw.trim()
    if (!q) return
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    submittedRef.current = q
    setQuery(q); setSubmitted(q); setDishes({}); setStatuses({}); setMenus({}); setMenuChecks({}); setElapsed(null)
    if (isReasonableQuery(q)) setRecents((r) => { const next = pushRecent(r, q); saveFoodRecents(next); return next })
    const t0 = Date.now()
    await runSources(foodSources, q, locationRef.current, ctrl.signal, {
      onStatus: (s) => { if (!ctrl.signal.aborted) setStatuses((prev) => ({ ...prev, [s.platform]: s })) },
      onOffers: (p, d) => { if (!ctrl.signal.aborted) setDishes((prev) => ({ ...prev, [p]: d })) },
    }, { force: opts.force, filter: relevantDishes })
    if (!ctrl.signal.aborted) setElapsed(Date.now() - t0)
  }, [])

  // A new delivery location changes every restaurant's prices and fees: search again there.
  useEffect(() => {
    if (locationRef.current === location) return
    locationRef.current = location
    if (submittedRef.current) search(submittedRef.current, { force: true })
  }, [location, search])

  const clear = useCallback(() => {
    abortRef.current?.abort()
    submittedRef.current = ''
    setSubmitted(''); setQuery(''); setDishes({}); setStatuses({}); setMenus({}); setMenuChecks({})
  }, [])

  const all = useMemo(() => Object.values(dishes).flat() as Dish[], [dishes])
  const { groups, restaurants } = useMemo(() => groupDishes(all), [all])

  const restaurant = useCallback((key: string) => {
    const found = all.filter((d) => restaurantKey(d.outlet.name) === key)
    const ids = new Set(found.map((d) => d.id))
    const merged = [...found, ...(menus[key] ?? []).filter((d) => !ids.has(d.id))]
    return groupDishes(merged).restaurants.find((r) => r.key === key)
  }, [all, menus])

  const loadMenu = useCallback(async (key: string) => {
    const r = restaurants.find((x) => x.key === key)
    if (!r || menuChecks[key]?.running) return
    const ctrl = abortRef.current
    setMenuChecks((m) => ({ ...m, [key]: { running: true, failed: [] } }))
    const failed: FoodPlatform[] = []
    const read = await Promise.all(foodSources.map(async (src) => {
      const outlet = r.outlets[src.platform]
      if (!outlet || !src.menu) return []
      try {
        return await withTimeout((s) => src.menu!(outlet, locationRef.current, s), ctrl?.signal ?? new AbortController().signal, MENU_TIMEOUT_MS)
      } catch { failed.push(src.platform); return [] }
    }))
    if (ctrl?.signal.aborted) return
    setMenus((m) => ({ ...m, [key]: read.flat() }))
    setMenuChecks((m) => ({ ...m, [key]: { running: false, at: Date.now(), failed } }))
  }, [restaurants, menuChecks])

  const setOrderQty = useCallback((rKey: string, dKey: string, qty: number) => {
    setOrder((o) => {
      const base = o && o.restaurantKey === rKey ? o.qty : {}
      const next = { ...base, [dKey]: Math.max(0, qty) }
      if (!next[dKey]) delete next[dKey]
      return Object.keys(next).length ? { restaurantKey: rKey, qty: next } : null
    })
  }, [])

  const clearOrder = useCallback(() => setOrder(null), [])

  const openApp = useCallback((link: string) => {
    Linking.openURL(link).catch(() => showToast('Could not open the app'))
  }, [showToast])

  const value = useMemo<FoodStore>(() => ({
    query, setQuery, submitted, search, clear, statuses, dishes, groups, restaurants, elapsed, recents,
    restaurant, loadMenu, menuChecks, order, setOrderQty, clearOrder, openApp,
  }), [query, submitted, search, clear, statuses, dishes, groups, restaurants, elapsed, recents, restaurant, loadMenu, menuChecks, order, setOrderQty, clearOrder, openApp])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
