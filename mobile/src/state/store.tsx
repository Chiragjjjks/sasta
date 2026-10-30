import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { adapters, canSearch, IS_NATIVE } from '@/core/adapters'
import { connectionReport, probeSearch } from '@/core/connection-test'
import { migrateLists } from '@/core/identity'
import { beginAutoSignIn, endAutoSignIn, PlatformSession } from '@/native/platformSession'
import { blinkitIdentity, fetchBlinkitBill, openBlinkitWithCart, prepareBlinkitSignIn } from '@/core/adapters/blinkit'
import {
  ACCOUNT_CONFIG, connectWeb, connectWebsite, disconnectWeb, loadAccounts, recheckWebSessions, saveAccounts,
  testWebConnection, type Account,
} from '@/core/accounts'
import {
  listSwiggyAddresses, loadInstamartAddress, resolveInstamartAddress, saveInstamartAddress, type SelectedAddress, type SwiggyAddress,
} from '@/core/adapters/instamart'
import { addItem, addItems, cheapestOffer, chosenOffer, fromGroup, mergeRefreshedCart, pin, pinAll, refreshCart, setQty, summarize, type CartItem } from '@/core/cart'
import { blinkitRuleFromBill, type FeeRules } from '@/core/fees'
import {
  createList, deleteList, exportLists, importLists, listItemFromGroup, markPicked, moveItem, pinAllItems, pinItem, removeFromList, renameList,
  saveToList, setItemQty, shareText as listText, toCartItems, updatePrices, type ShoppingList,
} from '@/core/lists'
import { groupOffers } from '@/core/normalize'
import { PLATFORM, PLATFORMS } from '@/core/platforms'
import { clearSearchCache, runSearch } from '@/core/search'
import { buildBatch, createBatchScheduler, batchSleep, parseTerms, type SearchBatch, type SourceRef } from '@/core/search-batch'
import { shareFile, shareText } from '@/core/share'
import {
  DEFAULT_LOCATION, DEFAULT_RECENTS, loadCart, loadFees, loadLists, loadLocation, loadRecents, pushRecent, saveCart,
  saveFees, saveLists, saveLocation, saveRecents,
} from '@/core/storage'
import { connectMcp, disconnectMcp, isMcpPlatform, mcpClient } from '@/core/mcp-connect'
import type { AdapterStatus, Location, Offer, Platform, ProductGroup } from '@/core/types'
import { isReasonableQuery } from '@/core/utils'

interface Store {
  // search
  query: string; setQuery: (q: string) => void
  submitted: string
  search: (q: string, opts?: { loc?: Location; force?: boolean }) => Promise<void>
  clearSearch: () => void
  statuses: Partial<Record<Platform, AdapterStatus>>
  offers: Partial<Record<Platform, Offer[]>>
  groups: ProductGroup[]
  elapsed: number | null
  recents: string[]
  batch: SearchBatch | null
  searchMany: (texts: string[]) => { ok: true; batchId: string } | { ok: false; reason: 'empty' | 'overflow' }
  stopBatch: () => void
  removeQuery: (queryId: string) => void
  retryQuery: (queryId: string) => void
  clearBatch: () => void
  groupByKey: (key: string, source?: SourceRef) => ProductGroup | undefined
  // location
  location: Location; setLocation: (l: Location) => void
  // cart
  cart: CartItem[]
  /** Adds one pack. With a platform, buys it there (or from the cheapest app when that is the cheapest). */
  addToCart: (g: ProductGroup, platform?: Platform, source?: SourceRef) => void
  setCartQty: (key: string, qty: number) => void
  pinItem: (key: string, p: Platform | undefined) => void
  pinAllTo: (p: Platform | undefined) => void
  pinMap: (pins: Record<string, Platform>) => void
  clearCart: () => void
  refreshing: boolean
  /** Re-checks every cart item on every app. The cart calls this when it opens; Refresh forces fresh prices. */
  refreshPrices: (opts?: { force?: boolean }) => Promise<void>
  /** Cart price change per item key from the last check (new minus old chosen price). */
  cartChanges: Record<string, number>
  dismissCartChanges: () => void
  fees: FeeRules
  learnFees: () => void
  checkout: (p: Platform) => Promise<void>
  // lists
  lists: ShoppingList[]
  isSaved: (key: string) => boolean
  toggleSaved: (listId: string, g: ProductGroup, source?: SourceRef) => void
  createList: (name: string, emoji: string, save?: ProductGroup, source?: SourceRef) => string
  renameList: (id: string, name: string, emoji: string) => void
  deleteList: (id: string) => void
  setListQty: (listId: string, key: string, qty: number) => void
  removeFromList: (listId: string, key: string) => void
  moveListItem: (from: string, to: string, key: string, copy: boolean) => void
  addListToCart: (listId: string, keys: string[]) => Promise<number>
  /** Checks every item of a list on every app. Opening a list calls this; recent searches come from the cache. */
  refreshList: (listId: string, opts?: { force?: boolean }) => Promise<void>
  listChecks: Record<string, { running: boolean; at?: number }>
  pinListItem: (listId: string, key: string, p: Platform | undefined) => void
  pinListTo: (listId: string, p: Platform | undefined) => void
  shareList: (listId: string, keys: string[]) => Promise<void>
  exportLists: () => Promise<void>
  importLists: (text: string) => void
  // accounts
  accounts: Partial<Record<Platform, Account>>
  connect: (p: Platform, opts?: { website?: boolean }) => Promise<Account>
  /** Opens sign-in for every app not yet connected and fills the number; the user enters each OTP. */
  connectAll: (phone: string) => Promise<{ connected: Platform[]; missed: Platform[] }>
  disconnect: (p: Platform) => Promise<void>
  testConnection: (p: Platform) => Promise<void>
  setupProvider: (p: Platform) => Promise<void>
  /** Instamart searches one of the user's saved Swiggy addresses. */
  instamartAddress: SelectedAddress | null
  listInstamartAddresses: () => Promise<SwiggyAddress[]>
  chooseInstamartAddress: (a: SwiggyAddress) => Promise<void>
  // feedback
  toast: string; showToast: (t: string) => void
}

const Ctx = createContext<Store | null>(null)

export function useStore(): Store {
  const s = useContext(Ctx)
  if (!s) throw new Error('useStore outside StoreProvider')
  return s
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [query, setQuery] = useState('')
  const [submitted, setSubmitted] = useState('')
  const [statuses, setStatuses] = useState<Partial<Record<Platform, AdapterStatus>>>({})
  const [offers, setOffers] = useState<Partial<Record<Platform, Offer[]>>>({})
  const [elapsed, setElapsed] = useState<number | null>(null)
  const [recents, setRecents] = useState<string[]>(DEFAULT_RECENTS)
  const [location, setLocationState] = useState<Location>(DEFAULT_LOCATION)
  const [cart, setCart] = useState<CartItem[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [fees, setFees] = useState<FeeRules>({})
  const [lists, setLists] = useState<ShoppingList[]>([])
  const [listChecks, setListChecks] = useState<Record<string, { running: boolean; at?: number }>>({})
  // Layout effects run before any screen's effects, so a screen that checks prices as it opens sees the latest data.
  const listsRef = useRef(lists)
  useLayoutEffect(() => { listsRef.current = lists }, [lists])
  const cartRef = useRef(cart)
  useLayoutEffect(() => { cartRef.current = cart }, [cart])
  const cartChecking = useRef(false)
  const [cartChanges, setCartChanges] = useState<Record<string, number>>({})
  const checking = useRef(new Set<string>())
  const [accounts, setAccounts] = useState<Partial<Record<Platform, Account>>>({})
  const [instamartAddress, setInstamartAddress] = useState<SelectedAddress | null>(null)
  const [toast, setToast] = useState('')
  const loadedCart = useRef(false)
  const loadedLists = useRef(false)
  const abortRef = useRef<AbortController | null>(null)
  const locationRef = useRef(location)
  useEffect(() => { locationRef.current = location }, [location])
  const lastCartGroups = useRef(new Map<string, ProductGroup>())
  const [batch, setBatch] = useState<SearchBatch | null>(null)
  const batchRef = useRef<SearchBatch | null>(null)
  const contextVersion = useRef(0)
  const batchSequence = useRef(0)
  const schedulerRef = useRef<ReturnType<typeof createBatchScheduler> | null>(null)
  useEffect(() => {
    const scheduler = createBatchScheduler({
      runSearch: (q, signal, cb) => runSearch(adapters, q, locationRef.current, signal, cb),
      sleep: batchSleep, now: Date.now, contextVersion: () => contextVersion.current,
      onChange: next => { batchRef.current = next; setBatch(next) },
    })
    schedulerRef.current = scheduler
    return () => { scheduler.clear(); abortRef.current?.abort(); schedulerRef.current = null }
  }, [])
  const invalidateContext = useCallback(() => {
    contextVersion.current++
    schedulerRef.current?.invalidate()
  }, [])
  const updateInstamartAddress = useCallback((address: SelectedAddress | null) => {
    invalidateContext()
    setInstamartAddress(address)
  }, [invalidateContext])

  useEffect(() => {
    loadLocation().then(l => { invalidateContext(); locationRef.current = l; setLocationState(l) })
    loadRecents().then((r) => setRecents(r.filter(isReasonableQuery)))
    loadCart().then((c) => { setCart(c); loadedCart.current = true })
    loadLists().then((l) => { setLists(l); loadedLists.current = true })
    loadFees().then(setFees)
    loadInstamartAddress().then(updateInstamartAddress)
    loadAccounts().then(async (a) => {
      invalidateContext()
      setAccounts(a)
      if (!IS_NATIVE) return
      const checked = await recheckWebSessions(a).catch(() => a)
      // Only a real change of sign-in state makes open results stale, not the routine launch check.
      if ((Object.keys(checked) as Platform[]).some((p) => checked[p]?.status !== a[p]?.status)) invalidateContext()
      // Merge per app, so a connection made while this check ran is not overwritten.
      setAccounts((cur) => {
        const next = { ...cur }
        for (const p of Object.keys(checked) as Platform[]) if (cur[p]?.connectedAt === a[p]?.connectedAt) next[p] = checked[p]
        saveAccounts(next)
        return next
      })
    })
  }, [invalidateContext, updateInstamartAddress])

  useEffect(() => { if (loadedCart.current) saveCart(cart) }, [cart])
  useEffect(() => { if (loadedLists.current) saveLists(lists) }, [lists])
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 2800); return () => clearTimeout(t) }, [toast])

  /* ---------------------------------------------------------------- search */

  const search = useCallback(async (raw: string, opts: { loc?: Location; force?: boolean } = {}) => {
    const q = raw.trim()
    if (!q) return
    schedulerRef.current?.clear()
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setQuery(q)
    setSubmitted(q)
    setOffers({})
    setStatuses({})
    setElapsed(null)
    if (isReasonableQuery(q)) setRecents((r) => { const next = pushRecent(r, q); saveRecents(next); return next })
    const t0 = Date.now()
    await runSearch(adapters, q, opts.loc ?? locationRef.current, ctrl.signal, {
      onStatus: (s) => { if (!ctrl.signal.aborted) setStatuses((prev) => ({ ...prev, [s.platform]: s })) },
      onOffers: (p, o) => { if (!ctrl.signal.aborted) setOffers((prev) => ({ ...prev, [p]: o })) },
    }, { force: opts.force })
    if (!ctrl.signal.aborted) setElapsed(Date.now() - t0)
  }, [])

  const clearSearch = useCallback(() => {
    abortRef.current?.abort()
    setSubmitted(''); setQuery(''); setOffers({}); setStatuses({})
  }, [])

  const searchMany = useCallback((texts: string[]): ReturnType<Store['searchMany']> => {
    const { terms, rejected } = parseTerms(texts.join('\n'))
    if (rejected.length) return { ok: false, reason: 'overflow' }
    if (!terms.length) return { ok: false, reason: 'empty' }
    abortRef.current?.abort()
    // No single-search submission remains to re-run when the location changes.
    setSubmitted(''); setOffers({}); setStatuses({}); setElapsed(null)
    const next = buildBatch(terms, contextVersion.current, `batch-${Date.now()}-${++batchSequence.current}`)
    schedulerRef.current!.start(next)
    return { ok: true, batchId: next.id }
  }, [])

  const sourceSection = useCallback((source: SourceRef) => {
    const current = batchRef.current
    if (!current || current.id !== source.batchId || current.stale || current.contextVersion !== contextVersion.current) return undefined
    return current.sections.find(section => section.id === source.queryId)
  }, [])
  const resolveAction = useCallback((g: ProductGroup, source?: SourceRef) => {
    if (!source) return { group: g, query: submitted || g.variant }
    const section = sourceSection(source)
    const group = section?.groups.find(item => item.key === g.key)
    if (!section || !group) { setToast('Results are out of date. Search again.'); return undefined }
    return { group, query: section.text }
  }, [submitted, sourceSection])

  const allOffers = useMemo(() => Object.values(offers).flat() as Offer[], [offers])
  const groups = useMemo(() => groupOffers(allOffers), [allOffers])
  const groupByKey = useCallback((key: string, source?: SourceRef) => source
    ? sourceSection(source)?.groups.find(g => g.key === key)
    : groups.find((g) => g.key === key) ?? lastCartGroups.current.get(key), [groups, sourceSection])

  /* ---------------------------------------------------------------- location */

  const setLocation = useCallback((l: Location) => {
    invalidateContext()
    locationRef.current = l
    setLocationState(l)
    saveLocation(l)
    if (submitted && !batchRef.current) search(submitted, { loc: l, force: true })
  }, [submitted, search, invalidateContext])

  /* ---------------------------------------------------------------- cart */

  const addToCart = useCallback((g: ProductGroup, platform?: Platform, source?: SourceRef) => {
    const resolved = resolveAction(g, source)
    if (!resolved) return
    g = resolved.group
    lastCartGroups.current.set(g.key, g)
    setCart((c) => {
      const item = fromGroup(g, resolved.query)
      // addItem preserves an existing item's query; a sourced add must retain this section's text.
      const previous = source ? c.map(i => i.key === g.key ? { ...i, query: resolved.query } : i) : c
      const next = addItem(previous, item)
      return platform === undefined ? next : pin(next, g.key, platform === cheapestOffer(item)?.platform ? undefined : platform)
    })
  }, [resolveAction])

  const refreshPrices = useCallback(async (opts: { force?: boolean } = { force: true }) => {
    const before = cartRef.current
    if (!before.length || cartChecking.current) return
    cartChecking.current = true
    setRefreshing(true)
    try {
      const fresh = await refreshCart(before, adapters, locationRef.current, new AbortController().signal, { force: !!opts.force })
      const was = new Map(before.map((i) => [i.key, chosenOffer(i)?.price]))
      const changes: Record<string, number> = {}
      for (const i of fresh) {
        const old = was.get(i.key), now = chosenOffer(i)?.price
        if (old !== undefined && now !== undefined && Math.abs(now - old) >= 0.5) changes[i.key] = now - old
      }
      setCartChanges(changes)
      setCart((current) => mergeRefreshedCart(current, fresh))
    }
    catch { setToast('Could not refresh prices. Check your connection.') }
    finally { cartChecking.current = false; setRefreshing(false) }
  }, [])

  const learnFees = useCallback(() => {
    const items = cart.flatMap((i) => i.offers.filter((o) => o.platform === 'blinkit' && o.inStock && o.meta?.cartItem).slice(0, 1).map((o) => o.meta!.cartItem))
    const fresh = fees.blinkit && Date.now() - fees.blinkit.fetchedAt < 30 * 60 * 1000
    if (!items.length || fresh) return
    fetchBlinkitBill(items.slice(0, 10), locationRef.current)
      .then((bill) => { const rule = blinkitRuleFromBill(bill); if (rule) setFees((f) => { const next = { ...f, blinkit: rule }; saveFees(next); return next }) })
      .catch(() => {})
  }, [cart, fees])

  const checkout = useCallback(async (p: Platform) => {
    if (p !== 'blinkit') return
    const lines = summarize(cart).lines.flatMap((l) => (l.offer?.platform === 'blinkit' && l.offer.meta?.cartItem
      ? [{ cartItem: l.offer.meta.cartItem as Record<string, unknown>, qty: l.item.qty }] : []))
    await openBlinkitWithCart(lines, locationRef.current)
  }, [cart])

  /* ---------------------------------------------------------------- lists */

  const isSaved = useCallback((key: string) => lists.some((l) => l.items.some((i) => i.key === key)), [lists])

  const toggleSaved = useCallback((listId: string, g: ProductGroup, source?: SourceRef) => {
    const resolved = resolveAction(g, source)
    if (!resolved) return
    g = resolved.group
    setLists((ls) => {
      const saved = ls.find((l) => l.id === listId)?.items.some((i) => i.key === g.key)
      return saved ? removeFromList(ls, listId, g.key) : saveToList(ls, listId, listItemFromGroup(g, resolved.query))
    })
  }, [resolveAction])

  const createListFn = useCallback((name: string, emoji: string, save?: ProductGroup, source?: SourceRef) => {
    const resolved = save ? resolveAction(save, source) : undefined
    if ((save && !resolved) || (source && !sourceSection(source))) {
      setToast('Results are out of date. Search again.')
      return ''
    }
    const [next, list] = createList(lists, name, emoji)
    setLists(resolved ? saveToList(next, list.id, listItemFromGroup(resolved.group, resolved.query)) : next)
    return list.id
  }, [lists, resolveAction, sourceSection])

  const addListToCart = useCallback(async (listId: string, keys: string[]) => {
    const list = lists.find((l) => l.id === listId)
    if (!list || !keys.length) return 0
    const picked = toCartItems(list, keys)
    const fresh = await refreshCart(picked, adapters, locationRef.current, new AbortController().signal).catch(() => picked)
    setCart((c) => addItems(c, fresh))
    setLists((ls) => markPicked(updatePrices(ls, listId, fresh, Date.now() - 1), listId, keys))
    setToast(`${keys.length} added from ${list.name}`)
    return keys.length
  }, [lists])

  const refreshList = useCallback(async (listId: string, opts: { force?: boolean } = {}) => {
    const list = listsRef.current.find((l) => l.id === listId)
    if (!list?.items.length || checking.current.has(listId)) return
    checking.current.add(listId)
    setListChecks((c) => ({ ...c, [listId]: { ...c[listId], running: true } }))
    const started = Date.now()
    try {
      const fresh = await refreshCart(toCartItems(list, list.items.map((i) => i.key)), adapters, locationRef.current, new AbortController().signal, { force: !!opts.force })
      setLists((ls) => updatePrices(ls, listId, fresh, started))
    } finally {
      checking.current.delete(listId)
      setListChecks((c) => ({ ...c, [listId]: { running: false, at: Date.now() } }))
    }
  }, [])

  const importListsFn = useCallback((text: string) => {
    // Validate first: a bad file must show a message, never crash the app.
    let next: ShoppingList[]
    try { next = migrateLists(importLists(lists, text)) } catch (e) { setToast((e as Error).message || 'That file is not a Sasta lists backup.'); return }
    setLists(next)
    setToast('Lists restored')
  }, [lists])

  /* ---------------------------------------------------------------- accounts */

  const updateAccount = useCallback((a: Account) => {
    invalidateContext()
    clearSearchCache()
    setAccounts((prev) => { const next = { ...prev, [a.platform]: a }; saveAccounts(next); return next })
  }, [invalidateContext])

  const testAccount = useCallback(async (p: Platform, acc: Account): Promise<{ ok: boolean; detail: string }> => {
    if (isMcpPlatform(p) && acc.via !== 'web') {
      const name = ACCOUNT_CONFIG[p].account
      try { const tools = await mcpClient(p).listTools(); return { ok: true, detail: `${name} answered with ${tools.length} actions` } }
      catch (e) { return { ok: false, detail: `${name} didn't answer: ${(e as Error).message}` } }
    }
    if (p === 'blinkit') {
      const who = await blinkitIdentity().catch(() => null)
      if (who?.signedIn) return { ok: true, detail: `Blinkit says you are signed in${who.phone ? ` as ${who.phone}` : ''}` }
    }
    return testWebConnection(p, acc).catch((e) => ({ ok: false, detail: (e as Error).message }))
  }, [])

  const runTest = useCallback(async (p: Platform, acc: Account, announce = true) => {
    const searchAtStart = abortRef.current
    const t = await testAccount(p, acc)
    if (!canSearch(p)) {
      const tested: Account = { ...acc, lastTest: { ...t, sessionOk: t.ok, at: Date.now() }, verified: t.ok }
      updateAccount(tested)
      if (announce) setToast(`${PLATFORM[p].name}: ${t.detail}. Product search has not been added.`)
      return tested
    }
    const probe = await probeSearch(p, canSearch(p) ? adapters.find(a => a.platform === p) : undefined, submitted || 'milk', locationRef.current)
    if (p === 'instamart') loadInstamartAddress().then(updateInstamartAddress)
    const report = connectionReport(t, probe)
    const tested: Account = { ...acc, status: t.ok ? 'connected' : acc.status, connectedAt: t.ok ? acc.connectedAt ?? Date.now() : acc.connectedAt, lastTest: report, verified: t.ok }
    updateAccount(tested)
    if (submitted && abortRef.current === searchAtStart && !searchAtStart?.signal.aborted) {
      setOffers(prev => ({ ...prev, [p]: probe.offers }))
      setStatuses(prev => ({ ...prev, [p]: probe.status }))
    }
    if (announce) setToast(`${PLATFORM[p].name}: ${report.detail}`)
    return tested
  }, [testAccount, updateAccount, submitted, updateInstamartAddress])

  const setupProvider = useCallback(async (p: Platform) => {
    const config = ACCOUNT_CONFIG[p]
    const url = p === 'flipkart_minutes' ? 'https://www.flipkart.com/hyperlocal-preview-page?marketplace=HYPERLOCAL'
      : p === 'amazon_now' ? 'https://www.amazon.in/' : config.loginUrl
    const result = await PlatformSession.signIn({ url, title: `${PLATFORM[p].name} · delivery area`,
      doneLabel: 'Use this area', hint: p === 'amazon_now'
        ? `Open Amazon Now and choose ${locationRef.current.label} (${locationRef.current.pincode}). Fresh and regular listings are excluded.`
        : `Choose ${locationRef.current.label} (${locationRef.current.pincode}), then tap Use this area. Your login stays saved.` })
    if (result.kind === 'cancelled') return
    for (const origin of config.origins) await PlatformSession.pageReset({ origin: new URL(origin).origin })
    clearSearchCache()
    await runTest(p, accounts[p] ?? { platform: p, status: 'disconnected' })
  }, [accounts, runTest])

  const connect = useCallback(async (p: Platform, opts: { website?: boolean } = {}): Promise<Account> => {
    let acc: Account
    if (isMcpPlatform(p) && !opts.website) {
      const name = ACCOUNT_CONFIG[p].account
      try { acc = await connectMcp(p) }
      catch (e) { throw new Error(`${name}'s official sign-in didn't finish (${(e as Error).message}). Try again, or use ${name}'s website.`) }
      if (p === 'instamart' && acc.status === 'connected') {
        // Show which saved address Instamart will search, so the user can change it.
        await saveInstamartAddress(null)
        updateInstamartAddress(await resolveInstamartAddress(mcpClient('instamart')).catch(() => null))
      }
    } else if (isMcpPlatform(p)) acc = await connectWebsite(p)
    else {
      if (p === 'blinkit' && IS_NATIVE) await prepareBlinkitSignIn(locationRef.current).catch(() => {})
      acc = await connectWeb(p)
    }
    if (p === 'blinkit' && IS_NATIVE && acc.status === 'connected') {
      const who = await blinkitIdentity().catch(() => null)
      if (who?.signedIn) acc = { ...acc, verified: true, label: who.phone || acc.label }
    }
    updateAccount(acc)
    if (acc.status === 'connected') acc = await runTest(p, acc)
    return acc
  }, [runTest, updateAccount, updateInstamartAddress])

  const connectAll = useCallback(async (phone: string) => {
    const todo = PLATFORMS.map((x) => x.id).filter((p) => accounts[p]?.status !== 'connected')
    beginAutoSignIn(phone)
    try {
      const results = await Promise.allSettled(todo.map((p) => connect(p)))
      const connected = todo.filter((_, n) => results[n].status === 'fulfilled' && (results[n] as PromiseFulfilledResult<Account>).value.status === 'connected')
      return { connected, missed: todo.filter((p) => !connected.includes(p)) }
    } finally {
      endAutoSignIn()
    }
  }, [accounts, connect])

  const disconnect = useCallback(async (p: Platform) => {
    const acc = accounts[p]
    updateAccount(isMcpPlatform(p) && acc?.via !== 'web' ? await disconnectMcp(p) : await disconnectWeb(p))
    if (p === 'instamart') { await saveInstamartAddress(null); updateInstamartAddress(null) }
  }, [accounts, updateAccount, updateInstamartAddress])

  const listInstamartAddresses = useCallback(async () => (await listSwiggyAddresses()).addresses, [])

  const chooseInstamartAddress = useCallback(async (a: SwiggyAddress) => {
    const chosen = { ...a, auto: false }
    await saveInstamartAddress(chosen)
    updateInstamartAddress(chosen)
    clearSearchCache()
    await runTest('instamart', accounts.instamart ?? { platform: 'instamart', status: 'connected' }, true)
  }, [accounts, runTest, updateInstamartAddress])

  const testConnection = useCallback(async (p: Platform) => {
    await runTest(p, accounts[p] ?? { platform: p, status: 'disconnected' })
  }, [accounts, runTest])

  const value: Store = {
    batch, searchMany, stopBatch: () => schedulerRef.current?.stop(), removeQuery: id => schedulerRef.current?.remove(id), retryQuery: id => schedulerRef.current?.retry(id), clearBatch: () => schedulerRef.current?.clear(),
    query, setQuery, submitted, search, clearSearch, statuses, offers, groups, elapsed, recents, groupByKey,
    location, setLocation,
    cart, addToCart,
    setCartQty: (k, q) => setCart((c) => setQty(c, k, q)),
    pinItem: (k, p) => setCart((c) => pin(c, k, p)),
    pinAllTo: (p) => setCart((c) => pinAll(c, p)),
    pinMap: (pins) => setCart((c) => c.map((i) => ({ ...i, pinned: pins[i.key] }))),
    clearCart: () => setCart([]),
    refreshing, refreshPrices, cartChanges, dismissCartChanges: () => setCartChanges({}), fees, learnFees, checkout,
    lists, isSaved, toggleSaved, createList: createListFn,
    renameList: (id, n, e) => setLists((ls) => renameList(ls, id, n, e)),
    deleteList: (id) => setLists((ls) => deleteList(ls, id)),
    setListQty: (l, k, q) => setLists((ls) => setItemQty(ls, l, k, q)),
    removeFromList: (l, k) => setLists((ls) => removeFromList(ls, l, k)),
    moveListItem: (f, t, k, c) => setLists((ls) => moveItem(ls, f, t, k, c)),
    addListToCart, refreshList, listChecks,
    pinListItem: (id, k, p) => setLists((ls) => pinItem(ls, id, k, p)),
    pinListTo: (id, p) => setLists((ls) => pinAllItems(ls, id, p)),
    shareList: async (listId, keys) => {
      const list = lists.find((l) => l.id === listId)
      if (list) await shareText(list.name, listText(list, keys)).catch(() => {})
    },
    exportLists: async () => { await shareFile(`sasta-lists-${new Date().toISOString().slice(0, 10)}.json`, exportLists(lists)).catch(() => setToast('Could not export')) },
    importLists: importListsFn,
    accounts, connect, connectAll, disconnect, testConnection, setupProvider, instamartAddress, listInstamartAddresses, chooseInstamartAddress,
    toast, showToast: setToast,
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export { ACCOUNT_CONFIG, PLATFORMS }
