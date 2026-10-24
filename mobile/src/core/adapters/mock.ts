import { PLATFORM, PLATFORMS } from '@/core/platforms'
import type { Adapter, Location, Offer, Platform } from '@/core/types'

/**
 * Deterministic fake data so the UI works end to end before live adapters exist.
 * Titles are deliberately spelled differently per platform so the real normalizer is exercised.
 * Replace with live adapters in src/adapters/<platform>.ts (see PLAN.md, Phase 2).
 */

interface CatalogItem { brand: string; mrp: number; size: number; titles: Partial<Record<Platform, string>> & { base: string } }

const LAYS: [string, string[]][] = [
  ['Classic Salted', ["Lay's Classic Salted Potato Chips", 'Lays Salted Classic Chips', "Lay's Potato Chips - Classic Salted"]],
  ["India's Magic Masala", ["Lay's India's Magic Masala Potato Chips", 'Lays Magic Masala Chips', "Lay's Indias Magic Masala"]],
  ['American Style Cream & Onion', ["Lay's American Style Cream & Onion Potato Chips", 'Lays Cream and Onion Chips', "Lay's American Cream & Onion Flavour"]],
  ['Spanish Tomato Tango', ["Lay's Spanish Tomato Tango Potato Chips", 'Lays Tomato Tango Chips', "Lay's Potato Chips - Spanish Tomato Tango"]],
  ['Chile Limón', ["Lay's Chile Limón Potato Chips", 'Lays Chile Limon Chips', "Lay's Chilli Lemon Flavour Chips"]],
]

function laysItems(): CatalogItem[] {
  const items: CatalogItem[] = []
  for (const [, [a, b, c]] of LAYS) {
    for (const [size, mrp, unit] of [[48, 20, '48 g'], [115, 50, '115 g']] as const) {
      items.push({
        brand: "Lay's", mrp, size,
        titles: { base: `${a} ${unit}`, zepto: `${b} ${unit.replace(' g', 'gm')}`, bigbasket: `${c} ${unit}`, amazon_now: `${a}, ${unit}` },
      })
    }
  }
  return items
}

const MAGGI: CatalogItem[] = [
  { brand: 'Maggi', mrp: 15, size: 70, titles: { base: 'Maggi 2-Minute Masala Noodles 70 g', zepto: 'Nestle Maggi Masala Noodles 70gm' } },
  { brand: 'Maggi', mrp: 112, size: 560, titles: { base: 'Maggi 2-Minute Masala Noodles 560 g', bigbasket: 'Maggi Masala Noodles 8 x 70 g' } },
  { brand: 'Maggi', mrp: 55, size: 290, titles: { base: 'Maggi Atta Noodles 290 g', zepto: 'Nestle Maggi Atta Noodles 290gm' } },
]

export function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

function genericItems(query: string): CatalogItem[] {
  const name = query.trim().replace(/\b\w/g, (c) => c.toUpperCase())
  const h = hash(query)
  const mrp = 30 + (h % 15) * 10
  return [
    { brand: name.split(' ')[0], mrp, size: 200, titles: { base: `${name} 200 g` } },
    { brand: name.split(' ')[0], mrp: Math.round(mrp * 2.3), size: 500, titles: { base: `${name} 500 g` } },
  ]
}

export function catalogFor(query: string): CatalogItem[] {
  const q = query.toLowerCase()
  if (/\blay'?s?\b|\blays\b|chips/.test(q)) return laysItems()
  if (/maggi|noodle/.test(q)) return MAGGI
  return genericItems(q)
}

export function mockOffers(platform: Platform, query: string, loc: Location): Offer[] {
  const out: Offer[] = []
  for (const item of catalogFor(query)) {
    const seed = hash(`${platform}|${item.titles.base}|${loc.pincode}`)
    // ~1 in 7 listings is missing on a platform, ~1 in 9 is out of stock.
    if (seed % 7 === 0) continue
    const discount = (seed >>> 3) % 6 // 0–5 rupees on small packs
    const scale = item.mrp / 20
    const price = Math.max(1, Math.round(item.mrp - discount * Math.max(1, scale * 0.6)))
    out.push({
      platform,
      productId: `${platform}-${seed.toString(36)}`,
      title: item.titles[platform] ?? item.titles.base,
      price,
      mrp: item.mrp,
      inStock: (seed >>> 7) % 9 !== 0,
      etaMinutes: 6 + ((seed >>> 11) % 12),
      deepLink: PLATFORM[platform].searchUrl(item.titles.base),
      fetchedAt: Date.now(),
      sample: true,
    })
  }
  return out
}

export function createMockAdapter(platform: Platform): Adapter {
  let loc: Location = { pincode: '560010', label: 'Rajajinagar' }
  return {
    platform,
    async setLocation(next) { loc = next },
    search(query, signal) {
      const delay = 350 + (hash(platform + query) % 1100)
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => resolve(mockOffers(platform, query, loc)), delay)
        signal.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('Aborted', 'AbortError')) })
      })
    },
  }
}

export const mockAdapters: Adapter[] = PLATFORMS.map((p) => createMockAdapter(p.id))
