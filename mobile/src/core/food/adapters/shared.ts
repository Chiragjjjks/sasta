import { NeedsLocationError, type Location } from '@/core/types'

export const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
export const array = (value: unknown): unknown[] => Array.isArray(value) ? value : []
export const text = (value: unknown): string | undefined => typeof value === 'string' && value.trim() ? value.trim() : undefined
export const id = (value: unknown): string | undefined => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? String(value) : typeof value === 'string' && /^[\w-]+$/.test(value) ? value : undefined
export const positive = (value: unknown): number | undefined => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
export const numeric = (value: unknown): number | undefined => positive(typeof value === 'string' && /^\d+(\.\d+)?$/.test(value) ? Number(value) : value)

export function https(value: unknown, origin?: string): string | undefined {
  if (typeof value !== 'string') return
  try {
    const url = new URL(value, origin)
    if (url.protocol === 'https:' && !url.username && !url.password && (!origin || url.origin === origin)) return url.href
  } catch {}
}

export function exactLocation(loc: Location | undefined, name: string): asserts loc is Location & { lat: number; lng: number } {
  if (typeof loc?.lat !== 'number' || typeof loc.lng !== 'number' || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lng) || Math.abs(loc.lat) > 90 || Math.abs(loc.lng) > 180) {
    throw new NeedsLocationError(`${name} needs an exact delivery location. Use current location or pick your area.`)
  }
}
