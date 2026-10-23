import { PLATFORM } from '@/lib/platforms'
import type { ProductGroup } from '@/lib/types'
import { formatSize, rupee } from '@/lib/utils'
import { PackIcon } from './PackIcon'

export function BestValueCard({ group, onOpen }: { group: ProductGroup; onOpen: () => void }) {
  const { best } = group
  return (
    <button
      onClick={onOpen}
      className="rise flex w-full items-center gap-4 rounded-[22px] bg-[#14152a] p-4 text-left text-white shadow-[0_10px_30px_rgba(20,21,42,.25)] active:scale-[.99] dark:bg-[#22243d]"
    >
      <PackIcon variantKey={group.variantKey} imageUrl={best.imageUrl} className="h-[72px] w-14" />
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-semibold uppercase tracking-[.14em] text-white/55">Best value right now</div>
        <h2 className="font-display mt-1 truncate text-[17px] font-bold">
          {group.variant}{group.sizeGrams ? `, ${formatSize(group.sizeGrams)}` : ''}
        </h2>
        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2.5">
          <span className="font-display tabular text-[28px] font-extrabold leading-none text-accent">{rupee(best.price)}</span>
          <span className="text-[12px] text-white/60">
            on {PLATFORM[best.platform].name}
            {best.etaMinutes ? ` · ${best.etaMinutes} min` : ''}
            {group.pricePer100g ? ` · ${rupee(+group.pricePer100g.toFixed(1))}/100 g` : ''}
          </span>
        </div>
      </div>
    </button>
  )
}
