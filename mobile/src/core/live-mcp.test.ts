import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createInstamartAdapter, type SelectedAddress } from './adapters/instamart'
import { createZeptoAdapter } from './adapters/zepto'
import { probeSearch } from './connection-test'
import { McpClient } from './mcp'
import { MCP_PROVIDERS } from './mcp-connect'

/**
 * Opt-in: the production adapters against the real official servers.
 * SASTA_LIVE_TOKENS=<dir with swiggy.tokens.json / zepto.tokens.json> npm test -- live-mcp
 * Token files hold `{ "access_token": "…" }` from a real sign-in. Never commit them.
 */
const dir = process.env.SASTA_LIVE_TOKENS
const token = (name: string) => JSON.parse(readFileSync(`${dir}/${name}.tokens.json`, 'utf8')).access_token as string
const here = { label: 'Rajajinagar', pincode: '560010', lat: 12.9915, lng: 77.5544 }

describe.skipIf(!dir)('live official MCP servers', () => {
  it('Instamart returns matching priced products at a saved Swiggy address', async () => {
    let saved: SelectedAddress | null = null
    const adapter = createInstamartAdapter(s => new McpClient(MCP_PROVIDERS.instamart.url, async () => token('swiggy'), s),
      { load: async () => saved, save: async a => { saved = a } })
    const probe = await probeSearch('instamart', adapter, 'amul milk', here)
    expect(probe.status).toMatchObject({ state: 'done' })
    expect(probe.offers.length).toBeGreaterThan(0)
    expect(probe.offers.every(o => o.price > 0 && o.platform === 'instamart')).toBe(true)
    expect(saved).not.toBeNull()
  }, 30000)
  it("Zepto returns matching priced products at Sasta's location", async () => {
    const client = new McpClient(MCP_PROVIDERS.zepto.url, async () => token('zepto'))
    const probe = await probeSearch('zepto', createZeptoAdapter({ connected: async () => true, client: () => client }), 'amul milk', here)
    expect(probe.status).toMatchObject({ state: 'done' })
    expect(probe.offers.length).toBeGreaterThan(0)
    expect(probe.offers.every(o => o.price > 1 && o.price < 2000 && o.deepLink.startsWith('https://www.zepto.com/pn/'))).toBe(true)
  }, 30000)
})
