import { App as CapApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { ChevronDown, PackageSearch } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { adapters, IS_SAMPLE_DATA, LIVE_PLATFORMS } from '@/adapters'
import { AccountsSheet } from '@/components/AccountsSheet'
import { BestValueCard } from '@/components/BestValueCard'
import { CartBar } from '@/components/CartBar'
import { CartSheet } from '@/components/CartSheet'
import { ListsSheet } from '@/components/ListsSheet'
import { SaveToListSheet } from '@/components/SaveToListSheet'
import { CompareSheet } from '@/components/CompareSheet'
import { LocationSheet } from '@/components/LocationSheet'
import { PlatformDots, PlatformProgress } from '@/components/PlatformProgress'
import { ProductCard, ProductCardSkeleton } from '@/components/ProductCard'
import { SearchHeader } from '@/components/SearchHeader'
import { Segmented } from '@/components/Segmented'
import { VariantChips } from '@/components/VariantChips'
import { ACCOUNT_CONFIG, connectWeb, disconnectWeb, loadAccounts, recheckWebSessions, saveAccounts, type Account } from '@/lib/accounts'
import { connectSwiggy, disconnectSwiggy } from '@/lib/swiggy'
import { addItem, addItems, extraOverCheapest, fromGroup, pin, pinAll, refreshCart, setQty, summarize, type CartItem } from '@/lib/cart'
import {
  createList, deleteList, exportLists, importLists, isSaved, listItemFromGroup, markPicked, moveItem, removeFromList,
  renameList, saveToList, setItemQty, shareText as listText, toCartItems, updatePrices, type ShoppingList,
} from '@/lib/lists'
import { groupOffers, variantFromQuery } from '@/lib/normalize'
import { shareFile, shareText } from '@/lib/share'
import { PLATFORMS } from '@/lib/platforms'
import { runSearch } from '@/lib/search'
import { DEFAULT_LOCATION, DEFAULT_RECENTS, loadCart, loadLists, loadLocation, loadRecents, pushRecent, saveCart, saveLists, saveLocation, saveRecents } from '@/lib/storage'
import type { AdapterStatus, Location, Offer, Platform, ProductGroup } from '@/lib/types'
import { formatSize } from '@/lib/utils'

type Sort = 'cheapest' | 'fastest'

export default function App() {
  const [query, setQuery] = useState('')
  const [submitted, setSubmitted] = useState('')
  const [location, setLocation] = useState<Location>(DEFAULT_LOCATION)
  const [recents, setRecents] = useState<string[]>(DEFAULT_RECENTS)
  const [statuses, setStatuses] = useState<Partial<Record<Platform, AdapterStatus>>>({})
  const [offers, setOffers] = useState<Partial<Record<Platform, Offer[]>>>({})
  const [variant, setVariant] = useState<string | null>(null)
  const [size, setSize] = useState<number | null>(null)
  const [sort, setSort] = useState<Sort>('cheapest')
  const [selected, setSelected] = useState<ProductGroup | null>(null)
  const [locationOpen, setLocationOpen] = useState(false)
  const [showStatus, setShowStatus] = useState(false)
  const [elapsed, setElapsed] = useState<number | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const [cart, setCart] = useState<CartItem[]>([])
  const [cartOpen, setCartOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const cartLoaded = useRef(false)
  const [accounts, setAccounts] = useState<Partial<Record<Platform, Account>>>({})
  const [accountsOpen, setAccountsOpen] = useState(false)
  const [lists, setLists] = useState<ShoppingList[]>([])
  const [listsOpen, setListsOpen] = useState(false)
  const [openListId, setOpenListId] = useState<string | null>(null)
  const [saveTarget, setSaveTarget] = useState<ProductGroup | null>(null)
  const [toast, setToast] = useState('')
  const listsLoaded = useRef(false)

  useEffect(() => {
    loadLocation().then(setLocation)
    loadRecents().then(setRecents)
    loadCart().then((c) => { setCart(c); cartLoaded.current = true })
    loadLists().then((l) => { setLists(l); listsLoaded.current = true })
    loadAccounts().then(async (a) => {
      setAccounts(a)
      const checked = await recheckWebSessions(a).catch(() => a)
      setAccounts(checked)
      saveAccounts(checked)
    })
  }, [])

  useEffect(() => { if (cartLoaded.current) saveCart(cart) }, [cart])
  useEffect(() => { if (listsLoaded.current) saveLists(lists) }, [lists])
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 2600); return () => clearTimeout(t) }, [toast])

  const toggleSaved = (listId: string, saved: boolean) => {
    if (!saveTarget) return
    setLists((ls) => saved ? removeFromList(ls, listId, saveTarget.key) : saveToList(ls, listId, listItemFromGroup(saveTarget, submitted)))
  }
  const createAndMaybeSave = (name: string, emoji: string) => {
    setLists((ls) => {
      const [next, list] = createList(ls, name, emoji)
      return saveTarget ? saveToList(next, list.id, listItemFromGroup(saveTarget, submitted)) : next
    })
  }
  async function addListToCart(listId: string, keys: string[]) {
    const list = lists.find((l) => l.id === listId)
    if (!list || !keys.length) return
    const picked = toCartItems(list, keys)
    const fresh = await refreshCart(picked, adapters, location, new AbortController().signal).catch(() => picked)
    setCart((c) => addItems(c, fresh))
    setLists((ls) => markPicked(updatePrices(ls, listId, fresh, Date.now() - 1), listId, keys))
    setListsOpen(false)
    setOpenListId(null)
    setToast(`${keys.length} added from ${list.name}`)
    setCartOpen(true)
  }
  async function shareList(listId: string, keys: string[]) {
    const list = lists.find((l) => l.id === listId)
    if (!list) return
    const how = await shareText(list.name, listText(list, keys)).catch(() => null)
    if (how === 'copied') setToast('List copied')
  }
  async function exportAllLists() {
    await shareFile(`sasta-lists-${new Date().toISOString().slice(0, 10)}.json`, exportLists(lists)).catch(() => setToast('Could not export'))
  }
  function importAllLists(text: string) {
    try { setLists((ls) => importLists(ls, text)); setToast('Lists restored') } catch (e) { setToast((e as Error).message) }
  }

  const cartQty = useMemo(() => new Map(cart.map((i) => [i.key, i.qty])), [cart])
  const cartSummary = useMemo(() => summarize(cart), [cart])
  const addToCart = (g: ProductGroup) => setCart((c) => addItem(c, fromGroup(g, submitted)))

  async function updateAccount(a: Account) {
    setAccounts((prev) => { const next = { ...prev, [a.platform]: a }; saveAccounts(next); return next })
  }
  const connectAccount = async (p: Platform) => {
    await updateAccount(ACCOUNT_CONFIG[p].method === 'mcp' ? await connectSwiggy() : await connectWeb(p))
  }
  const disconnectAccount = async (p: Platform) => {
    await updateAccount(ACCOUNT_CONFIG[p].method === 'mcp' ? await disconnectSwiggy() : await disconnectWeb(p))
  }
  // Swiggy's OAuth sign-in needs the in-app browser, so it is only offered in the Android app.
  const canConnect = (p: Platform) => ACCOUNT_CONFIG[p].method === 'web' || Capacitor.isNativePlatform()
  const connectedCount = Object.values(accounts).filter((a) => a?.status === 'connected').length

  async function refreshPrices() {
    setRefreshing(true)
    const ctrl = new AbortController()
    try { setCart(await refreshCart(cart, adapters, location, ctrl.signal)) } finally { setRefreshing(false) }
  }

  const search = useCallback(async (raw: string, loc: Location = location, force = false) => {
    const q = raw.trim()
    if (!q) return
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setSubmitted(q)
    setOffers({})
    setStatuses({})
    setElapsed(null)
    setVariant(variantFromQuery(q) ?? null)
    setSize(null)
    setShowStatus(false)
    window.scrollTo({ top: 0 })
    setRecents((r) => { const next = pushRecent(r, q); saveRecents(next); return next })
    const t0 = performance.now()
    await runSearch(adapters, q, loc, ctrl.signal, {
      onStatus: (s) => !ctrl.signal.aborted && setStatuses((prev) => ({ ...prev, [s.platform]: s })),
      onOffers: (p, o) => !ctrl.signal.aborted && setOffers((prev) => ({ ...prev, [p]: o })),
    }, { force })
    if (!ctrl.signal.aborted) setElapsed(performance.now() - t0)
  }, [location])

  // Android hardware back: close sheets first, then go home, then exit.
  const backState = useRef({ selected, locationOpen, submitted, cartOpen, accountsOpen, listsOpen, openListId, saveTarget })
  backState.current = { selected, locationOpen, submitted, cartOpen, accountsOpen, listsOpen, openListId, saveTarget }
  useEffect(() => {
    const sub = CapApp.addListener('backButton', () => {
      const s = backState.current
      if (s.saveTarget) setSaveTarget(null)
      else if (s.selected) setSelected(null)
      else if (s.listsOpen && s.openListId) setOpenListId(null)
      else if (s.listsOpen) setListsOpen(false)
      else if (s.cartOpen) setCartOpen(false)
      else if (s.accountsOpen) setAccountsOpen(false)
      else if (s.locationOpen) setLocationOpen(false)
      else if (s.submitted) { abortRef.current?.abort(); setSubmitted(''); setQuery('') }
      else CapApp.exitApp()
    })
    return () => { sub.then((h) => h.remove()) }
  }, [])

  const allOffers = useMemo(() => Object.values(offers).flat() as Offer[], [offers])
  const groups = useMemo(() => groupOffers(allOffers), [allOffers])
  const searching = PLATFORMS.some((p) => !statuses[p.id] || statuses[p.id]!.state === 'searching')
  const doneCount = PLATFORMS.filter((p) => statuses[p.id] && statuses[p.id]!.state !== 'searching').length
  const appsWithResults = PLATFORMS.filter((p) => (offers[p.id]?.length ?? 0) > 0).length

  const variantOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const g of groups) if (!g.variantKey.startsWith('raw:')) seen.set(g.variantKey, g.variant.replace(/^American Style |^Spanish /, ''))
    return [...seen].map(([key, label]) => ({ key, label }))
  }, [groups])

  const byVariant = useMemo(() => groups.filter((g) => !variant || g.variantKey === variant), [groups, variant])
  const sizes = useMemo(
    () => [...new Set(byVariant.map((g) => g.sizeGrams).filter((s): s is number => !!s))].sort((a, b) => a - b),
    [byVariant],
  )
  const activeSize = size !== null && sizes.includes(size) ? size : sizes.length > 1 ? sizes[0] : null

  const visible = useMemo(() => {
    const list = byVariant.filter((g) => activeSize === null || g.sizeGrams === activeSize || !g.sizeGrams)
    return [...list].sort((a, b) => {
      if (a.best.inStock !== b.best.inStock) return a.best.inStock ? -1 : 1
      return sort === 'cheapest'
        ? a.best.price - b.best.price || (a.best.etaMinutes ?? 99) - (b.best.etaMinutes ?? 99)
        : (a.best.etaMinutes ?? 99) - (b.best.etaMinutes ?? 99) || a.best.price - b.best.price
    })
  }, [byVariant, activeSize, sort])

  const bestValue = useMemo(
    () => byVariant.filter((g) => g.pricePer100g).sort((a, b) => a.pricePer100g! - b.pricePer100g!)[0],
    [byVariant],
  )

  const setAndSaveLocation = (l: Location) => {
    setLocation(l)
    saveLocation(l)
    if (submitted) search(submitted, l, true)
  }

  return (
    <div className="mx-auto min-h-screen max-w-lg">
      <SearchHeader
        query={query}
        onQuery={setQuery}
        onSubmit={(q) => search(q)}
        location={location}
        onLocation={() => setLocationOpen(true)}
        recents={recents}
        connectedCount={connectedCount}
        onAccounts={() => setAccountsOpen(true)}
        onLists={() => setListsOpen(true)}
      />

      <main className={`space-y-4 px-4 pt-2 ${cart.length ? 'pb-28' : 'pb-8'}`}>
        {!submitted && <Home />}

        {submitted && (
          <>
            <button onClick={() => setShowStatus((s) => !s)} className="flex w-full items-center justify-between text-[13px] text-muted">
              <span className="flex items-center gap-1">
                {searching
                  ? `Searching ${doneCount} of ${PLATFORMS.length} apps…`
                  : `${allOffers.length} results from ${appsWithResults} apps${elapsed !== null ? ` · ${(elapsed / 1000).toFixed(1)} s` : ''}`}
                <ChevronDown className={`size-3.5 transition-transform ${showStatus ? 'rotate-180' : ''}`} />
              </span>
              <PlatformDots statuses={statuses} />
            </button>

            {(showStatus || (searching && groups.length === 0)) && <PlatformProgress statuses={statuses} />}

            {groups.length === 0 && searching && (
              <div className="space-y-2.5">{[0, 1, 2].map((i) => <ProductCardSkeleton key={i} />)}</div>
            )}

            {groups.length === 0 && !searching && (
              <div className="rise flex flex-col items-center py-14 text-center">
                <PackageSearch className="size-10 text-faint" />
                <p className="mt-3 text-[15px] font-semibold">No matches on any app</p>
                <p className="mt-1 text-[13px] text-muted">Try a shorter search, like a brand name.</p>
              </div>
            )}

            {groups.length > 0 && (
              <>
                {bestValue && <BestValueCard group={bestValue} onOpen={() => setSelected(bestValue)} />}
                <VariantChips options={variantOptions} value={variant} onChange={setVariant} />
                <div className="flex items-center justify-between gap-2">
                  {sizes.length > 1 ? (
                    <Segmented label="Pack size" value={activeSize ?? sizes[0]} onChange={setSize} options={sizes.map((s) => ({ value: s, label: formatSize(s) }))} />
                  ) : <span />}
                  <Segmented<Sort> label="Sort" value={sort} onChange={setSort} options={[{ value: 'cheapest', label: 'Cheapest' }, { value: 'fastest', label: 'Fastest' }]} />
                </div>
                <div className="space-y-2.5">
                  {visible.map((g, i) => (
                    <ProductCard key={g.key} group={g} index={i} total={PLATFORMS.length} onOpen={() => setSelected(g)} inCart={cartQty.get(g.key) ?? 0} onAdd={() => addToCart(g)} saved={isSaved(lists, g.key)} onSave={() => setSaveTarget(g)} />
                  ))}
                </div>
              </>
            )}
          </>
        )}

        <p className="pt-4 text-center text-[11.5px] leading-relaxed text-faint">
          {IS_SAMPLE_DATA ? 'Browser preview · sample prices, not live' : `Live prices: ${LIVE_PLATFORMS.map((p) => PLATFORMS.find((x) => x.id === p)!.name).join(', ')} · more apps coming`}
          <br />
          Search runs on your phone, with no server
        </p>
      </main>

      <CompareSheet
        group={selected}
        onClose={() => setSelected(null)}
        inCart={selected ? cartQty.get(selected.key) ?? 0 : 0}
        onAdd={() => selected && addToCart(selected)}
        saved={!!selected && isSaved(lists, selected.key)}
        onSave={() => selected && setSaveTarget(selected)}
      />
      {!selected && !cartOpen && !locationOpen && !accountsOpen && !listsOpen && !saveTarget && <CartBar summary={cartSummary} extra={extraOverCheapest(cart)} onOpen={() => setCartOpen(true)} />}
      <CartSheet
        open={cartOpen}
        items={cart}
        refreshing={refreshing}
        onClose={() => setCartOpen(false)}
        onQty={(k, q) => setCart((c) => setQty(c, k, q))}
        onPin={(k, p) => setCart((c) => pin(c, k, p))}
        onPinAll={(p) => setCart((c) => pinAll(c, p))}
        onRefresh={refreshPrices}
        onClear={() => { setCart([]); setCartOpen(false) }}
      />
      <SaveToListSheet group={saveTarget} lists={lists} onClose={() => setSaveTarget(null)} onToggle={toggleSaved} onCreate={createAndMaybeSave} />
      <ListsSheet
        open={listsOpen}
        lists={lists}
        openListId={openListId}
        onOpenList={setOpenListId}
        onClose={() => { setListsOpen(false); setOpenListId(null) }}
        onCreate={(n, e) => setLists((ls) => createList(ls, n, e)[0])}
        onRename={(id, n, e) => setLists((ls) => renameList(ls, id, n, e))}
        onDelete={(id) => { setLists((ls) => deleteList(ls, id)); setOpenListId(null) }}
        onQty={(l, k, q) => setLists((ls) => setItemQty(ls, l, k, q))}
        onRemove={(l, k) => setLists((ls) => removeFromList(ls, l, k))}
        onMove={(f, t, k, c) => setLists((ls) => moveItem(ls, f, t, k, c))}
        onAddToCart={addListToCart}
        onShare={shareList}
        onExport={exportAllLists}
        onImport={importAllLists}
      />
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center pt-safe">
          <div className="rise mt-3 rounded-full bg-ink px-4 py-2 text-[13px] font-semibold text-bg shadow-lg">{toast}</div>
        </div>
      )}
      <AccountsSheet
        open={accountsOpen}
        accounts={accounts}
        onClose={() => setAccountsOpen(false)}
        onConnect={connectAccount}
        onDisconnect={disconnectAccount}
        canConnect={canConnect}
      />
      <LocationSheet open={locationOpen} value={location} onClose={() => setLocationOpen(false)} onSave={setAndSaveLocation} />
    </div>
  )
}

function Home() {
  return (
    <section className="rise pt-6">
      <h1 className="font-display text-[30px] font-extrabold leading-[1.08] tracking-[-0.035em]">
        One search.
        <br />
        <span className="text-muted">Every quick-commerce app.</span>
      </h1>
      <p className="mt-3 max-w-[30ch] text-[14px] leading-relaxed text-muted">
        Type a product once. Sasta checks every app that delivers to you and shows the cheapest pack.
      </p>
      <ul className="mt-6 grid grid-cols-2 gap-2">
        {PLATFORMS.map((p) => (
          <li key={p.id} className="flex items-center gap-2.5 rounded-2xl bg-surface px-3.5 py-3 text-[13.5px] font-semibold">
            <span className="size-2.5 rounded-full" style={{ background: p.color }} />
            {p.name}
          </li>
        ))}
      </ul>
    </section>
  )
}
