import { ArrowUpRight, Minus, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { chosenOffer, singleAppOptions, summarize, type CartItem } from '@/lib/cart'
import { PLATFORM } from '@/lib/platforms'
import type { Platform } from '@/lib/types'
import { cn, formatSize, rupee } from '@/lib/utils'
import { openExternal } from './CompareSheet'
import { PackIcon } from './PackIcon'
import { Sheet } from './Sheet'

interface Props {
  open: boolean
  items: CartItem[]
  refreshing: boolean
  onClose: () => void
  onQty: (key: string, qty: number) => void
  onPin: (key: string, platform: Platform | undefined) => void
  onPinAll: (platform: Platform | undefined) => void
  onRefresh: () => void
  onClear: () => void
}

function ago(ts: number): string {
  const m = Math.round((Date.now() - ts) / 60000)
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`
}

export function CartSheet({ open, items, refreshing, onClose, onQty, onPin, onPinAll, onRefresh, onClear }: Props) {
  const summary = summarize(items)
  const cheapest = summarize(items.map((i) => ({ ...i, pinned: undefined })))
  const options = singleAppOptions(items)
  const pins = new Set(items.map((i) => i.pinned))
  const mode: 'cheapest' | Platform | 'custom' =
    pins.size === 1 && pins.has(undefined) ? 'cheapest' : pins.size === 1 ? [...pins][0]! : 'custom'
  const oldest = items.length ? Math.min(...items.map((i) => i.updatedAt)) : Date.now()

  // Lines grouped by the app they'll be bought from.
  const byPlatform = new Map<Platform, typeof summary.lines>()
  for (const l of summary.lines) if (l.offer) byPlatform.set(l.offer.platform, [...(byPlatform.get(l.offer.platform) ?? []), l])

  return (
    <Sheet open={open} onClose={onClose} title="Cart">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-display text-[20px] font-bold">Your cart</h3>
          <p className="text-[12.5px] text-muted">Prices from {ago(oldest)}</p>
        </div>
        <button
          onClick={onRefresh}
          disabled={refreshing || !items.length}
          className="flex items-center gap-1.5 rounded-full bg-surface px-3 py-2 text-[12.5px] font-semibold disabled:opacity-50"
        >
          <RefreshCw className={cn('size-3.5', refreshing && 'animate-spin')} />
          {refreshing ? 'Checking…' : 'Refresh prices'}
        </button>
      </div>

      {!items.length && <p className="py-12 text-center text-[14px] text-muted">Your cart is empty. Tap Add on any product.</p>}

      {items.length > 0 && (
        <>
          <div className="mt-4 overflow-hidden rounded-card bg-surface" role="radiogroup" aria-label="How to buy">
            <Choice
              active={mode === 'cheapest'}
              onClick={() => onPinAll(undefined)}
              title="Cheapest mix"
              subtitle={`Each item from its cheapest app · ${cheapest.platforms.length} ${cheapest.platforms.length === 1 ? 'app' : 'apps'}`}
              price={cheapest.total}
              badge="Best price"
            />
            {options.slice(0, 4).map((o) => (
              <Choice
                key={o.platform}
                active={mode === o.platform}
                onClick={() => onPinAll(o.platform)}
                dot={PLATFORM[o.platform].color}
                title={`All on ${PLATFORM[o.platform].name}`}
                subtitle={o.missing.length ? `Has ${o.covered} of ${items.length} · rest from cheapest` : 'One delivery'}
                price={o.missing.length ? undefined : o.total}
                delta={o.missing.length ? undefined : o.total - cheapest.total}
              />
            ))}
          </div>

          <div className="mt-4 space-y-3">
            {[...byPlatform].map(([platform, lines]) => (
              <section key={platform} className="overflow-hidden rounded-card bg-surface">
                <header className="flex items-center gap-2 border-b border-line px-4 py-2.5">
                  <span className="size-2.5 rounded-full" style={{ background: PLATFORM[platform].color }} />
                  <span className="flex-1 text-[13.5px] font-bold">{PLATFORM[platform].name}</span>
                  <span className="tabular text-[13px] font-semibold">{rupee(lines.reduce((s, l) => s + l.lineTotal, 0))}</span>
                </header>
                <ul className="divide-y divide-line">
                  {lines.map(({ item, offer, lineTotal }) => (
                    <li key={item.key} className="flex items-center gap-3 px-4 py-3">
                      <PackIcon variantKey={item.variantKey} imageUrl={offer?.imageUrl} className="h-10 w-8" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13.5px] font-semibold">{item.variant}</div>
                        <div className="flex items-center gap-1.5 text-[12px] text-muted">
                          {formatSize(item.sizeGrams)}
                          <PlatformPicker item={item} onPin={(p) => onPin(item.key, p)} />
                          <button aria-label={`Open ${item.variant} in ${PLATFORM[platform].name}`} onClick={() => offer && openExternal(offer.deepLink)} className="text-faint">
                            <ArrowUpRight className="size-3.5" />
                          </button>
                        </div>
                      </div>
                      <Stepper qty={item.qty} onChange={(q) => onQty(item.key, q)} />
                      <span className="tabular w-11 text-right text-[14px] font-bold">{rupee(lineTotal)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}

            {summary.unavailable.length > 0 && (
              <section className="rounded-card bg-surface px-4 py-3 opacity-60">
                <div className="text-[12.5px] font-bold">Out of stock everywhere</div>
                {summary.unavailable.map((i) => (
                  <div key={i.key} className="mt-1.5 flex items-center justify-between text-[13px]">
                    <span>{i.variant} {formatSize(i.sizeGrams)}</span>
                    <button onClick={() => onQty(i.key, 0)} aria-label="Remove" className="text-faint"><Trash2 className="size-4" /></button>
                  </div>
                ))}
              </section>
            )}
          </div>

          <div className="mt-4 rounded-card bg-surface px-4 py-3.5">
            <div className="flex items-baseline justify-between">
              <span className="text-[14px] font-semibold">Total · {summary.itemCount} {summary.itemCount === 1 ? 'item' : 'items'}</span>
              <span className="font-display tabular text-[24px] font-extrabold">{rupee(summary.total)}</span>
            </div>
            {summary.savingsVsMrp > 0 && (
              <div className="mt-0.5 flex justify-between text-[12.5px]">
                <span className="text-good font-semibold">You save {rupee(summary.savingsVsMrp)} vs MRP</span>
                <span className="tabular text-faint line-through">{rupee(summary.mrpTotal)}</span>
              </div>
            )}
            {mode !== 'cheapest' && summary.total > cheapest.total && (
              <div className="mt-1 text-[12.5px] text-accent">{rupee(summary.total - cheapest.total)} more than the cheapest mix</div>
            )}
            <p className="mt-2 text-[11.5px] text-faint">Delivery fees, handling charges and minimum order values are not included yet.</p>
          </div>

          <button onClick={onClear} className="mx-auto mt-3 block py-2 text-[12.5px] font-semibold text-muted">Clear cart</button>
        </>
      )}
    </Sheet>
  )
}

function Choice({ active, onClick, title, subtitle, price, delta, badge, dot }: {
  active: boolean; onClick: () => void; title: string; subtitle: string; price?: number; delta?: number; badge?: string; dot?: string
}) {
  return (
    <button role="radio" aria-checked={active} onClick={onClick} className="flex w-full items-center gap-3 border-b border-line px-4 py-3 text-left last:border-0">
      <span className={cn('grid size-[18px] shrink-0 place-items-center rounded-full border-2', active ? 'border-ink' : 'border-line')}>
        {active && <span className="size-2 rounded-full bg-ink" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-[14px] font-semibold">
          {dot && <span className="size-2 rounded-full" style={{ background: dot }} />}
          {title}
          {badge && <span className="rounded-md bg-good-bg px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-good">{badge}</span>}
        </span>
        <span className="block truncate text-[12px] text-muted">{subtitle}</span>
      </span>
      {price !== undefined && (
        <span className="text-right">
          <span className="tabular block text-[14.5px] font-bold">{rupee(price)}</span>
          {!!delta && <span className="tabular block text-[11.5px] text-muted">+{rupee(delta)}</span>}
        </span>
      )}
    </button>
  )
}

function PlatformPicker({ item, onPin }: { item: CartItem; onPin: (p: Platform | undefined) => void }) {
  const current = chosenOffer(item)
  const inStock = item.offers.filter((o) => o.inStock)
  if (inStock.length < 2) return null
  return (
    <select
      aria-label={`Buy ${item.variant} from`}
      value={item.pinned && item.pinned === current?.platform ? item.pinned : ''}
      onChange={(e) => onPin((e.target.value || undefined) as Platform | undefined)}
      className="max-w-[9rem] truncate rounded-md bg-chip px-1.5 py-0.5 text-[11.5px] font-semibold text-ink outline-none"
    >
      <option value="">Cheapest ({current ? `${PLATFORM[current.platform].short} ${rupee(current.price)}` : '—'})</option>
      {inStock.map((o) => (
        <option key={o.platform} value={o.platform}>{PLATFORM[o.platform].short} {rupee(o.price)}</option>
      ))}
    </select>
  )
}

function Stepper({ qty, onChange }: { qty: number; onChange: (q: number) => void }) {
  return (
    <div className="flex items-center rounded-full bg-chip">
      <button aria-label="Decrease" onClick={() => onChange(qty - 1)} className="grid size-7 place-items-center">
        {qty === 1 ? <Trash2 className="size-3.5 text-muted" /> : <Minus className="size-3.5" />}
      </button>
      <span className="tabular w-5 text-center text-[13px] font-bold">{qty}</span>
      <button aria-label="Increase" onClick={() => onChange(qty + 1)} className="grid size-7 place-items-center">
        <Plus className="size-3.5" />
      </button>
    </div>
  )
}
