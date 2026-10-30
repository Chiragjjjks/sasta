import type { AdapterStatus, FoodPlatform, Location, Source } from '../types'

export type { FoodPlatform }

/** One restaurant as one food app lists it near the delivery location. */
export interface FoodOutlet {
  platform: FoodPlatform
  id: string
  name: string
  /** Locality the app shows, e.g. "Rajajinagar". */
  area?: string
  rating?: number
  ratingCount?: number
  etaMinutes?: number
  distanceKm?: number
  /** Delivery fee in rupees. Undefined when the app does not say before the cart. */
  deliveryFee?: number
  /** The app's headline offer for this restaurant, e.g. "50% off up to ₹100". */
  offer?: string
  open: boolean
  pureVeg?: boolean
  imageUrl?: string
  deepLink: string
}

/** One menu item on one app, exactly as that app prices it. */
export interface Dish {
  platform: FoodPlatform
  id: string
  name: string
  description?: string
  /** Menu price in rupees, before fees and cart offers. */
  price: number
  /** Crossed-out price when the app shows an item discount. */
  strikePrice?: number
  veg?: boolean
  bestseller?: boolean
  available: boolean
  imageUrl?: string
  /** Portion the app names: "Half", "Serves 2", "6 pcs". */
  portion?: string
  outlet: FoodOutlet
  deepLink: string
  fetchedAt: number
  /** Generated preview data; never shown as a real price without saying so. */
  sample?: boolean
  meta?: Record<string, unknown>
}

/** The same dish from the same restaurant, compared across apps. */
export interface DishGroup {
  key: string
  restaurantKey: string
  restaurant: string
  area?: string
  dish: string
  portion?: string
  veg?: boolean
  /** One offer per app: orderable first, then cheapest first. */
  offers: Dish[]
  best: Dish
  /** Priciest minus cheapest orderable price across apps. 0 when only one app has it. */
  saving: number
}

/** One restaurant found on one or more apps, with every dish matched across them. */
export interface RestaurantMatch {
  key: string
  name: string
  area?: string
  outlets: Partial<Record<FoodPlatform, FoodOutlet>>
  dishes: DishGroup[]
}

export type FoodStatus = AdapterStatus<FoodPlatform>

/** A food app's live source: search dishes and restaurants, and optionally read one outlet's whole menu. */
export interface FoodSource extends Source<FoodPlatform, Dish> {
  menu?(outlet: FoodOutlet, loc: Location, signal: AbortSignal): Promise<Dish[]>
}
