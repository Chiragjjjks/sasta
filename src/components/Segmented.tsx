import { cn } from '@/lib/utils'

export function Segmented<T extends string | number>({
  label, value, options, onChange,
}: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-xl bg-chip p-[3px]">
      {options.map((o) => (
        <button
          key={String(o.value)}
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-[9px] px-3 py-1.5 text-[13px] font-semibold transition-all',
            o.value === value ? 'bg-surface text-ink shadow-sm' : 'text-muted',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
