import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { McpAuthError, type McpClient } from '../mcp'
import { createZeptoAdapter, parseZeptoMcpSearch, parseZeptoServiceability } from './zepto'

// Trimmed from the official Zepto MCP server on 2026-10-28 (read-only scopes, Rajajinagar).
const live = JSON.parse(readFileSync(new URL('../../../fixtures/zepto/mcp-search.json', import.meta.url), 'utf8')).result
const serviceable = { content: [{ type: 'text', text: readFileSync(new URL('../../../fixtures/zepto/mcp-serviceability.txt', import.meta.url), 'utf8') }] }
const here = { label: 'Rajajinagar', pincode: '560010', lat: 12.9915, lng: 77.5544 }

function fakeClient(answers: Partial<Record<string, () => unknown>> = {}) {
  const calls: string[] = []
  const client = {
    sessionId: 's1',
    async callTool(name: string) { calls.push(name); const a = answers[name] ?? (name === 'search_products' ? () => live : () => serviceable); return a() },
  }
  return { calls, client: client as unknown as McpClient & { sessionId: string } }
}

describe('Zepto official MCP', () => {
  it('converts paise to rupees and keeps pack, stock, image and a product link', () => {
    const offers = parseZeptoMcpSearch(live, 10)
    const gold = offers.find(o => o.title.startsWith('Amul Gold'))
    expect(gold).toMatchObject({ platform: 'zepto', price: 34, packLabel: '1 pack (500 ml)', inStock: true, etaMinutes: 10 })
    expect(gold!.deepLink).toMatch(/^https:\/\/www\.zepto\.com\/pn\/amul-gold-[a-z0-9-]+\/pvid\/[0-9a-f-]{36}$/)
    expect(offers.find(o => o.title.startsWith('Milky Mist'))).toMatchObject({ price: 88, mrp: 95 })
  })
  it('reads serviceability and its ETA, and refuses an unserved area', () => {
    expect(parseZeptoServiceability(serviceable)).toEqual({ serviceable: true, etaMinutes: 10 })
    expect(parseZeptoServiceability({ content: [{ type: 'text', text: 'Sorry, Zepto does not deliver to this location yet.' }] }).serviceable).toBe(false)
  })
  it('never treats an error or changed payload as an empty search', () => {
    expect(() => parseZeptoMcpSearch({ isError: true, content: [{ type: 'text', text: 'Unauthorized' }] })).toThrow()
    expect(() => parseZeptoMcpSearch({ structuredContent: { items: [] } })).toThrow()
  })
})

describe('Zepto adapter', () => {
  const signal = () => new AbortController().signal
  it('links the location once per MCP session, then only searches', async () => {
    const { calls, client } = fakeClient()
    const a = createZeptoAdapter({ connected: async () => true, client: () => client })
    await a.setLocation(here)
    expect((await a.search('amul milk', signal())).length).toBe(3)
    await a.search('lays', signal())
    expect(calls).toEqual(['get_location_serviceability', 'search_products', 'search_products'])
  })
  it('links again when the location or the server session changes', async () => {
    const { calls, client } = fakeClient()
    const a = createZeptoAdapter({ connected: async () => true, client: () => client })
    await a.setLocation(here); await a.search('milk', signal())
    await a.setLocation({ ...here, lat: 12.97 }); await a.search('milk', signal())
    client.sessionId = 's2'; await a.search('milk', signal())
    expect(calls.filter(c => c === 'get_location_serviceability')).toHaveLength(3)
  })
  it('needs an exact location, and reports an expired sign-in as needs_login', async () => {
    const { client } = fakeClient({ search_products: () => { throw new McpAuthError() } })
    const a = createZeptoAdapter({ connected: async () => true, client: () => client })
    await a.setLocation({ label: 'Pin only', pincode: '560010' })
    await expect(a.search('milk', signal())).rejects.toMatchObject({ name: 'NeedsLocationError' })
    await a.setLocation(here)
    await expect(a.search('milk', signal())).rejects.toMatchObject({ name: 'NeedsLoginError' })
  })
  it('reports an unserved area as unavailable', async () => {
    const { client } = fakeClient({ get_location_serviceability: () => ({ content: [{ type: 'text', text: 'Zepto does not deliver to this location.' }] }) })
    const a = createZeptoAdapter({ connected: async () => true, client: () => client })
    await a.setLocation(here)
    await expect(a.search('milk', signal())).rejects.toMatchObject({ name: 'ProviderUnavailableError' })
  })
  it('uses the Zepto storefront when the official connection is not set up', async () => {
    const { calls, client } = fakeClient()
    const a = createZeptoAdapter({ connected: async () => false, client: () => client })
    await a.setLocation(here)
    // The test stub has no WebView, so the storefront path fails; the MCP client must not be touched.
    await expect(a.search('milk', signal())).rejects.toThrow()
    expect(calls).toEqual([])
  })
})
