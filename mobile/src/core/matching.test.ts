import { describe, expect, it } from 'vitest'
import { groupOffers, parsePack, relevantOffers } from './normalize'
import { migrateCart, migrateLists } from './identity'
import type { Offer } from './types'

const offer = (title: string, platform: Offer['platform'] = 'blinkit', extra: Partial<Offer> = {}): Offer => ({
  platform, productId: title, title, price: 20, inStock: true, fetchedAt: 10, deepLink: 'https://blinkit.com', ...extra,
})

describe('exact product and pack comparisons', () => {
  it('separates 48g, 50g, multi-packs and variable pack sizes', () => {
    const groups = groupOffers([
      offer("Lay's Classic Salted 48 g"), offer('Lays Classic Salted 50 g','zepto'),
      offer('Lays Classic Salted 2 x 24 g','bigbasket'),
      offer('Lays Classic Salted','zepto',{packLabel:'1 pack (48 g or 58 g)',productId:'variable'}),
    ])
    expect(groups).toHaveLength(4)
    expect(groups.find(g => g.best.productId === 'variable')).toMatchObject({sizeGrams:undefined,pricePer100g:undefined,packLabel:'1 pack (48 g or 58 g)'})
  })
  it('does not compare millilitres as grams or collapse item counts', () => {
    expect(groupOffers([offer('Amul Milk 100 ml'),offer('Amul Milk 100 g','zepto')])).toHaveLength(2)
    expect(parsePack('Dabur Honey 400 g (Pack of 2)')).toMatchObject({grams:800,count:2})
    expect(parsePack('Eggs 6 pcs')).toMatchObject({unit:'count',amount:6})
    expect(parsePack('Milk 1 l')).toMatchObject({unit:'ml',amount:1000,grams:undefined,label:'1 l'})
  })
  it('canonicalizes brand spelling and retains one current offer per app', () => {
    const [g] = groupOffers([offer('Lays Magic Masala 80 g','zepto',{brand:'LAYS',price:35}),offer("Lay's Magic Masala 80 g",'zepto',{price:30}),offer('Lays Magic Masala 80 g')])
    expect(g.offers).toHaveLength(2)
    expect(g.best.platform).toBe('blinkit')
    expect(g.brand).toBe("Lay's")
  })
  it('does not merge a generic product with a more specific variant or product line', () => {
    expect(groupOffers([offer('Acme Salted Peanuts 100 g','blinkit',{brand:'Acme'}),offer('Acme Salted Caramel Peanuts 100 g','zepto',{brand:'Acme'})])).toHaveLength(2)
    expect(groupOffers([offer('Lays Classic Salted 80 g'),offer('Lays Gourmet Classic Salted 80 g','zepto')])).toHaveLength(2)
  })
  it('drops unrelated ads, wrong flavours and wrong pack sizes from a specific search', () => {
    const results = relevantOffers([
      offer("Lay's Cream & Onion 80 g"), offer("Lay's Magic Masala 80 g"),
      offer('Bingo Cream & Onion 80 g'),offer("Lay's Cream & Onion 48 g"),
    ],'lays cream onion 80 g')
    expect(results.map(o => o.title)).toEqual(["Lay's Cream & Onion 80 g"])
    expect(relevantOffers([offer('Bananas 6 pcs'),offer('Potato Chips 80 g')], 'chips').map(o=>o.title)).toEqual(['Potato Chips 80 g'])
  })
  it('preserves saved quantities and list names while migrating older volume identities', () => {
    const milk = offer('Amul Milk 1 l','zepto')
    const cart = migrateCart([{key:'old',brand:'Amul',variant:'Milk',variantKey:'raw:milk',sizeGrams:1000,query:'amul milk',qty:3,offers:[milk],updatedAt:10}])
    expect(cart[0]).toMatchObject({qty:3,packLabel:'1 l',sizeGrams:undefined,key:'Amul|raw:milk|1000ml'})
    const lists = migrateLists([{id:'office',name:'Office groceries',emoji:'🛒',createdAt:1,updatedAt:10,items:[{...cart[0],key:'old',lastOffers:[milk],lastSeenAt:10,addedAt:1,timesPicked:4}]}])
    expect(lists[0].name).toBe('Office groceries')
    expect(lists[0].items[0]).toMatchObject({key:cart[0].key,qty:3,timesPicked:4})
  })
})
