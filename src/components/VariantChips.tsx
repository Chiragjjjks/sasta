import { cn } from '@/lib/utils'
import { flavorColor } from './PackIcon'

export interface VariantOption { key: string; label: string }

export function VariantChips({ options, value, onChange }: { options: VariantOption[]; value: string | null; onChange: (v: string | null) => void }) {
  if (options.length < 2) return null
  const chip = 'flex shrink-0 items-center gap-2 rounded-full px-3.5 py-2 text-[13px] font-semibold transition-colors'
  return (
    <div role="toolbar" aria-label="Flavor" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
      <button aria-pressed={value === null} onClick={() => onChange(null)} className={cn(chip, value === null ? 'bg-ink text-bg' : 'bg-surface text-ink')}>
        All {options.length} flavors
      </button>
      {options.map((o) => (
        <button
          key={o.key}
          aria-pressed={value === o.key}
          onClick={() => onChange(value === o.key ? null : o.key)}
          className={cn(chip, value === o.key ? 'bg-ink text-bg' : 'bg-surface text-ink')}
        >
          <span className="size-2.5 rounded-[3px]" style={{ background: flavorColor(o.key) }} />
          {o.label}
        </button>
      ))}
    </div>
  )
}
