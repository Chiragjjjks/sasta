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
  /** Provider's exact pack description; an "or" size must never be treated as exact. */
  packLabel?: string
  price: number
  mrp?: number
  inStock: boolean
  etaMinutes?: number
  imageUrl?: string
  deepLink: string
  fetchedAt: number
  /** True for generated preview data, never shown as a real price without saying so. */
  sample?: boolean
  /** Platform-specific payload needed later, e.g. Blinkit's cart_item for pricing a cart. */
  meta?: Record<string, unknown>
}

/** One card in the UI: the same pack, compared across platforms. */
export interface ProductGroup {
  key: string
  brand: string
  variant: string
  variantKey: string
  sizeGrams?: number
  packLabel?: string
  offers: Offer[]
  best: Offer
  pricePer100g?: number
}

export type AdapterState = 'searching' | 'done' | 'failed' | 'needs_login' | 'needs_location' | 'blocked' | 'timeout' | 'unavailable'

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

/** Thrown by platforms that have no live search yet. */
export class NotLiveError extends Error {
  constructor(platform: Platform) {
    super(`${platform} is not live yet`)
    this.name = 'NotLiveError'
  }
}

export class NeedsLocationError extends Error {
  constructor(message: string) { super(message); this.name = 'NeedsLocationError' }
}

export class ProviderBlockedError extends Error {
  constructor(message: string) { super(message); this.name = 'ProviderBlockedError' }
}
export class ProviderUnavailableError extends Error {
  constructor(message: string) { super(message); this.name = 'ProviderUnavailableError' }
}

export interface Adapter {
  platform: Platform
  timeoutMs?: number
  attempts?: number
  serial?: boolean
  setLocation(loc: Location): Promise<void>
  search(query: string, signal: AbortSignal): Promise<Offer[]>
}
