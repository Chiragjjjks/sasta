import { IS_NATIVE } from '@/core/adapters'
import { FOOD_PLATFORMS } from '@/core/platforms'
import { NotLiveError, type FoodPlatform } from '@/core/types'
import type { FoodSource } from '../types'
import { mockFoodSources } from './mock'

/**
 * Food apps with a live source. The others say "Not live yet" in the app rather than mixing sample
 * prices with real ones; the browser preview uses sample data for all of them.
 * Strategy per app: docs/platforms/<id>.md.
 */
const LIVE: Partial<Record<FoodPlatform, () => FoodSource>> = {}

function notLive(platform: FoodPlatform): FoodSource {
  return { platform, async setLocation() {}, async search() { throw new NotLiveError(platform) } }
}

export const foodSources: FoodSource[] = IS_NATIVE
  ? FOOD_PLATFORMS.map((p) => LIVE[p.id]?.() ?? notLive(p.id))
  : mockFoodSources

export const canSearchFood = (platform: FoodPlatform) => !IS_NATIVE || !!LIVE[platform]
