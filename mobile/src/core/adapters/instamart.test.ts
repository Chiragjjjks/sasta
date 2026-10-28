import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createInstamartAdapter, parseInstamartSearch, parseSwiggyAddresses, type SelectedAddress } from './instamart'
import { McpClient } from '../mcp'
import { exchangeCode, refreshTokens } from '../oauth'
import { ACCOUNT_CONFIG } from '../accounts'

// Opt-in real HTTP test; run against the committed Postman simulation.
const endpoint = process.env.SASTA_SIMULATION_URL
const location = { label: 'Test', pincode: '560010', lat: 12.99, lng: 77.55 }
const memory = (initial: SelectedAddress | null = null) => { let v = initial; return { load: async () => v, save: async (a: SelectedAddress | null) => { v = a } } }
const adapter = (token = 'simulation-only', store = memory()) => createInstamartAdapter(signal => new McpClient(`${endpoint}/instamart/im`, async () => token, signal), store)
// Trimmed from a signed-in search_products answer on 2026-10-28.
const live = JSON.parse(readFileSync(new URL('../../../fixtures/instamart/mcp-search.json', import.meta.url), 'utf8')).result
// Same shape as get_addresses; values are synthetic.
const book = { structuredContent: { addresses: [
  { id: 'office1', addressLine: '1 Office Road, Bengaluru', phoneNumber: 'xxx', addressCategory: 'Work', addressTag: 'Office' },
  { id: 'home22', addressLine: '22 Home Street, Rajajinagar', phoneNumber: 'xxx', addressCategory: 'Home', addressTag: 'Home' },
], total: 2, resolution: { resolutionSource: 'ranked_saved_address', needsUserClarification: true, candidateAddressIds: ['office1', 'home22'], defaultAddressId: 'home22', scoreUsed: 1 } } }

function fakeClient(answers: Record<string, (args: Record<string, unknown>) => unknown>) {
  const calls: [string, Record<string, unknown>][] = []
  return { calls, client: { callTool: async (name: string, args: Record<string, unknown>) => { calls.push([name, args]); return answers[name](args) } } as unknown as McpClient }
}

describe('Instamart contract', () => {
  it('uses the documented endpoint', () => expect(ACCOUNT_CONFIG.instamart.mcpUrl).toBe('https://mcp.swiggy.com/im'))
  it('reads the live search shape: no envelope, rupee prices, variants, stock and ETA', () => {
    const offers = parseInstamartSearch(live)
    expect(offers.length).toBeGreaterThanOrEqual(4)
    expect(offers.find(o => o.title === 'Amul Gold Pasteurised Full Cream Milk 500 ml')).toMatchObject({ platform: 'instamart', price: 34, mrp: 34, packLabel: '500 ml', inStock: true, etaMinutes: 5 })
    expect(offers.every(o => o.imageUrl?.startsWith('https://') && o.deepLink.startsWith('https://www.swiggy.com/instamart/search'))).toBe(true)
  })
  it('accepts the documented success envelope too', () => {
    const products = live.structuredContent.products
    expect(parseInstamartSearch({ structuredContent: { success: true, data: { products } } })).toHaveLength(parseInstamartSearch(live).length)
  })
  it('turns "addressId is required" into a location request, not empty results', () => {
    const refused = { isError: true, content: [{ type: 'text', text: 'addressId is required\nReport ID: ERR-X' }], structuredContent: { success: false, error: { message: 'addressId is required' } } }
    expect(() => parseInstamartSearch(refused)).toThrow(expect.objectContaining({ name: 'NeedsLocationError' }))
  })
  it('does not treat a tool error or malformed payload as empty results', () => {
    for (const raw of [null, { isError: true }, { success: true, data: { products: {} } }, { structuredContent: { products: {} } }]) expect(() => parseInstamartSearch(raw)).toThrow()
  })
  it("reads Swiggy's saved addresses and its own default", () => {
    expect(parseSwiggyAddresses(book)).toEqual({ defaultId: 'home22', addresses: [
      { id: 'office1', tag: 'Office', line: '1 Office Road, Bengaluru' }, { id: 'home22', tag: 'Home', line: '22 Home Street, Rajajinagar' }] })
  })
})

describe('Instamart adapter', () => {
  const search = () => live
  it("searches at Swiggy's default saved address and remembers it", async () => {
    const store = memory(), { calls, client } = fakeClient({ get_addresses: () => book, search_products: search })
    const offers = await createInstamartAdapter(() => client, store).search('amul milk', new AbortController().signal)
    expect(offers.length).toBeGreaterThan(0)
    expect(calls).toEqual([['get_addresses', {}], ['search_products', { query: 'amul milk', addressId: 'home22' }]])
    expect(await store.load()).toMatchObject({ id: 'home22', tag: 'Home', auto: true })
  })
  it("uses the user's chosen address without asking again", async () => {
    const { calls, client } = fakeClient({ get_addresses: () => book, search_products: search })
    await createInstamartAdapter(() => client, memory({ id: 'office1', tag: 'Office', line: '', auto: false })).search('milk', new AbortController().signal)
    expect(calls).toEqual([['search_products', { query: 'milk', addressId: 'office1' }]])
  })
  it('asks for an address when Swiggy has several and no default', async () => {
    const { client } = fakeClient({ get_addresses: () => ({ structuredContent: { ...book.structuredContent, resolution: {} } }), search_products: search })
    await expect(createInstamartAdapter(() => client, memory()).search('milk', new AbortController().signal)).rejects.toMatchObject({ name: 'NeedsLocationError' })
  })
})
describe.skipIf(!endpoint)('Instamart production client over simulated HTTP', () => {
  it('exchanges and refreshes tokens with the documented JSON encoding', async () => {
    const meta = { issuer: endpoint!, authorization_endpoint: `${endpoint}/auth/authorize`, token_endpoint: `${endpoint}/instamart/auth/token` }
    const tokens = await exchangeCode(meta, { code: 'simulation-code', verifier: 'simulation-verifier', clientId: 'fixture', redirectUri: 'http://localhost/callback', resource: 'https://mcp.swiggy.com/im', encoding: 'json' })
    expect(tokens.access_token).toBe('simulation-only')
    expect((await refreshTokens(meta, tokens, 'fixture', 'https://mcp.swiggy.com/im', 'json')).refresh_token).toBe('simulation-refresh')
  })
  it('initializes MCP, searches at the saved address and preserves variant prices and stock', async () => {
    const a = adapter(); await a.setLocation(location)
    const offers = await a.search('milk', new AbortController().signal)
    expect(offers).toHaveLength(2)
    expect(offers[0]).toMatchObject({ productId: 'one', price: 24, mrp: 29, packLabel: '500 ml', inStock: true })
    expect(offers[1]).toMatchObject({ productId: 'two', price: 48, inStock: false })
  })
  it.each(['401', '403', '429', '503', 'html', 'error', 'malformed'])('does not publish prices on %s', async query => {
    const a = adapter(); await a.setLocation(location)
    await expect(a.search(query, new AbortController().signal)).rejects.toThrow()
  })
  it('reports expired credentials as needs_login', async () => {
    const a = adapter('expired'); await a.setLocation(location)
    await expect(a.search('milk', new AbortController().signal)).rejects.toMatchObject({ name: 'NeedsLoginError' })
  })
  it('aborts a hung provider request', async () => {
    const a = adapter(); await a.setLocation(location)
    const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 100)
    try { await expect(a.search('hang', ctrl.signal)).rejects.toMatchObject({ name: 'AbortError' }) }
    finally { clearTimeout(timer) }
  })
})
