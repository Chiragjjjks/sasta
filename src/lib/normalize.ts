import type { Offer, ProductGroup } from './types'

/**
 * Title normalisation, size parsing and grouping.
 * Platforms spell the same pack differently ("Lay's India's Magic Masala Potato Chips 48 g",
 * "Lays Magic Masala Chips 48gm"). Everything here turns those into one comparable key.
 */

const NOISE = [
  'potato chips', 'potato chip', 'chips', 'chip', 'crisps', 'pack of', 'combo', 'flavour', 'flavor',
  'flavoured', 'flavored', 'snack', 'namkeen', 'style', 'pouch',
]

export interface BrandRule { brand: string; aliases: string[] }
export interface VariantRule { brand: string; key: string; label: string; aliases: string[] }

export const BRANDS: BrandRule[] = [
  { brand: "Lay's", aliases: ["lay's", 'lays', 'lay s'] },
  { brand: 'Maggi', aliases: ['maggi', 'nestle maggi'] },
  { brand: 'Kurkure', aliases: ['kurkure'] },
  { brand: 'Amul', aliases: ['amul'] },
  { brand: 'Pringles', aliases: ['pringles'] },
  { brand: 'Bingo', aliases: ['bingo'] },
  { brand: 'Bikano', aliases: ['bikano'] },
]

/** Hand-made synonym map. Order matters: longer, more specific aliases first. */
export const VARIANTS: VariantRule[] = [
  { brand: "Lay's", key: 'classic-salted', label: 'Classic Salted', aliases: ['classic salted', 'salted classic', 'classic', 'salted'] },
  { brand: "Lay's", key: 'magic-masala', label: "India's Magic Masala", aliases: ["india's magic masala", 'indias magic masala', 'india s magic masala', 'magic masala', 'masala'] },
  { brand: "Lay's", key: 'cream-onion', label: 'American Style Cream & Onion', aliases: ['american style cream and onion', 'american cream and onion', 'cream and onion', 'sour cream and onion', 'sour cream onion', 'cream onion', 'onion'] },
  { brand: "Lay's", key: 'tomato-tango', label: 'Spanish Tomato Tango', aliases: ['spanish tomato tango', 'tomato tango', 'tomato'] },
  { brand: "Lay's", key: 'chile-limon', label: 'Chile Limón', aliases: ['chile limon', 'chile limón', 'chilli limon', 'chili limon', 'chile lemon', 'chilli lemon', 'limon'] },
  { brand: "Lay's", key: 'hot-sweet-chilli', label: 'West Indies Hot n Sweet Chilli', aliases: ['west indies hot n sweet chilli', 'hot n sweet chilli', 'hot and sweet chilli', 'west indies'] },
  { brand: "Lay's", key: 'sizzling-hot', label: 'Sizzling Hot', aliases: ['sizzling hot'] },
  { brand: 'Maggi', key: 'masala-noodles', label: '2-Minute Masala Noodles', aliases: ['2 minute masala noodles', '2-minute masala', 'masala noodles', 'masala'] },
  { brand: 'Maggi', key: 'atta-noodles', label: 'Atta Noodles', aliases: ['atta noodles', 'atta'] },
]

export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[’`]/g, "'")
    .replace(/[^a-z0-9.' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const UNIT_TO_G: Record<string, number> = { g: 1, gm: 1, gms: 1, gram: 1, grams: 1, kg: 1000, ml: 1, l: 1000, ltr: 1000 }

/** "48 g" → 48, "2 x 52 g" → 104, "1.2kg" → 1200, "Pack of 3 (52 g each)" → 156. */
export function parseSizeGrams(title: string): number | undefined {
  const t = title.toLowerCase()
  const unit = '(kg|gms|gm|grams|gram|g|ltr|ml|l)\\b'
  const multi = t.match(new RegExp(`(\\d+)\\s*[x×]\\s*(\\d+(?:\\.\\d+)?)\\s*${unit}`))
  if (multi) return Math.round(+multi[1] * +multi[2] * UNIT_TO_G[multi[3]])
  const single = t.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${unit}`))
  if (!single) return undefined
  let grams = +single[1] * UNIT_TO_G[single[2]]
  const packOf = t.match(/pack of (\d+)/)
  if (packOf && /each/.test(t)) grams *= +packOf[1]
  return Math.round(grams)
}

function hasPhrase(haystack: string, phrase: string): boolean {
  return new RegExp(`(^| )${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( |$)`).test(haystack)
}

export function detectBrand(title: string): string | undefined {
  const n = normalizeText(title)
  for (const b of BRANDS) if (b.aliases.some((a) => hasPhrase(n, normalizeText(a)))) return b.brand
  return undefined
}

export function detectVariant(title: string, brand?: string): VariantRule | undefined {
  const n = normalizeText(title)
  const rules = VARIANTS.filter((v) => !brand || v.brand === brand)
  // Longest matching alias wins, so "cream and onion" beats "onion".
  let best: { rule: VariantRule; len: number } | undefined
  for (const rule of rules) {
    for (const a of rule.aliases) {
      const na = normalizeText(a)
      if (hasPhrase(n, na) && (!best || na.length > best.len)) best = { rule, len: na.length }
    }
  }
  return best?.rule
}

/** Fallback variant text when no synonym rule matches: title minus brand, size and noise words. */
export function residualVariant(title: string, brand?: string): string {
  let n = normalizeText(title)
  if (brand) for (const a of BRANDS.find((b) => b.brand === brand)?.aliases ?? []) n = n.replace(normalizeText(a), ' ')
  n = n.replace(/\d+(?:\.\d+)?\s*(kg|gms|gm|grams|gram|g|ltr|ml|l)\b/g, ' ').replace(/\b\d+\s*x\b/g, ' ')
  for (const w of NOISE) n = n.replace(new RegExp(`(^| )${w}( |$)`, 'g'), ' ')
  return n.replace(/\s+/g, ' ').trim()
}

function tokenSet(s: string): Set<string> {
  return new Set(s.split(' ').filter((t) => t.length > 1))
}

/** Token-set similarity in [0, 1]. Used for offers no synonym rule recognises. */
export function similarity(a: string, b: string): number {
  const A = tokenSet(a)
  const B = tokenSet(b)
  if (!A.size || !B.size) return 0
  let inter = 0
  for (const t of A) if (B.has(t)) inter++
  return inter / Math.min(A.size, B.size)
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase())
}

export function compareOffers(a: Offer, b: Offer): number {
  if (a.inStock !== b.inStock) return a.inStock ? -1 : 1
  if (a.price !== b.price) return a.price - b.price
  return (a.etaMinutes ?? 99) - (b.etaMinutes ?? 99)
}

const SIZE_TOLERANCE = 0.05

/** Groups offers from every platform into one card per pack. Unmatched offers keep their own card. */
export function groupOffers(offers: Offer[]): ProductGroup[] {
  interface Draft { brand: string; variant: string; variantKey: string; sizeGrams?: number; offers: Offer[] }
  const drafts: Draft[] = []

  for (const offer of offers) {
    const brand = offer.brand ?? detectBrand(offer.title) ?? 'Other'
    const size = offer.sizeGrams ?? parseSizeGrams(offer.title)
    const rule = detectVariant(offer.title, brand === 'Other' ? undefined : brand)
    const variantKey = rule?.key ?? `raw:${residualVariant(offer.title, brand)}`
    const variant = rule?.label ?? titleCase(residualVariant(offer.title, brand) || offer.title)
    const withSize = { ...offer, brand, sizeGrams: size }

    const sameSize = (d: Draft) =>
      d.sizeGrams === size ||
      (d.sizeGrams !== undefined && size !== undefined && Math.abs(d.sizeGrams - size) / Math.max(d.sizeGrams, size) <= SIZE_TOLERANCE)

    let target = drafts.find((d) => d.brand === brand && d.variantKey === variantKey && sameSize(d))
    if (!target && !rule) {
      // Fuzzy fallback: same brand + size, similar leftover words.
      target = drafts.find(
        (d) => d.brand === brand && sameSize(d) && d.variantKey.startsWith('raw:') &&
          similarity(d.variantKey.slice(4), variantKey.slice(4)) >= 0.85,
      )
    }
    if (target) target.offers.push(withSize)
    else drafts.push({ brand, variant, variantKey, sizeGrams: size, offers: [withSize] })
  }

  return drafts.map((d) => {
    const sorted = [...d.offers].sort(compareOffers)
    const best = sorted[0]
    return {
      key: `${d.brand}|${d.variantKey}|${d.sizeGrams ?? '?'}`,
      brand: d.brand,
      variant: d.variant,
      variantKey: d.variantKey,
      sizeGrams: d.sizeGrams,
      offers: sorted,
      best,
      pricePer100g: best.inStock && best.sizeGrams ? (best.price / best.sizeGrams) * 100 : undefined,
    }
  })
}

/** Variant the query asks for, e.g. "lays cream onion" → cream-onion. */
export function variantFromQuery(query: string): string | undefined {
  const brand = detectBrand(query)
  if (!brand) return undefined
  return detectVariant(query, brand)?.key
}

export function inStockCount(g: ProductGroup): number {
  return g.offers.filter((o) => o.inStock).length
}
