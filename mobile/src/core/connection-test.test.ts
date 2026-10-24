import { describe, expect, it } from 'vitest'
import { connectionReport, probeSearch, type SearchProbe } from './connection-test'
import { searchLabel } from './capabilities'
import { parsePageProducts, assertDeliveryArea } from './adapters/page'
import { readFileSync } from 'node:fs'
import { relevantOffers } from './normalize'
import type { PageSnapshot } from './adapters/page'

const probe = (state: SearchProbe['status']['state'], count=0): SearchProbe => ({query:'lays',status:{platform:'zepto',state,count,error:state==='needs_location'?'Choose a delivery area':undefined},offers:[]})

describe('connection test means a real search', () => {
  it('does not pass merely because a session cookie exists', () => {
    const report=connectionReport({ok:true,detail:'Session found'},probe('needs_location'))
    expect(report.ok).toBe(false)
    expect(report.sessionOk).toBe(true)
    expect(report.detail).toContain('Choose a delivery area')
  })
  it('reports the query and matching result count', () => {
    expect(connectionReport({ok:true,detail:'Session found'},probe('done',12))).toMatchObject({ok:true,sessionOk:true})
    expect(connectionReport({ok:true,detail:'Session found'},probe('done',12)).detail).toContain('12 matching products for “lays”')
    expect(connectionReport({ok:true,detail:'Session found'},probe('done')).ok).toBe(false)
  })
  it('does not mark an anonymous search as a verified login', () => {
    expect(connectionReport({ok:false,detail:'No session'},probe('done',5))).toMatchObject({ok:true,sessionOk:false})
  })
  it('shows a connected Zepto session without a Soon or Live claim from an old login-only check', () => {
    expect(searchLabel('zepto',{platform:'zepto',status:'connected',lastTest:{ok:true,detail:'Session found',at:1}})).toBe('Connected')
    expect(searchLabel('zepto',undefined,probe('done',5).status)).toBe('Live prices')
    expect(searchLabel('zepto',undefined,probe('needs_location').status)).toBe('Set area')
  })
  it('does not pass a connection when no search adapter exists', async () => {
    const result=await probeSearch('bigbasket',undefined,'milk',{label:'Test',pincode:'560010'})
    expect(connectionReport({ok:true,detail:'Session found'},result).ok).toBe(false)
  })
})

describe('Zepto live-page contract', () => {
  const fixture=JSON.parse(readFileSync(new URL('../../fixtures/zepto/lays.json',import.meta.url),'utf8')) as PageSnapshot
  it('parses a captured first-party page and excludes the unrelated promoted products', () => {
    const raw=parsePageProducts('zepto',fixture,123)
    expect(raw).toHaveLength(30)
    expect(raw[0]).toMatchObject({platform:'zepto',price:24,mrp:25,packLabel:'1 pack (48 g or 58 g)',fetchedAt:123})
    const matches=relevantOffers(raw,'lays')
    expect(matches.length).toBeGreaterThan(8)
    expect(matches.length).toBeLessThan(raw.length)
    expect(matches.every(o=>/lay.s/i.test(o.title))).toBe(true)
  })
  it('rejects another delivery area before showing its prices', () => {
    expect(()=>assertDeliveryArea(fixture.location,{label:'Delhi',pincode:'110001',lat:28.61,lng:77.21},'Zepto')).toThrow('selected delivery area differs')
    expect(()=>assertDeliveryArea(fixture.location,{label:'Rajajinagar',pincode:'560010',lat:12.9915,lng:77.5544},'Zepto')).not.toThrow()
  })
})
