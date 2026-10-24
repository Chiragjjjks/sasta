import { describe, expect, it } from 'vitest'
import { createInstamartAdapter, parseInstamartSearch } from './instamart'
import { McpClient } from '../mcp'
import { exchangeCode, refreshTokens } from '../oauth'
import { ACCOUNT_CONFIG } from '../accounts'

// Opt-in real HTTP test; run against the committed Postman simulation.
const endpoint = process.env.SASTA_SIMULATION_URL
const location = { label: 'Test', pincode: '560010', lat: 12.99, lng: 77.55 }
const adapter = (token = 'simulation-only') => createInstamartAdapter(signal => new McpClient(`${endpoint}/instamart/im`, async () => token, signal))
describe('Instamart contract', () => {
  it('uses the documented endpoint', () => expect(ACCOUNT_CONFIG.instamart.mcpUrl).toBe('https://mcp.swiggy.com/im'))
  it('requires real coordinates rather than inventing an address', async () => {
    const a = adapter(); await a.setLocation({ label: 'Test', pincode: '560010' })
    await expect(a.search('milk', new AbortController().signal)).rejects.toMatchObject({ name: 'NeedsLocationError' })
  })
  it('does not treat a tool error or malformed payload as empty results', () => {
    for (const raw of [null, { isError: true }, { success: true, data: { products: {} } }]) expect(() => parseInstamartSearch(raw)).toThrow()
  })
})
describe.skipIf(!endpoint)('Instamart production client over simulated HTTP', () => {
  it('exchanges and refreshes tokens with the documented JSON encoding', async () => {
    const meta = { issuer: endpoint!, authorization_endpoint: `${endpoint}/auth/authorize`, token_endpoint: `${endpoint}/instamart/auth/token` }
    const tokens = await exchangeCode(meta, { code: 'simulation-code', verifier: 'simulation-verifier', clientId: 'fixture', redirectUri: 'http://localhost/callback', resource: 'https://mcp.swiggy.com/im', encoding: 'json' })
    expect(tokens.access_token).toBe('simulation-only')
    expect((await refreshTokens(meta, tokens, 'fixture', 'https://mcp.swiggy.com/im', 'json')).refresh_token).toBe('simulation-refresh')
  })
  it('initializes MCP, searches with exact coordinates and preserves variant prices and stock', async () => {
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
