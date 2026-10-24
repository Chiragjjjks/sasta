import { afterEach, describe, expect, it, vi } from 'vitest'
import { PlatformSession } from '@/native/platformSession'
import { parsePageProducts, createPageAdapter, type PageSnapshot } from './page'

const good = { id: 'one', title: 'Milk', price: 24, inStock: true, url: 'https://www.zepto.com/pn/milk/pvid/one' }
afterEach(() => vi.restoreAllMocks())
describe('untrusted provider responses', () => {
  it('skips malformed rows, unsafe links, invalid prices and duplicates without crashing search', () => {
    const products = [null, {}, { ...good, title: 42 }, { ...good, price: Infinity }, { ...good, url: 'https://evil.example/p' }, { ...good, url: 'https://www.zepto.com@evil.example/p' }, good, good]
    expect(parsePageProducts('zepto', { kind: 'products', products } as PageSnapshot)).toHaveLength(1)
  })
  it('rejects a broken product-list contract rather than reporting zero matches', () => {
    for (const products of [undefined, {}, 'bad']) expect(() => parsePageProducts('zepto', { kind: 'products', products } as PageSnapshot)).toThrow('invalid product list')
  })
  it('classifies native page timeouts and cleans up the page', async () => {
    vi.spyOn(PlatformSession, 'pageRun').mockResolvedValue({ ok: false, error: 'Timed out' })
    const reset = vi.spyOn(PlatformSession, 'pageReset')
    const adapter = createPageAdapter('zepto', 'https://www.zepto.com', 'Zepto', () => '/', () => '')
    await adapter.setLocation({ label: 'Test', pincode: '560010' })
    await expect(adapter.search('milk', new AbortController().signal)).rejects.toMatchObject({ name: 'TimeoutError' })
    expect(reset).toHaveBeenCalledTimes(2)
  })
})
