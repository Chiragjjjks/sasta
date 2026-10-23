export type Platform =
  | 'blinkit'
  | 'zepto'
  | 'instamart'
  | 'bigbasket'
  | 'flipkart_minutes'
  | 'amazon_now'

export interface Location {
  lat?: number
  lng?: number
  pincode: string
  label: string
}

/** One product listing on one platform, exactly as that platform reports it. */
export interface Offer {
  platform: Platform
  productId: string
  title: string
  brand?: string
  sizeGrams?: number
  price: number
  mrp?: number
  inStock: boolean
  etaMinutes?: number
  imageUrl?: string
  deepLink: string
  fetchedAt: number
}

/** One card in the UI: the same pack, compared across platforms. */
export interface ProductGroup {
  key: string
  brand: string
  variant: string
  variantKey: string
  sizeGrams?: number
  offers: Offer[]
  best: Offer
  pricePer100g?: number
}

export type AdapterState = 'searching' | 'done' | 'failed' | 'needs_login' | 'timeout'

export interface AdapterStatus {
  platform: Platform
  state: AdapterState
  count: number
  ms?: number
  error?: string
}

export class NeedsLoginError extends Error {
  constructor(platform: Platform) {
    super(`${platform} needs login`)
    this.name = 'NeedsLoginError'
  }
}

export interface Adapter {
  platform: Platform
  setLocation(loc: Location): Promise<void>
  search(query: string, signal: AbortSignal): Promise<Offer[]>
}
