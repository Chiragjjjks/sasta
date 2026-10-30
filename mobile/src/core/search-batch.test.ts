import { afterEach, describe, expect, it, vi } from 'vitest'
import { batchSleep, buildBatch, createBatchScheduler, parseTerms, rankGroups, sectionState } from './search-batch'
import type { SearchBatch } from './search-batch'
import type { SearchCallbacks } from './search'
import type { Offer, ProductGroup } from './types'

const offer = (overrides: Partial<Offer> = {}): Offer => ({ platform: 'blinkit', productId: 'milk', title: 'Amul milk', price: 30,
  inStock: true, deepLink: '', fetchedAt: 0, ...overrides })
const group = (key: string, overrides: Partial<Offer> = {}): ProductGroup => ({ key, brand: 'Amul', variant: 'milk', variantKey: 'milk',
  best: offer(overrides), offers: [offer(overrides)] })

describe('parseTerms', () => {
  it('splits commas and newlines and drops blanks', () => {
    expect(parseTerms(', lays,\nmaggi\n, ,butter,')).toEqual({ terms: ['lays', 'maggi', 'butter'], rejected: [] })
  })
  it('deduplicates case-insensitively and keeps the first spelling', () => {
    expect(parseTerms('Lays, lays, LAYS,Maggi')).toEqual({ terms: ['Lays', 'Maggi'], rejected: [] })
  })
  it('collapses whitespace including Windows newlines and tabs', () => {
    expect(parseTerms('  Amul   butter\r\n amul\tbutter,  milk  ')).toEqual({ terms: ['Amul butter', 'milk'], rejected: [] })
  })
  it('returns every distinct excess term without silently accepting it', () => {
    expect(parseTerms('a,b,c,d,e,f,F,g')).toEqual({ terms: ['a', 'b', 'c', 'd', 'e'], rejected: ['f', 'g'] })
  })
  it('accepts empty text', () => expect(parseTerms(' \n, ')).toEqual({ terms: [], rejected: [] }))
})

describe('batch helpers', () => {
  it('builds distinct batch and section identities with queued initial state', () => {
    const b = buildBatch(['milk', 'bread'], 4, 'first')
    expect(b).toMatchObject({ contextVersion: 4, stale: false })
    expect(new Set(b.sections.map(s => s.id)).size).toBe(2)
    expect(b.sections[0]).toMatchObject({ text: 'milk', state: 'queued', attempt: 0, statuses: {}, offers: {}, groups: [], elapsedMs: null })
    expect(buildBatch(['milk'], 4, 'second').id).not.toBe(b.id)
  })
  it('distinguishes done, empty and failed by successful platform answers', () => {
    const done = { blinkit: { platform: 'blinkit' as const, state: 'done' as const, count: 0 } }
    expect(sectionState(done, [group('a')])).toBe('done')
    expect(sectionState(done, [])).toBe('empty')
    expect(sectionState({}, [])).toBe('failed')
    expect(sectionState({ blinkit: { platform: 'blinkit', state: 'blocked', count: 0 } }, [group('a')])).toBe('failed')
    expect(sectionState({ ...done, zepto: { platform: 'zepto', state: 'timeout', count: 0 } }, [])).toBe('empty')
  })
  it('ranks stock, relevance, price and ETA without mutating input', () => {
    const groups = [group('out', { inStock: false, price: 1 }), group('expensive', { price: 40 }),
      group('slow', { etaMinutes: 20 }), group('fast', { etaMinutes: 5 }), group('irrelevant', { title: 'Potato chips', price: 1 })]
    expect(rankGroups(groups, 'amul milk').map(g => g.key)).toEqual(['fast', 'slow', 'expensive', 'irrelevant', 'out'])
    expect(groups[0].key).toBe('out')
  })
})

function harness(terms = ['milk', 'bread']) {
  vi.useFakeTimers()
  let version = 1
  let current: SearchBatch | null = null
  const calls: { query: string; signal: AbortSignal; cb: SearchCallbacks; finish: () => void }[] = []
  const runSearch = vi.fn((query: string, signal: AbortSignal, cb: SearchCallbacks) => new Promise<void>(finish => {
    calls.push({ query, signal, cb, finish })
  }))
  const scheduler = createBatchScheduler({ runSearch, sleep: batchSleep, now: Date.now, contextVersion: () => version,
    onChange: b => { current = b } })
  scheduler.start(buildBatch(terms, version, 'initial'))
  return { scheduler, calls, get batch() { return current! }, changeContext() { version++; scheduler.invalidate() } }
}
const tick = () => vi.advanceTimersByTimeAsync(0)
const answer = (call: ReturnType<typeof harness>['calls'][number], cached = false) => {
  if (!cached) call.cb.onStatus({ platform: 'blinkit', state: 'searching', count: 0 })
  call.cb.onOffers('blinkit', [offer()])
  call.cb.onStatus({ platform: 'blinkit', state: 'done', count: 1, ms: cached ? 0 : 10 })
  call.finish()
}
afterEach(() => vi.useRealTimers())

describe('batch scheduler', () => {
  it('runs one section at a time and waits 2 seconds after network work', async () => {
    const h = harness()
    await tick()
    expect(h.calls.map(c => c.query)).toEqual(['milk'])
    await vi.advanceTimersByTimeAsync(4000)
    expect(h.calls).toHaveLength(1)
    answer(h.calls[0]); await tick()
    expect(h.batch.sections[0]).toMatchObject({ state: 'done', attempt: 1, elapsedMs: 4000 })
    await vi.advanceTimersByTimeAsync(1999)
    expect(h.calls).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(h.calls.map(c => c.query)).toEqual(['milk', 'bread'])
    expect(h.calls[0].signal).not.toBe(h.calls[1].signal)
    h.scheduler.stop()
  })
  it('skips the gap when every reported status is a cache hit', async () => {
    const h = harness(); await tick()
    answer(h.calls[0], true); await tick()
    expect(h.calls).toHaveLength(2)
    h.scheduler.stop()
  })
  it('still paces a mixture of cached replies and network failures', async () => {
    const h = harness(); await tick()
    h.calls[0].cb.onStatus({ platform: 'zepto', state: 'searching', count: 0 })
    h.calls[0].cb.onStatus({ platform: 'zepto', state: 'failed', count: 0 })
    answer(h.calls[0], true); await tick()
    expect(h.calls).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(2000)
    expect(h.calls).toHaveLength(2)
    h.scheduler.stop()
  })
  it('stop aborts active work and ignores callbacks even if native work never settles', async () => {
    const h = harness(); await tick()
    h.scheduler.stop()
    expect(h.calls[0].signal.aborted).toBe(true)
    answer(h.calls[0]); await vi.advanceTimersByTimeAsync(5000)
    expect(h.batch.sections.map(s => s.state)).toEqual(['stopped', 'stopped'])
    expect(h.batch.sections[0].groups).toEqual([])
    expect(h.calls).toHaveLength(1)
  })
  it('cancels the gap, keeping completed sections', async () => {
    const h = harness(); await tick(); answer(h.calls[0]); await tick()
    h.scheduler.stop(); await vi.advanceTimersByTimeAsync(5000)
    expect(h.batch.sections.map(s => s.state)).toEqual(['done', 'stopped'])
    expect(h.calls).toHaveLength(1)
    expect(vi.getTimerCount()).toBe(0)
  })
  it('retry clears data, increments attempt and rejects previous attempt callbacks', async () => {
    const h = harness(['milk']); await tick()
    h.calls[0].cb.onOffers('blinkit', [offer()])
    h.scheduler.retry(h.batch.sections[0].id); await tick()
    expect(h.calls).toHaveLength(2)
    expect(h.batch.sections[0]).toMatchObject({ attempt: 2, state: 'searching', offers: {}, groups: [] })
    answer(h.calls[0]); await tick()
    expect(h.batch.sections[0].groups).toEqual([])
    answer(h.calls[1], true); await tick()
    expect(h.batch.sections[0].state).toBe('done')
  })
  it('marks changed context stale and drops late results and retries', async () => {
    const h = harness(); await tick(); h.changeContext()
    expect(h.calls[0].signal.aborted).toBe(true)
    answer(h.calls[0]); h.scheduler.retry(h.batch.sections[0].id); await tick()
    expect(h.batch.stale).toBe(true)
    expect(h.batch.sections[0].groups).toEqual([])
    expect(h.calls).toHaveLength(1)
  })
  it('removing an active section prevents its late results reappearing', async () => {
    const h = harness(); await tick()
    const removed = h.batch.sections[0].id
    h.scheduler.remove(removed); await tick()
    expect(h.calls[0].signal.aborted).toBe(true)
    answer(h.calls[0]); await tick()
    expect(h.batch.sections.map(s => s.text)).toEqual(['bread'])
    expect(h.calls).toHaveLength(2)
    h.scheduler.stop()
  })
  it('replacement and clear reject callbacks from the old batch', async () => {
    const h = harness(); await tick()
    h.scheduler.start(buildBatch(['butter'], 1, 'replacement')); await tick()
    answer(h.calls[0]); await tick()
    expect(h.batch.sections[0]).toMatchObject({ text: 'butter', groups: [] })
    expect(h.calls).toHaveLength(2)
    h.scheduler.clear(); answer(h.calls[1]); await tick()
    expect(h.batch).toBeNull()
  })
  it('settles unexpected runner rejection as failed and proceeds', async () => {
    vi.useFakeTimers()
    let batch: SearchBatch | null = null
    const scheduler = createBatchScheduler({ runSearch: async () => { throw new Error('offline') }, sleep: batchSleep,
      now: Date.now, contextVersion: () => 0, onChange: b => { batch = b } })
    scheduler.start(buildBatch(['milk', 'bread'], 0, 'offline'))
    await tick()
    expect((batch as SearchBatch | null)?.sections.map(s => s.state)).toEqual(['failed', 'failed'])
  })
})
