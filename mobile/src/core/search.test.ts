import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ADAPTER_TIMEOUT_MS, clearSearchCache, runSearch } from './search'
import type { Adapter, AdapterStatus, Location, Offer } from './types'

const location: Location = { label: 'Test', pincode: '560010', lat: 12.99, lng: 77.55 }
const callbacks = () => ({ onStatus: vi.fn<(status: AdapterStatus) => void>(), onOffers: vi.fn() })
const hang = () => new Promise<Offer[]>(() => {})

describe('search recovery and cache', () => {
  beforeEach(() => { clearSearchCache(); vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('finishes after one retry even when the native adapter ignores cancellation', async () => {
    const cb = callbacks()
    const adapter: Adapter = { platform: 'blinkit', setLocation: async () => {}, search: hang }
    const task = runSearch([adapter], 'lays', location, new AbortController().signal, cb)
    await vi.advanceTimersByTimeAsync(ADAPTER_TIMEOUT_MS * 2 + 1)
    await task
    expect(cb.onStatus).toHaveBeenLastCalledWith(expect.objectContaining({ state: 'timeout' }))
    expect(cb.onOffers).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('also bounds location setup', async () => {
    const cb = callbacks()
    const task = runSearch([{ platform: 'blinkit', setLocation: async () => { await hang() }, search: vi.fn() }], 'lays', location, new AbortController().signal, cb)
    await vi.advanceTimersByTimeAsync(ADAPTER_TIMEOUT_MS * 2 + 1)
    await task
    expect(cb.onStatus).toHaveBeenLastCalledWith(expect.objectContaining({ state: 'timeout' }))
  })

  it('aborts promptly without publishing late results', async () => {
    const cb = callbacks()
    const ctrl = new AbortController()
    const adapter: Adapter = { platform: 'blinkit', setLocation: async () => {}, search: hang }
    const task = runSearch([adapter], 'lays', location, ctrl.signal, cb)
    await vi.advanceTimersByTimeAsync(1)
    ctrl.abort()
    await task
    expect(cb.onOffers).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not start work for an already cancelled search', async () => {
    const search = vi.fn(async () => [])
    const ctrl = new AbortController(); ctrl.abort()
    await runSearch([{ platform: 'blinkit', setLocation: async () => {}, search }], 'lays', location, ctrl.signal, callbacks())
    expect(search).not.toHaveBeenCalled()
  })

  it('caches by coordinates as well as pincode, and force bypasses cache', async () => {
    const search = vi.fn(async () => [])
    const adapter: Adapter = { platform: 'blinkit', setLocation: async () => {}, search }
    const run = (loc: Location, force = false) => runSearch([adapter], 'lays', loc, new AbortController().signal, callbacks(), { force })
    await run(location)
    await run(location)
    expect(search).toHaveBeenCalledTimes(1)
    await run({ ...location, lat: 13.01 })
    expect(search).toHaveBeenCalledTimes(2)
    await run(location, true)
    expect(search).toHaveBeenCalledTimes(3)
  })
  it('serializes page-backed providers without counting queue time as request time', async () => {
    const adapter: Adapter = { platform:'zepto',serial:true,timeoutMs:30,attempts:1,setLocation:async()=>{},
      search:async q=>{await new Promise(r=>setTimeout(r,25));return [{platform:'zepto',productId:q,title:q,price:20,inStock:true,deepLink:'https://www.zepto.com',fetchedAt:1}]} }
    const cb=[callbacks(),callbacks(),callbacks()]
    const work=Promise.all(['milk','butter','bread'].map((q,i)=>runSearch([adapter],q,location,new AbortController().signal,cb[i])))
    await vi.advanceTimersByTimeAsync(100)
    await work
    cb.forEach(c=>expect(c.onStatus).toHaveBeenLastCalledWith(expect.objectContaining({state:'done',count:1})))
  })
})
