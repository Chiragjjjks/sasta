import { ArrowUpRight, ShoppingBag } from 'lucide-react'
import { PLATFORM } from '@/lib/platforms'
import type { ProductGroup } from '@/lib/types'
import { cn, formatSize, rupee } from '@/lib/utils'
import { PackIcon } from './PackIcon'
import { Sheet } from './Sheet'

export function openExternal(url: string) {
  // Capacitor hands non-app URLs to Android, where App Links open the installed app.
  window.open(url, '_blank', 'noopener')
}

export function CompareSheet({ group, onClose, inCart, onAdd }: {
  group: ProductGroup | null; onClose: () => void; inCart: number; onAdd: () => void
}) {
  const inStock = group?.offers.filter((o) => o.inStock) ?? []
  const save = inStock.length > 1 ? inStock[inStock.length - 1].price - inStock[0].price : 0
  return (
    <Sheet open={!!group} onClose={onClose} title="Price comparison">
      {group && (
        <>
          <div className="flex items-center gap-3.5">
            <PackIcon variantKey={group.variantKey} imageUrl={group.best.imageUrl} />
            <div className="min-w-0">
              <div className="text-[12px] font-semibold uppercase tracking-[.12em] text-muted">{group.brand}</div>
              <div className="font-display text-[18px] font-bold leading-tight">{group.variant}</div>
              <div className="text-[13px] text-muted">
                {formatSize(group.sizeGrams)}
                {group.pricePer100g ? ` · best ${rupee(+group.pricePer100g.toFixed(1))}/100 g` : ''}
              </div>
            </div>
          </div>

          {save > 0 && (
            <div className="mt-4 rounded-2xl bg-good-bg px-4 py-3 text-[13.5px] font-semibold text-good">
              You save {rupee(save)} buying on {PLATFORM[group.best.platform].name} instead of the priciest app.
            </div>
          )}

          <ul className="mt-4 divide-y divide-line overflow-hidden rounded-card bg-surface">
            {group.offers.map((o, i) => (
              <li key={o.productId} className={cn('flex items-center gap-3 px-4 py-3.5', !o.inStock && 'opacity-45')}>
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: PLATFORM[o.platform].color }} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[14.5px] font-semibold">{PLATFORM[o.platform].name}</span>
                    {i === 0 && o.inStock && (
                      <span className="rounded-md bg-good-bg px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-good">Cheapest</span>
                    )}
                  </div>
                  <div className="truncate text-[12px] text-muted">
                    {o.inStock ? (o.etaMinutes ? `${o.etaMinutes} min` : 'In stock') : 'Out of stock'} · {o.title}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-display tabular text-[16px] font-bold">{rupee(o.price)}</div>
                  {o.mrp && o.mrp > o.price && <div className="tabular text-[11.5px] text-faint line-through">{rupee(o.mrp)}</div>}
                </div>
                <button
                  onClick={() => openExternal(o.deepLink)}
                  disabled={!o.inStock}
                  aria-label={`Open in ${PLATFORM[o.platform].name}`}
                  className="flex items-center gap-0.5 rounded-xl bg-ink px-3 py-2 text-[12.5px] font-semibold text-bg active:scale-95 disabled:bg-chip disabled:text-faint"
                >
                  Open <ArrowUpRight className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-center text-[11.5px] text-faint">Open takes you to that app's search. Ordering happens there.</p>
          {group.best.inStock && (
            <button
              onClick={onAdd}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-ink py-3.5 text-[15px] font-semibold text-bg active:scale-[.99]"
            >
              <ShoppingBag className="size-4" />
              {inCart ? `Add another · ${inCart} in cart` : `Add to cart · ${rupee(group.best.price)} on ${PLATFORM[group.best.platform].short}`}
            </button>
          )}
        </>
      )}
    </Sheet>
  )
}
