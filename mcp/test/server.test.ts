import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { describe, expect, it } from 'vitest'
import { mockAdapters } from '@/core/adapters/mock'
import { mockFoodSources } from '@/core/food/adapters/mock'
import { serveHttp } from '../src/http'
import { Sasta } from '../src/sasta'
import { createServer } from '../src/tools'

const sasta = () => new Sasta({ grocery: mockAdapters, food: mockFoodSources.filter((s) => s.platform === 'zomato' || s.platform === 'swiggy_food'), pauseMs: 0 })

async function connected() {
  const [a, b] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'test', version: '1' })
  await Promise.all([createServer(sasta()).connect(a), client.connect(b)])
  return client
}

describe('MCP protocol', () => {
  it('lists every action as a tool, with read-only hints on searches', async () => {
    const client = await connected()
    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name).sort()).toEqual(['connect_app', 'disconnect_app', 'get_location', 'list_platforms', 'open_app', 'price_check', 'quote_food_order', 'restaurant_menu', 'search_food', 'search_products', 'set_location'])
    for (const name of ['search_products', 'price_check', 'search_food', 'restaurant_menu', 'quote_food_order']) expect(tools.find((t) => t.name === name)?.annotations?.readOnlyHint).toBe(true)
    expect(tools.find((t) => t.name === 'disconnect_app')?.annotations?.destructiveHint).toBe(true)
    expect(client.getInstructions()).toContain('never places orders')
  })
  it('returns a readable summary and structured results', async () => {
    const client = await connected()
    const r = await client.callTool({ name: 'search_products', arguments: { query: 'lays', limit: 2 } })
    expect(r.isError).toBeFalsy()
    const text = (r.content as { text: string }[])[0].text
    expect(text).toMatch(/^Cheapest in stock: .+ at ₹\d+ on \w+/)
    expect((r.structuredContent as { results: unknown[] }).results).toHaveLength(2)
  })
  it('turns bad input into a tool error, not a crash', async () => {
    const client = await connected()
    const r = await client.callTool({ name: 'price_check', arguments: { products: ['a', 'b', 'c', 'd', 'e', 'f'] } })
    expect(r.isError).toBe(true)
    const loc = await client.callTool({ name: 'set_location', arguments: { pincode: '12' } })
    expect(loc.isError).toBe(true)
    expect((loc.content as { text: string }[])[0].text).toContain('6 digits')
  })
})

describe('HTTP transport', () => {
  it('requires the bearer token and then serves the same tools', async () => {
    const http = await serveHttp(sasta(), { port: 0, host: '127.0.0.1', token: 'test-token' })
    try {
      const denied = await fetch(http.url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: '{}' })
      expect(denied.status).toBe(401)
      expect((await fetch(http.url.replace('/mcp', '/health'))).status).toBe(200)
      const client = new Client({ name: 'http-test', version: '1' })
      await client.connect(new StreamableHTTPClientTransport(new URL(http.url), { requestInit: { headers: { Authorization: 'Bearer test-token' } } }))
      const r = await client.callTool({ name: 'get_location', arguments: {} })
      expect((r.content as { text: string }[])[0].text).toContain('Delivering to')
      await client.close()
    } finally { await http.close() }
  })
})
