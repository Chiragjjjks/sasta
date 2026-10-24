import { ShoppingBag } from 'lucide-react'
import type { CartSummary } from '@/lib/cart'
import { rupee } from '@/lib/utils'

export function CartBar({ summary, extra, onOpen }: { summary: CartSummary; extra: number; onOpen: () => void }) {
  if (!summary.itemCount) return null
  return (
    <div className="pb-safe pointer-events-none fixed inset-x-0 bottom-0 z-30 mx-auto max-w-lg px-4 pb-4">
      <button
        onClick={onOpen}
        className="rise pointer-events-auto flex w-full items-center gap-3 rounded-2xl bg-[#14152a] px-4 py-3.5 text-left text-white shadow-[0_4px_14px_rgba(20,21,42,.28)] active:scale-[.99] dark:bg-[#2a2c4a]"
      >
        <span className="relative">
          <ShoppingBag className="size-5" />
          <span className="absolute -right-2 -top-2 grid size-[18px] place-items-center rounded-full bg-accent text-[10.5px] font-bold">
            {summary.itemCount}
          </span>
        </span>
        <span className="ml-1 flex-1">
          <span className="block text-[14px] font-semibold">
            {summary.itemCount} {summary.itemCount === 1 ? 'item' : 'items'} · {extra > 0 ? `${rupee(extra)} over cheapest` : 'cheapest cart'}
          </span>
          <span className="block text-[12px] text-white/60">
            from {summary.platforms.length} {summary.platforms.length === 1 ? 'app' : 'apps'}
            {summary.savingsVsMrp > 0 ? ` · saving ${rupee(summary.savingsVsMrp)} vs MRP` : ''}
          </span>
        </span>
        <span className="font-display tabular text-[20px] font-extrabold">{rupee(summary.total)}</span>
      </button>
    </div>
  )
}
