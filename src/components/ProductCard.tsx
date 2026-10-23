import { inStockCount } from '@/lib/normalize'
import { PLATFORM } from '@/lib/platforms'
import type { ProductGroup } from '@/lib/types'
import { cn, formatSize, rupee } from '@/lib/utils'
import { PackIcon } from './PackIcon'

export function ProductCard({ group, total, onOpen, index }: { group: ProductGroup; total: number; onOpen: () => void; index: number }) {
  const { best } = group
  const inStock = group.offers.filter((o) => o.inStock)
  const pills = inStock.slice(0, 4)
  const more = inStock.length - pills.length
  return (
    <button
      onClick={onOpen}
      style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}
      className="rise flex w-full items-center gap-3.5 rounded-card bg-surface p-4 text-left shadow-[0_1px_2px_rgba(20,21,42,.05)] active:scale-[.99]"
    >
      <PackIcon variantKey={group.variantKey} imageUrl={best.imageUrl} />
      <div className="min-w-0 flex-1">
        <div className="font-display truncate text-[15px] font-bold">{group.variant}</div>
        <div className="mt-0.5 text-[12.5px] text-muted">
          {formatSize(group.sizeGrams) || group.brand} · in stock on {inStockCount(group)} of {total}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {pills.map((o, i) => (
            <span
              key={o.platform}
              className={cn('tabular rounded-md px-1.5 py-0.5 text-[11.5px] font-medium', i === 0 ? 'bg-good-bg font-semibold text-good' : 'bg-chip text-muted')}
            >
              {PLATFORM[o.platform].short} {rupee(o.price)}
            </span>
          ))}
          {more > 0 && <span className="rounded-md bg-chip px-1.5 py-0.5 text-[11.5px] text-muted">+{more}</span>}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="font-display tabular text-[21px] font-extrabold leading-none">{best.inStock ? rupee(best.price) : '—'}</div>
        {best.mrp && best.mrp > best.price && <div className="tabular mt-1 text-[12px] text-faint line-through">{rupee(best.mrp)}</div>}
        <div className="mt-1 text-[11.5px] text-muted">
          <span className="font-semibold text-ink">{PLATFORM[best.platform].short}</span>
          {best.etaMinutes ? ` · ${best.etaMinutes}m` : ''}
        </div>
      </div>
    </button>
  )
}

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
