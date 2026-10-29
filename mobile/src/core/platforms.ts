import type { AnyPlatform, FoodPlatform, Platform } from './types'

export interface PlatformMeta<P extends AnyPlatform = Platform> {
  id: P
  name: string
  short: string
  color: string
  /** Monogram tile that tells the apps apart at a glance (Instamart and Amazon share an orange). */
  mark: { text: string; bg: string; fg: string }
  /** Web search URL. On Android, App Links route these into the installed app. */
  searchUrl: (q: string) => string
}

const enc = encodeURIComponent

export const PLATFORMS: PlatformMeta[] = [
  { id: 'blinkit', name: 'Blinkit', short: 'Blinkit', color: '#f8cb46', mark: { text: 'B', bg: '#f8cb46', fg: '#1d1d1b' }, searchUrl: (q) => `https://blinkit.com/s/?q=${enc(q)}` },
  { id: 'zepto', name: 'Zepto', short: 'Zepto', color: '#7b2fbe', mark: { text: 'Z', bg: '#5b1e9e', fg: '#ffffff' }, searchUrl: (q) => `https://www.zepto.com/search?query=${enc(q)}` },
  { id: 'instamart', name: 'Instamart', short: 'Instamart', color: '#fc8019', mark: { text: 'I', bg: '#fc8019', fg: '#ffffff' }, searchUrl: (q) => `https://www.swiggy.com/instamart/search?custom_back=true&query=${enc(q)}` },
  { id: 'bigbasket', name: 'BigBasket', short: 'BigBasket', color: '#84c225', mark: { text: 'bb', bg: '#84c225', fg: '#1d1d1b' }, searchUrl: (q) => `https://www.bigbasket.com/ps/?q=${enc(q)}` },
  { id: 'flipkart_minutes', name: 'Flipkart Minutes', short: 'Flipkart', color: '#2874f0', mark: { text: 'F', bg: '#2874f0', fg: '#ffe11b' }, searchUrl: (q) => `https://www.flipkart.com/hyperlocal/pr?q=${enc(q)}&marketplace=HYPERLOCAL&sid=search.flipkart.com` },
  { id: 'amazon_now', name: 'Amazon Now', short: 'Amazon', color: '#ff9900', mark: { text: 'a', bg: '#232f3e', fg: '#ff9900' }, searchUrl: () => 'https://www.amazon.in/' },
]

export const PLATFORM: Record<Platform, PlatformMeta> = Object.fromEntries(
  PLATFORMS.map((p) => [p.id, p]),
) as Record<Platform, PlatformMeta>

/** Food delivery apps, in the order the Food section lists them. Marks and URLs: docs/platforms/<id>.md. */
export const FOOD_PLATFORMS: PlatformMeta<FoodPlatform>[] = [
  { id: 'zomato', name: 'Zomato', short: 'Zomato', color: '#e23744', mark: { text: 'z', bg: '#e23744', fg: '#ffffff' }, searchUrl: (q) => `https://www.zomato.com/bangalore/delivery?query=${enc(q)}` },
  { id: 'swiggy_food', name: 'Swiggy', short: 'Swiggy', color: '#fc8019', mark: { text: 'S', bg: '#fc8019', fg: '#ffffff' }, searchUrl: (q) => `https://www.swiggy.com/search?query=${enc(q)}` },
  { id: 'ownly', name: 'Ownly', short: 'Ownly', color: '#1f8a5b', mark: { text: 'O', bg: '#1f8a5b', fg: '#ffffff' }, searchUrl: () => 'https://www.ownly.app/' },
  { id: 'swish', name: 'Swish', short: 'Swish', color: '#ff5a5f', mark: { text: 'Sw', bg: '#111111', fg: '#ffffff' }, searchUrl: () => 'https://www.swishapp.in/' },
]

export const FOOD_PLATFORM: Record<FoodPlatform, PlatformMeta<FoodPlatform>> = Object.fromEntries(
  FOOD_PLATFORMS.map((p) => [p.id, p]),
) as Record<FoodPlatform, PlatformMeta<FoodPlatform>>

/** Any app's name, colour and mark, grocery or food. */
export const APP: Record<AnyPlatform, PlatformMeta<AnyPlatform>> = { ...PLATFORM, ...FOOD_PLATFORM }
