import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const rupee = (n: number) => `₹${Number.isInteger(n) ? n : n.toFixed(1)}`

export function formatSize(g?: number): string {
  if (!g) return ''
  return g >= 1000 ? `${+(g / 1000).toFixed(2)} kg` : `${g} g`
}
