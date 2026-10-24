import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { CartItem } from './cart'
import { billsFor, blinkitRuleFromBill, cheapestAfterFees, feesFor, grandTotal, type FeeRules } from './fees'
import type { Offer, Platform } from './types'

const bill = JSON.parse(readFileSync(new URL('../../fixtures/blinkit/cart-bill.json', import.meta.url), 'utf8'))
const o = (platform: Platform, price: number): Offer => ({ platform, productId: platform + price, title: 't', price, inStock: true, deepLink: '', fetchedAt: 0 })
const item = (key: string, offers: Offer[], qty = 1): CartItem => ({ key, brand: 'B', variant: key, variantKey: key, query: key, qty, offers, updatedAt: 0 })

describe('fees', () => {
  const rule = blinkitRuleFromBill(bill, 0)!

  it("reads Blinkit's real bill: ₹25 delivery below ₹99, ₹2 handling", () => {
    expect(rule).toMatchObject({ platform: 'blinkit', delivery: 25, freeAbove: 99, handling: 2 })
    expect(feesFor(rule, 78)).toMatchObject({ delivery: 25, handling: 2 })
    expect(78 + 25 + 2).toBe(bill.cart_data.bill_details.payable_amount)
    expect(feesFor(rule, 120).delivery).toBe(0)
  })

  it('prefers one delivery when splitting would cost more in fees', () => {
    const rules: FeeRules = { blinkit: rule, zepto: { ...rule, platform: 'zepto', delivery: 30, freeAbove: 199, handling: 3 } }
    const items = [item('chips', [o('blinkit', 39), o('zepto', 36)]), item('noodles', [o('blinkit', 14), o('zepto', 15)])]
    // Cheapest per item: chips on Zepto (36) + noodles on Blinkit (14) = 50 + 33 + 27 fees = 110.
    const mix = billsFor(items, { chips: 'zepto', noodles: 'blinkit' }, rules)
    expect(grandTotal(mix)).toBe(36 + 33 + 14 + 27)
    // All on Blinkit: 53 + 27 = 80.
    const best = cheapestAfterFees(items, rules)
    expect(best.assign).toEqual({ chips: 'blinkit', noodles: 'blinkit' })
    expect(best.total).toBe(80)
  })

  it('crosses the free-delivery threshold when that is cheaper', () => {
    const rules: FeeRules = { blinkit: rule }
    const items = [item('big', [o('blinkit', 60), o('zepto', 55)]), item('small', [o('blinkit', 45)])]
    // Blinkit for both: 105 >= 99, free delivery → 105 + 2 = 107. Zepto has no known fees, so splitting costs 55 + 45 + 27 = 127.
    expect(cheapestAfterFees(items, rules)).toEqual({ assign: { big: 'blinkit', small: 'blinkit' }, total: 107 })
  })
})
