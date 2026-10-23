import { cn } from '@/lib/utils'

const FLAVOR_COLORS: Record<string, [string, string]> = {
  'classic-salted': ['#f6cf3f', '#e0a915'],
  'magic-masala': ['#3d6be0', '#2448a8'],
  'cream-onion': ['#4caf5f', '#2f7d40'],
  'tomato-tango': ['#e5543f', '#b23322'],
  'chile-limon': ['#a04fd0', '#6d2c99'],
  'masala-noodles': ['#f6c63c', '#d9311f'],
  'atta-noodles': ['#d9a24a', '#9a6a22'],
}

export function flavorColor(variantKey: string): string {
  return (FLAVOR_COLORS[variantKey] ?? fallback(variantKey))[0]
}

function fallback(key: string): [string, string] {
  let h = 0
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) % 360
  return [`hsl(${h} 55% 55%)`, `hsl(${h} 55% 38%)`]
}

/** Stylised chip-bag illustration standing in for product photos (real adapters supply imageUrl). */
export function PackIcon({ variantKey, imageUrl, className }: { variantKey: string; imageUrl?: string; className?: string }) {
  const [top, bottom] = FLAVOR_COLORS[variantKey] ?? fallback(variantKey)
  if (imageUrl) {
    return <img src={imageUrl} alt="" className={cn('size-12 rounded-xl bg-white object-contain', className)} />
  }
  const id = `g-${variantKey.replace(/[^a-z0-9]/gi, '')}`
  return (
    <svg viewBox="0 0 48 60" className={cn('h-14 w-11 shrink-0 drop-shadow-sm', className)} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={top} />
          <stop offset="1" stopColor={bottom} />
        </linearGradient>
      </defs>
      <path d="M4 6 L8 2 L12 6 L16 2 L20 6 L24 2 L28 6 L32 2 L36 6 L40 2 L44 6 L44 52 Q44 58 38 58 L10 58 Q4 58 4 52 Z" fill={`url(#${id})`} />
      <circle cx="24" cy="30" r="9" fill="#fff" opacity=".85" />
    </svg>
  )
}
