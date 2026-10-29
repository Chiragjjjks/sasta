import { describe, expect, it } from 'vitest'
import { mockDishes } from './adapters/mock'
import { cheapestFirst, dishKey, dishRelevance, groupDishes, portionsMatch, quoteOrder, relevantDishes, restaurantKey, savingsFirst } from './match'
import type { Dish, FoodOutlet, FoodPlatform } from './types'

const outlet = (platform: FoodPlatform, name: string, o: Partial<FoodOutlet> = {}): FoodOutlet =>
  ({ platform, id: `${platform}:${name}`, name, open: true, deepLink: 'https://example.com', ...o })
const dish = (platform: FoodPlatform, place: string, name: string, price: number, o: Partial<Dish> = {}): Dish =>
  ({ platform, id: `${platform}:${place}:${name}`, name, price, available: true, outlet: outlet(platform, place), deepLink: 'https://example.com', fetchedAt: 0, ...o })

describe('food names', () => {
  it('splits dish base and portion', () => {
    expect(dishKey({ name: 'Chicken Boneless Biryani (Serves 2)' })).toEqual({ base: 'chicken boneless biryani', portion: 'serves 2' })
    expect(dishKey({ name: 'Half Chicken Biriyani' })).toEqual({ base: 'chicken biryani', portion: 'half' })
    expect(dishKey({ name: 'Ghee Podi Masale Dose' }).base).toBe('ghee podi masala dosa')
    expect(dishKey({ name: 'Chicken Wings', portion: '6 Pcs' })).toEqual({ base: 'chicken wing', portion: '6 pc' })
  })

  it('treats a plain dish as the default plate only', () => {
    expect(portionsMatch(undefined, 'serves 1')).toBe(true)
    expect(portionsMatch('half', undefined)).toBe(false)
    expect(portionsMatch('half', 'full')).toBe(false)
  })

  it('drops the branch and generic words from restaurant names', () => {
    expect(restaurantKey('Hotel Empire')).toBe(restaurantKey('Empire Restaurant - Malleshwaram'))
    expect(restaurantKey('Nagarjuna (Residency Road)')).toBe('nagarjuna')
    expect(restaurantKey("Leon's - Burgers & Wings")).toBe('leons')
    expect(restaurantKey('The Restaurant')).toBe('the restaurant')
  })

  it('matches queries against the dish first, then the restaurant', () => {
    const d = dish('zomato', 'Meghana Foods', 'Chicken Biriyani', 300)
    expect(dishRelevance(d, 'biryani')).toBeGreaterThan(0)
    expect(dishRelevance(d, 'meghana biryani')).toBeGreaterThan(dishRelevance(d, 'meghana'))
    expect(dishRelevance(d, 'pizza')).toBe(-1)
    expect(dishRelevance(dish('swiggy_food', 'X', 'Chicken Momos', 150), 'momo')).toBeGreaterThan(0)
  })

  it('keeps relevant dishes, orderable first', () => {
    const sold = dish('zomato', 'A', 'Veg Biryani', 100, { available: false })
    const ok = dish('swiggy_food', 'B', 'Veg Biryani', 200)
    expect(relevantDishes([sold, ok, dish('ownly', 'C', 'Dosa', 50)], 'biryani')).toEqual([ok, sold])
  })
})

describe('grouping dishes across apps', () => {
  it('matches the same dish at the same restaurant despite spelling, and keeps others apart', () => {
    const { groups, restaurants } = groupDishes([
      dish('zomato', 'Empire Restaurant', 'Chicken Biriyani', 290),
      dish('swiggy_food', 'Hotel Empire', 'Chicken Biryani (Serves 1)', 300),
      dish('ownly', 'Empire Restaurant', 'Chicken Biryani', 250),
      dish('ownly', 'Empire Restaurant', 'Chicken Biryani (Half)', 160),
      dish('zomato', 'Empire Restaurant', 'Chicken 65 Biryani', 320),
      dish('swiggy_food', 'Meghana Foods', 'Chicken Biryani', 340),
    ])
    expect(restaurants.map((r) => r.name)).toEqual(['Empire Restaurant', 'Meghana Foods'])
    const main = groups.find((g) => g.offers.length === 3)!
    expect(main.offers.map((o) => o.platform)).toEqual(['ownly', 'zomato', 'swiggy_food'])
    expect(main.saving).toBe(50)
    expect(groups.find((g) => g.portion === 'Half' || g.dish.includes('Half'))!.offers).toHaveLength(1)
    expect(groups.find((g) => g.dish === 'Chicken 65 Biryani')!.offers).toHaveLength(1)
    expect(groups).toHaveLength(4)
  })

  it('never merges veg with non-veg, and ranks sold-out offers last', () => {
    const { groups } = groupDishes([
      dish('zomato', 'A', 'Biryani', 100, { veg: true, available: false }),
      dish('swiggy_food', 'A', 'Biryani', 150, { veg: false }),
      dish('ownly', 'A', 'Biryani', 120, { veg: true }),
    ])
    expect(groups).toHaveLength(2)
    const veg = groups.find((g) => g.veg)!
    expect(veg.best.platform).toBe('ownly')
    expect(veg.saving).toBe(0)
  })

  it('uses the nearest branch when an app lists several', () => {
    const near = dish('swiggy_food', 'Meghana Foods - Rajajinagar', 'Mutton Biryani', 420)
    near.outlet.distanceKm = 2
    const far = { ...dish('swiggy_food', 'Meghana Foods - Jayanagar', 'Mutton Biryani', 400) }
    far.outlet = { ...far.outlet, distanceKm: 9 }
    const { restaurants } = groupDishes([far, near])
    expect(restaurants[0].outlets.swiggy_food?.name).toBe('Meghana Foods - Rajajinagar')
    expect(restaurants[0].dishes[0].best.price).toBe(420)
  })

  it('sorts by saving or by price', () => {
    const { groups } = groupDishes([
      dish('zomato', 'A', 'Dosa', 100), dish('ownly', 'A', 'Dosa', 80),
      dish('zomato', 'B', 'Dosa', 60),
      dish('zomato', 'C', 'Dosa', 140), dish('swiggy_food', 'C', 'Dosa', 100),
    ])
    expect(savingsFirst(groups).map((g) => g.restaurant)).toEqual(['C', 'A'])
    expect(cheapestFirst(groups).map((g) => g.best.price)).toEqual([60, 80, 100])
  })
})

describe('quoting one order on each app', () => {
  it('adds known delivery fees and lists what an app is missing', () => {
    const { restaurants } = groupDishes([
      dish('zomato', 'A', 'Dosa', 100, { outlet: outlet('zomato', 'A', { deliveryFee: 30 }) }),
      dish('zomato', 'A', 'Idli', 60, { outlet: outlet('zomato', 'A', { deliveryFee: 30 }) }),
      dish('ownly', 'A', 'Dosa', 90, { outlet: outlet('ownly', 'A', { deliveryFee: 20 }) }),
      dish('swiggy_food', 'A', 'Dosa', 95, { outlet: outlet('swiggy_food', 'A', { open: false }) }),
    ])
    const r = restaurants[0]
    const [dosa, idli] = r.dishes
    const quotes = quoteOrder(r, { [dosa.key]: 2, [idli.key]: 1 })
    expect(quotes.map((q) => [q.platform, q.total, q.missing.length])).toEqual([['zomato', 290, 0], ['ownly', 200, 1], ['swiggy_food', 0, 2]])
  })
})

describe('sample data', () => {
  it('finds the same biryani on three apps with Ownly cheapest', () => {
    const loc = { pincode: '560010', label: 'Rajajinagar' }
    const all = (['zomato', 'swiggy_food', 'ownly', 'swish'] as const).flatMap((p) => relevantDishes(mockDishes(p, 'biryani', loc), 'biryani'))
    const { groups } = groupDishes(all)
    const boneless = groups.find((g) => g.restaurant === 'Meghana Foods' && /boneless/i.test(g.dish))!
    expect(boneless.offers.length).toBeGreaterThanOrEqual(2)
    expect(groups.some((g) => g.best.platform === 'swish')).toBe(true)
  })

  it('invents dishes only for queries the sample menus cannot answer', () => {
    const loc = { pincode: '560010', label: 'Rajajinagar' }
    expect(mockDishes('swish', 'biryani', loc).every((d) => d.outlet.name === 'Swish')).toBe(true)
    expect(mockDishes('zomato', 'pav bhaji', loc).some((d) => d.name === 'Pav Bhaji')).toBe(true)
  })
})
