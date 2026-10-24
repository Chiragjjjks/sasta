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
  { brand: 'Crax', aliases: ['crax'] },
  { brand: 'Britannia', aliases: ['britannia'] },
  { brand: 'Dabur', aliases: ['dabur'] },
  { brand: 'Nandini', aliases: ['nandini'] },
  { brand: 'Mother Dairy', aliases: ['mother dairy'] },
  { brand: 'Milky Mist', aliases: ['milky mist'] },
  { brand: 'Cadbury', aliases: ['cadbury'] },
  { brand: 'Parle', aliases: ['parle'] },
  { brand: 'Aashirvaad', aliases: ['aashirvaad', 'ashirvaad'] },
  { brand: 'Tata', aliases: ['tata'] },
  { brand: 'Fortune', aliases: ['fortune'] },
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

export interface Pack {
  grams?: number
  amount?: number
  unit?: 'g' | 'ml' | 'count'
  count: number
  ambiguous: boolean
  identity: string
  label?: string
}

/** Exact pack identity. Mass, liquid volume, item counts and variable packs are distinct. */
export function parsePack(text: string): Pack {
  const t = text.toLowerCase()
  const units = '(kg|gms|gm|grams|gram|g|litres|litre|liters|liter|ltr|ml|l)\\b'
  if (/\d+(?:\.\d+)?\s*(?:kg|g|gm|ml|l)?\s*(?:or|to|[-–])\s*\d+(?:\.\d+)?\s*(?:kg|g|gm|ml|l)\b/i.test(t)) {
    return { count: 1, ambiguous: true, identity: 'variable', label: text.trim() }
  }
  const multi = t.match(new RegExp(`(\\d+)\\s*[x×]\\s*(\\d+(?:\\.\\d+)?)\\s*${units}`))
  const reverse = t.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${units}\\s*[x×]\\s*(\\d+)`))
  const single = t.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${units}`))
  const count = multi ? +multi[1] : reverse ? +reverse[3] : +(t.match(/pack of (\d+)/)?.[1] ?? 1)
  const value = multi ? +multi[2] : reverse ? +reverse[1] : single ? +single[1] : undefined
  const rawUnit = multi?.[3] ?? reverse?.[2] ?? single?.[2]
  if (value !== undefined && rawUnit) {
    const liquid = /^(?:l|ml|ltr|lit)/.test(rawUnit)
    const factor = rawUnit === 'kg' || (liquid && rawUnit !== 'ml') ? 1000 : 1
    const amount = Math.round(value * factor * count * 1000) / 1000
    const unit = liquid ? 'ml' as const : 'g' as const
    const simple = amount >= 1000 ? `${+(amount / 1000).toFixed(3)} ${liquid ? 'l' : 'kg'}` : `${amount} ${unit}`
    return { count, ambiguous: false, amount, unit, grams: liquid ? undefined : amount,
      identity: `${amount}${liquid ? 'ml' : ''}${count > 1 ? `@${count}` : ''}`,
      label: count > 1 ? `${count} × ${+(amount / count).toFixed(3)} ${unit}` : simple }
  }
  const pieces = t.match(/(?:pack of\s+)?(\d+)\s*(?:pcs?|pieces?|count|units?|eggs)\b/)
  if (pieces) return { count: +pieces[1], ambiguous: false, amount: +pieces[1], unit: 'count', identity: `count:${+pieces[1]}`, label: `${+pieces[1]} pcs` }
  return { count: 1, ambiguous: false, identity: '?' }
}

export function parseSizeGrams(title: string): number | undefined { return parsePack(title).grams }

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
export function residualVariant(title: string, brand?: string, stripNoise = true): string {
  let n = normalizeText(title)
  if (brand) for (const a of BRANDS.find((b) => b.brand === brand)?.aliases ?? [brand]) n = n.replace(normalizeText(a), ' ')
  n = n.replace(/\d+(?:\.\d+)?\s*(kg|gms|gm|grams|gram|g|ltr|ml|l)\b/g, ' ').replace(/\b\d+\s*x\b/g, ' ')
  n = n.replace(/\bpack of\s*\d+\b|\b\d+\s*(?:packs?|pcs?|pieces?|count|units?)\b|\beach\b/g, ' ')
  if (stripNoise) for (const w of NOISE) n = n.replace(new RegExp(`(^| )${w}( |$)`, 'g'), ' ')
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
  return inter / (A.size + B.size - inter)
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase())
}

export function compareOffers(a: Offer, b: Offer): number {
  if (a.inStock !== b.inStock) return a.inStock ? -1 : 1
  if (a.price !== b.price) return a.price - b.price
  return (a.etaMinutes ?? 99) - (b.etaMinutes ?? 99)
}

export function canonicalBrand(offer: Pick<Offer, 'brand' | 'title'>): string {
  return detectBrand(offer.brand || '') ?? detectBrand(offer.title) ?? (offer.brand ? titleCase(normalizeText(offer.brand)) : 'Other')
}

/** Groups only the same brand, product line and exact pack; one offer per app. */
export function groupOffers(offers: Offer[]): ProductGroup[] {
  interface Draft { brand: string; variant: string; variantKey: string; pack: Pack; packKey: string; offers: Offer[] }
  const drafts: Draft[] = []
  for (const offer of offers) {
    const brand = canonicalBrand(offer)
    const pack = parsePack(offer.packLabel || offer.title)
    if (!pack.amount && !pack.ambiguous && offer.sizeGrams) Object.assign(pack, { amount: offer.sizeGrams, grams: offer.sizeGrams, unit: 'g', identity: String(offer.sizeGrams), label: `${offer.sizeGrams} g` })
    const rule = brand === 'Other' ? undefined : detectVariant(offer.title, brand)
    const line = normalizeText(offer.title).match(/\b(maxx|gourmet|baked|multigrain|wavy|wafer|peanuts)\b/g)?.sort().join('-')
    const variantKey = rule ? `${rule.key}${line ? `:${line}` : ''}` : `raw:${residualVariant(offer.title, brand)}`
    const variant = rule ? `${rule.label}${line ? ` · ${titleCase(line.replace(/-/g, ' '))}` : ''}` : titleCase(residualVariant(offer.title, brand) || offer.title)
    // A variable/unknown pack never silently borrows a different app's size or price.
    const packKey = pack.ambiguous || pack.identity === '?' ? `${pack.identity}:${offer.platform}:${offer.productId}` : pack.identity
    const withSize = { ...offer, brand, sizeGrams: pack.grams, packLabel: pack.label ?? offer.packLabel }
    let target = drafts.find((d) => d.brand === brand && d.variantKey === variantKey && d.packKey === packKey)
    if (!target && !rule && brand !== 'Other' && pack.identity !== '?' && !pack.ambiguous) {
      target = drafts.find((d) => d.brand === brand && d.packKey === packKey && d.variantKey.startsWith('raw:') && similarity(d.variantKey.slice(4), variantKey.slice(4)) >= 0.9)
    }
    if (target) target.offers.push(withSize)
    else drafts.push({ brand, variant, variantKey, pack, packKey, offers: [withSize] })
  }
  return drafts.map((d) => {
    const seen = new Set<string>()
    const sorted = [...d.offers].sort(compareOffers).filter((o) => { if (seen.has(o.platform)) return false; seen.add(o.platform); return true })
    const best = sorted[0]
    return { key: `${d.brand}|${d.variantKey}|${d.packKey}`, brand: d.brand, variant: d.variant, variantKey: d.variantKey,
      sizeGrams: d.pack.grams, packLabel: d.pack.label, offers: sorted, best,
      pricePer100g: best.inStock && d.pack.grams ? best.price / d.pack.grams * 100 : undefined }
  })
}

/** Filter provider ads/suggestions by the requested brand, flavour, words and pack. */
export function relevance(offer: Offer, query: string): number {
  const brand = detectBrand(query)
  if (brand && canonicalBrand(offer) !== brand) return -1
  const variant = brand ? detectVariant(query, brand) : undefined
  if (variant && detectVariant(offer.title, brand)?.key !== variant.key) return -1
  const pack = parsePack(query)
  const actual = parsePack(offer.packLabel || offer.title)
  if (pack.amount !== undefined && (actual.ambiguous || actual.unit !== pack.unit || actual.amount !== pack.amount || (pack.count > 1 && actual.count !== pack.count))) return -1
  let words = residualVariant(query, brand, false)
  if (variant) for (const alias of [...variant.aliases].sort((a,b)=>b.length-a.length)) words = words.replace(normalizeText(alias), ' ')
  words = words.replace(/\b\d+\s*(?:pcs?|pieces?|count|units?)\b/g, ' ')
  const terms = words.split(' ').filter(t => t.length > 1 && !['and','the','for','with','of','each'].includes(t))
  const hay = normalizeText(`${offer.brand || ''} ${offer.title}`)
  if (!terms.every(t => hasPhrase(hay,t))) return -1
  return (brand ? 30 : 0) + (variant ? 30 : 0) + (pack.amount ? 30 : 0) + terms.length * 5
}

export function relevantOffers(offers: Offer[], query: string): Offer[] {
  return offers.filter(o => Number.isFinite(o.price) && o.price > 0 && relevance(o, query) >= 0)
    .sort((a,b) => Number(b.inStock)-Number(a.inStock) || relevance(b,query)-relevance(a,query) || compareOffers(a,b))
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
