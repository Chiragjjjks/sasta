import { Platform as RNPlatform } from 'react-native'
import { PLATFORMS } from '@/core/platforms'
import { NotLiveError, type Adapter, type Platform } from '@/core/types'
import { createBlinkitAdapter } from './blinkit'
import { createInstamartAdapter } from './instamart'
import { createBigbasketAdapter } from './bigbasket'
import { createZeptoAdapter } from './zepto'
import { createFlipkartAdapter } from './flipkart'
import { createAmazonNowAdapter } from './amazon-now'
import { mockAdapters } from './mock'

/**
 * In the Android app, only live adapters return prices; platforms without one say "Not live yet"
 * rather than mixing generated prices with real ones. The browser preview has no live access,
 * so it uses sample data for every platform.
 */
const LIVE: Partial<Record<Platform, () => Adapter>> = {
  blinkit: createBlinkitAdapter,
  instamart: createInstamartAdapter,
  zepto: createZeptoAdapter,
  bigbasket: createBigbasketAdapter,
  flipkart_minutes: createFlipkartAdapter,
  amazon_now: createAmazonNowAdapter,
}

function notLive(platform: Platform): Adapter {
  return {
    platform,
    async setLocation() {},
    async search() { throw new NotLiveError(platform) },
  }
}

export const IS_NATIVE = RNPlatform.OS !== 'web'

export const adapters: Adapter[] = IS_NATIVE
  ? PLATFORMS.map((p) => LIVE[p.id]?.() ?? notLive(p.id))
  : mockAdapters

export const LIVE_PLATFORMS = IS_NATIVE ? (Object.keys(LIVE) as Platform[]) : []
export const IS_SAMPLE_DATA = !IS_NATIVE

export const canSearch = (platform: Platform) => !!LIVE[platform]
