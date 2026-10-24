import { Bookmark, Check, Plus } from 'lucide-react'
import { memo } from 'react'
import { inStockCount } from '@/lib/normalize'
import { PLATFORM } from '@/lib/platforms'
import type { ProductGroup } from '@/lib/types'
import { cn, formatSize, rupee } from '@/lib/utils'
import { PackIcon } from './PackIcon'

function ProductCardImpl({ group, total, onOpen, index, inCart, onAdd, saved, onSave }: {
  group: ProductGroup; total: number; onOpen: () => void; index: number; inCart: number; onAdd: () => void
  saved: boolean; onSave: () => void
}) {
  const { best } = group
  const inStock = group.offers.filter((o) => o.inStock)
  // Cheapest offer is already the big price on the right; pills show the next ones.
  const pills = inStock.slice(1, 3)
  const more = inStock.length - 1 - pills.length
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onOpen()}
      style={index < 6 ? { animationDelay: `${index * 30}ms` } : undefined}
      className={cn(index < 6 && 'rise', 'w-full cursor-pointer rounded-card bg-surface p-3.5 text-left shadow-[0_1px_2px_rgba(20,21,42,.05)] active:scale-[.99]')}
    >
      <div className="flex items-start gap-3">
        <PackIcon variantKey={group.variantKey} imageUrl={best.imageUrl} className="h-12 w-10" />
        <div className="min-w-0 flex-1">
          <div className="font-display line-clamp-2 text-[15px] font-bold leading-snug">{group.variant}</div>
          <div className="mt-0.5 text-[12px] text-muted">
            {formatSize(group.sizeGrams) || group.brand} · on {inStockCount(group)} of {total} apps
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-display tabular text-[20px] font-extrabold leading-none">{best.inStock ? rupee(best.price) : '—'}</div>
          {best.mrp && best.mrp > best.price && <div className="tabular mt-0.5 text-[11.5px] text-faint line-through">{rupee(best.mrp)}</div>}
          <div className="mt-0.5 whitespace-nowrap text-[11.5px] font-semibold text-good">
            {PLATFORM[best.platform].short}{best.etaMinutes ? <span className="font-normal text-muted"> · {best.etaMinutes}m</span> : ''}
          </div>
        </div>
      </div>
      <div className="mt-2.5 flex items-center gap-2 pl-[52px]">
        <div className="flex min-w-0 flex-1 gap-1 overflow-hidden">
          {pills.map((o) => (
            <span key={o.platform} className="tabular whitespace-nowrap rounded-md bg-chip px-1.5 py-0.5 text-[11px] font-medium text-muted">
              {PLATFORM[o.platform].short} {rupee(o.price)}
            </span>
          ))}
          {more > 0 && <span className="rounded-md bg-chip px-1.5 py-0.5 text-[11px] text-muted">+{more}</span>}
        </div>
        <button
          aria-label={saved ? 'Saved to a list' : 'Save to list'}
          onClick={(e) => { e.stopPropagation(); onSave() }}
          className={cn('grid size-8 shrink-0 place-items-center rounded-full active:scale-95', saved ? 'bg-ink text-bg' : 'bg-chip text-muted')}
        >
          <Bookmark className={cn('size-3.5', saved && 'fill-current')} />
        </button>
        {best.inStock && (
          <button
            aria-label={inCart ? `Add another, ${inCart} in cart` : 'Add to cart'}
            onClick={(e) => { e.stopPropagation(); onAdd() }}
            className={cn(
              'flex h-8 shrink-0 items-center justify-center gap-1 rounded-full px-3 text-[12px] font-bold transition-colors active:scale-95',
              inCart ? 'bg-good-bg text-good' : 'bg-ink text-bg',
            )}
          >
            {inCart ? <><Check className="size-3.5" />{inCart}</> : <><Plus className="size-3.5" />Add</>}
          </button>
        )}
      </div>
    </div>
  )
}

/** Cards only re-render when their own pack, cart count or saved state changes. */
export const ProductCard = memo(ProductCardImpl, (a, b) =>
  a.group === b.group && a.inCart === b.inCart && a.saved === b.saved && a.index === b.index && a.total === b.total)

export function ProductCardSkeleton() {
  return (
    <div className="flex items-center gap-3.5 rounded-card bg-surface p-4">
      <div className="skeleton h-14 w-11 rounded-lg" />
      <div className="flex-1 space-y-2">
        <div className="skeleton h-4 w-2/3 rounded" />
        <div className="skeleton h-3 w-1/3 rounded" />
        <div className="skeleton h-4 w-4/5 rounded" />
      </div>
    </div>
  )
}
