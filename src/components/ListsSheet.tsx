import { ArrowLeft, Check, Download, Loader2, MoreHorizontal, Plus, Share2, Trash2, Upload } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  currentPrice, estimateTotal, priceDrop, sameAsLastTime, sortItems, STARTER_LISTS, type ListSort, type ShoppingList,
} from '@/lib/lists'
import { PLATFORM } from '@/lib/platforms'
import { cn, formatSize, rupee } from '@/lib/utils'
import { PackIcon } from './PackIcon'
import { Sheet } from './Sheet'

interface Props {
  open: boolean
  lists: ShoppingList[]
  openListId: string | null
  onOpenList: (id: string | null) => void
  onClose: () => void
  onCreate: (name: string, emoji: string) => void
  onRename: (id: string, name: string, emoji: string) => void
  onDelete: (id: string) => void
  onQty: (listId: string, key: string, qty: number) => void
  onRemove: (listId: string, key: string) => void
  onMove: (fromId: string, toId: string, key: string, copy: boolean) => void
  onAddToCart: (listId: string, keys: string[]) => Promise<void>
  onShare: (listId: string, keys: string[]) => void
  onExport: () => void
  onImport: (text: string) => void
}

const EMOJIS = ['🛒', '🏢', '🎉', '🏠', '🍿', '🥛', '🧴', '👶', '🐶', '🛍️']
const SORTS: { value: ListSort; label: string }[] = [
  { value: 'saved', label: 'Saved order' },
  { value: 'often', label: 'Often bought' },
  { value: 'cheapest', label: 'Cheapest' },
  { value: 'az', label: 'A–Z' },
]

function ago(ts: number): string {
  const m = Math.round((Date.now() - ts) / 60000)
  if (m < 60) return m < 1 ? 'just now' : `${m} min ago`
  const h = Math.round(m / 60)
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} days ago`
}

export function ListsSheet(props: Props) {
  const { open, lists, openListId, onOpenList, onClose } = props
  const list = lists.find((l) => l.id === openListId) ?? null
  return (
    <Sheet open={open} onClose={onClose} title={list ? list.name : 'Your lists'}>
      {list ? <ListDetail {...props} list={list} onBack={() => onOpenList(null)} /> : <Overview {...props} />}
    </Sheet>
  )
}

function Overview({ lists, onOpenList, onCreate, onExport, onImport }: Props) {
  const [name, setName] = useState('')
  const [adding, setAdding] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const starters = STARTER_LISTS.filter((s) => !lists.some((l) => l.name.toLowerCase() === s.name.toLowerCase()))
  return (
    <>
      <h3 className="font-display text-[20px] font-bold">Your lists</h3>
      <p className="mt-0.5 text-[13px] text-muted">Save things you buy again. Tick what you need, add to cart.</p>

      <div className="mt-4 space-y-2">
        {lists.map((l) => {
          const drops = l.items.filter((i) => priceDrop(i) > 0).length
          return (
            <button key={l.id} onClick={() => onOpenList(l.id)} className="flex w-full items-center gap-3 rounded-card bg-surface px-4 py-3 text-left active:scale-[.99]">
              <span className="grid size-10 place-items-center rounded-xl bg-chip text-[20px]">{l.emoji}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-bold">{l.name}</span>
                <span className="block text-[12px] text-muted">
                  {l.items.length} {l.items.length === 1 ? 'product' : 'products'}
                  {drops > 0 && <span className="text-good"> · {drops} price {drops === 1 ? 'drop' : 'drops'}</span>}
                </span>
              </span>
              {l.items.length > 0 && (
                <span className="text-right">
                  <span className="tabular block text-[14.5px] font-bold">{rupee(estimateTotal(l.items))}</span>
                  <span className="block text-[11.5px] text-muted">all {l.items.length}</span>
                </span>
              )}
            </button>
          )
        })}
      </div>

      {!lists.length && (
        <p className="py-6 text-center text-[13.5px] text-muted">No lists yet. Make a wish list for things you buy again, then tap the bookmark on any product.</p>
      )}

      {adding ? (
        <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) { onCreate(name.trim(), '🛍️'); setName(''); setAdding(false) } }}>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="List name"
            className="min-w-0 flex-1 rounded-xl bg-surface px-4 py-3 text-[15px] font-medium outline-none ring-ink/10 focus:ring-2" />
          <button disabled={!name.trim()} className="rounded-xl bg-ink px-4 text-[14px] font-semibold text-bg disabled:opacity-40">Create</button>
        </form>
      ) : (
        <button onClick={() => setAdding(true)} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-dashed border-line py-3 text-[13.5px] font-semibold text-muted">
          <Plus className="size-4" /> New list
        </button>
      )}
      {starters.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {starters.map((s) => (
            <button key={s.name} onClick={() => onCreate(s.name, s.emoji)} className="rounded-full bg-surface px-3 py-1.5 text-[12.5px] font-semibold">{s.emoji} {s.name}</button>
          ))}
        </div>
      )}

      <div className="mt-5 flex justify-center gap-4 text-[12.5px] font-semibold text-muted">
        <button onClick={onExport} disabled={!lists.length} className="flex items-center gap-1.5 disabled:opacity-40"><Download className="size-3.5" /> Back up lists</button>
        <button onClick={() => file.current?.click()} className="flex items-center gap-1.5"><Upload className="size-3.5" /> Restore</button>
        <input ref={file} type="file" accept="application/json,.json" className="hidden"
          onChange={async (e) => { const f = e.target.files?.[0]; if (f) onImport(await f.text()); e.target.value = '' }} />
      </div>
    </>
  )
}

function ListDetail({ list, lists, onBack, onRename, onDelete, onQty, onRemove, onMove, onAddToCart, onShare }: Props & { list: ShoppingList; onBack: () => void }) {
  const [picked, setPicked] = useState<Set<string>>(() => new Set())
  const [sort, setSort] = useState<ListSort>('saved')
  const [menu, setMenu] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState(list.name)
  const [emoji, setEmoji] = useState(list.emoji)

  useEffect(() => { setPicked(new Set()); setMenu(null); setEditing(false); setConfirmDelete(false); setName(list.name); setEmoji(list.emoji) }, [list.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const items = useMemo(() => sortItems(list.items, sort), [list.items, sort])
  const last = useMemo(() => new Set(sameAsLastTime(list)), [list])
  const pickedItems = list.items.filter((i) => picked.has(i.key))
  const toggle = (k: string) => setPicked((p) => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n })
  const lastSeen = list.items.length ? Math.min(...list.items.map((i) => i.lastSeenAt)) : Date.now()
  const others = lists.filter((l) => l.id !== list.id)

  async function add() {
    setBusy(true)
    try { await onAddToCart(list.id, [...picked]); setPicked(new Set()) } finally { setBusy(false) }
  }

  return (
    <div className="pb-20">
      <div className="flex items-center gap-2">
        <button onClick={onBack} aria-label="All lists" className="-ml-1 grid size-9 place-items-center rounded-full text-muted"><ArrowLeft className="size-5" /></button>
        <h3 className="flex-1 truncate font-display text-[20px] font-bold">{list.emoji} {list.name}</h3>
        <button onClick={() => setEditing((e) => !e)} aria-label="List options" className="grid size-9 place-items-center rounded-full bg-surface text-muted"><MoreHorizontal className="size-4" /></button>
      </div>
      <p className="ml-9 text-[12.5px] text-muted">{list.items.length} products{list.items.length ? ` · prices from ${ago(lastSeen)}` : ''}</p>

      {editing && (
        <div className="mt-3 space-y-3 rounded-card bg-surface p-4">
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-xl bg-chip px-3 py-2.5 text-[14.5px] font-semibold outline-none" />
          <div className="flex flex-wrap gap-1.5">
            {EMOJIS.map((e) => (
              <button key={e} onClick={() => setEmoji(e)} className={cn('grid size-9 place-items-center rounded-xl text-[18px]', e === emoji ? 'bg-ink' : 'bg-chip')}>{e}</button>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={() => { onRename(list.id, name, emoji); setEditing(false) }} className="flex-1 rounded-xl bg-ink py-2.5 text-[13.5px] font-semibold text-bg">Save</button>
            <button onClick={() => onShare(list.id, picked.size ? [...picked] : list.items.map((i) => i.key))} className="flex items-center gap-1.5 rounded-xl bg-chip px-3 text-[13px] font-semibold"><Share2 className="size-3.5" /> Share</button>
            {confirmDelete ? (
              <button onClick={() => onDelete(list.id)} className="rounded-xl bg-accent px-3 text-[13px] font-semibold text-white">Delete list?</button>
            ) : (
              <button onClick={() => setConfirmDelete(true)} aria-label="Delete list" className="grid w-10 place-items-center rounded-xl bg-chip text-muted"><Trash2 className="size-4" /></button>
            )}
          </div>
        </div>
      )}

      {list.items.length === 0 ? (
        <p className="py-12 text-center text-[13.5px] text-muted">This list is empty. Tap the bookmark on any product to save it here.</p>
      ) : (
        <>
          <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
            <Chip on={false} disabled={!last.size} onClick={() => setPicked(new Set(last))}>Same as last time</Chip>
            <Chip on={false} onClick={() => setPicked(new Set(list.items.map((i) => i.key)))}>Select all</Chip>
            <Chip on={false} disabled={!picked.size} onClick={() => setPicked(new Set())}>Clear</Chip>
            <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as ListSort)}
              className="shrink-0 rounded-full bg-surface px-3 py-1.5 text-[12.5px] font-semibold outline-none">
              {SORTS.map((s) => <option key={s.value} value={s.value}>Sort: {s.label}</option>)}
            </select>
          </div>

          <ul className="mt-3 divide-y divide-line overflow-hidden rounded-card bg-surface">
            {items.map((i) => {
              const price = currentPrice(i)
              const best = i.lastOffers.filter((o) => o.inStock).sort((a, b) => a.price - b.price)[0]
              const drop = priceDrop(i)
              const on = picked.has(i.key)
              return (
                <li key={i.key} className={cn('px-3 py-2.5', price === undefined && 'opacity-55')}>
                  <div className="flex items-center gap-2.5">
                    <button onClick={() => toggle(i.key)} aria-pressed={on} aria-label={`Pick ${i.variant}`}
                      className={cn('grid size-[22px] shrink-0 place-items-center rounded-md border-2', on ? 'border-ink bg-ink text-bg' : 'border-line')}>
                      {on && <Check className="size-3.5" />}
                    </button>
                    <PackIcon variantKey={i.variantKey} imageUrl={best?.imageUrl} className="h-9 w-7" />
                    <button onClick={() => toggle(i.key)} className="min-w-0 flex-1 text-left">
                      <span className="flex items-center gap-1 text-[13.5px] font-semibold">
                        <span className="truncate">{i.brand !== 'Other' && !i.variant.startsWith(i.brand) ? `${i.brand} ` : ''}{i.variant}</span>
                        {last.has(i.key) && <Badge tone="muted">Last time</Badge>}
                        {drop > 0 && <Badge tone="good">{rupee(drop)} drop</Badge>}
                        {price === undefined && <Badge tone="warn">Not found</Badge>}
                      </span>
                      <span className="block truncate text-[11.5px] text-muted">
                        {formatSize(i.sizeGrams)}{best ? ` · ${rupee(best.price)} on ${PLATFORM[best.platform].short}` : ' · no app has it now'}
                        {best?.sample ? ' · sample' : ''}
                      </span>
                    </button>
                    <div className="flex items-center rounded-full bg-chip text-[12.5px] font-bold">
                      <button aria-label="Fewer" onClick={() => onQty(list.id, i.key, i.qty - 1)} className="grid size-7 place-items-center">−</button>
                      <span className="tabular w-4 text-center">{i.qty}</span>
                      <button aria-label="More" onClick={() => onQty(list.id, i.key, i.qty + 1)} className="grid size-7 place-items-center">+</button>
                    </div>
                    <button aria-label="Item options" onClick={() => setMenu(menu === i.key ? null : i.key)} className="grid size-7 place-items-center text-faint"><MoreHorizontal className="size-4" /></button>
                  </div>
                  {menu === i.key && (
                    <div className="mt-2 flex flex-wrap gap-1.5 pl-8">
                      {others.map((l) => (
                        <span key={l.id} className="flex overflow-hidden rounded-full bg-chip text-[12px] font-semibold">
                          <button onClick={() => { onMove(list.id, l.id, i.key, false); setMenu(null) }} className="px-2.5 py-1">Move to {l.emoji} {l.name}</button>
                          <button onClick={() => { onMove(list.id, l.id, i.key, true); setMenu(null) }} className="border-l border-line px-2 py-1 text-muted">Copy</button>
                        </span>
                      ))}
                      <button onClick={() => { onRemove(list.id, i.key); setMenu(null) }} className="rounded-full bg-chip px-2.5 py-1 text-[12px] font-semibold text-accent">Remove</button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}

      {picked.size > 0 && (
        <div className="pb-safe fixed inset-x-0 bottom-0 z-50 mx-auto max-w-lg px-4 pb-4">
          <button onClick={add} disabled={busy}
            className="flex w-full items-center justify-between rounded-2xl bg-[#14152a] px-4 py-3.5 text-[15px] font-bold text-white shadow-[0_4px_14px_rgba(20,21,42,.28)] dark:bg-[#2a2c4a]">
            <span className="flex items-center gap-2">{busy && <Loader2 className="size-4 animate-spin" />}{busy ? 'Checking prices…' : `Add ${picked.size} to cart`}</span>
            <span className="tabular text-accent">about {rupee(estimateTotal(pickedItems))}</span>
          </button>
        </div>
      )}
    </div>
  )
}

function Chip({ on, disabled, onClick, children }: { on: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button disabled={disabled} onClick={onClick}
      className={cn('shrink-0 rounded-full px-3 py-1.5 text-[12.5px] font-semibold disabled:opacity-40', on ? 'bg-ink text-bg' : 'bg-surface text-ink')}>
      {children}
    </button>
  )
}

function Badge({ tone, children }: { tone: 'good' | 'muted' | 'warn'; children: React.ReactNode }) {
  return (
    <span className={cn('shrink-0 rounded-md px-1.5 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wide',
      tone === 'good' && 'bg-good-bg text-good', tone === 'muted' && 'bg-chip text-muted', tone === 'warn' && 'bg-accent/15 text-accent')}>
      {children}
    </span>
  )
}
