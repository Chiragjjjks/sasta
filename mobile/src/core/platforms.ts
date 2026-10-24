import type { Platform } from './types'

export interface PlatformMeta {
  id: Platform
  name: string
  short: string
  color: string
  /** Web search URL. On Android, App Links route these into the installed app. */
  searchUrl: (q: string) => string
}

const enc = encodeURIComponent

export const PLATFORMS: PlatformMeta[] = [
  { id: 'blinkit', name: 'Blinkit', short: 'Blinkit', color: '#f8cb46', searchUrl: (q) => `https://blinkit.com/s/?q=${enc(q)}` },
  { id: 'zepto', name: 'Zepto', short: 'Zepto', color: '#7b2fbe', searchUrl: (q) => `https://www.zeptonow.com/search?query=${enc(q)}` },
  { id: 'instamart', name: 'Instamart', short: 'Instamart', color: '#fc8019', searchUrl: (q) => `https://www.swiggy.com/instamart/search?custom_back=true&query=${enc(q)}` },
  { id: 'bigbasket', name: 'BigBasket', short: 'BigBasket', color: '#84c225', searchUrl: (q) => `https://www.bigbasket.com/ps/?q=${enc(q)}` },
  { id: 'flipkart_minutes', name: 'Flipkart Minutes', short: 'Flipkart', color: '#2874f0', searchUrl: (q) => `https://www.flipkart.com/search?q=${enc(q)}&marketplace=HYPERLOCAL` },
  { id: 'amazon_now', name: 'Amazon Now', short: 'Amazon', color: '#ff9900', searchUrl: (q) => `https://www.amazon.in/s?k=${enc(q)}` },
]

export const PLATFORM: Record<Platform, PlatformMeta> = Object.fromEntries(
  PLATFORMS.map((p) => [p.id, p]),
) as Record<Platform, PlatformMeta>
