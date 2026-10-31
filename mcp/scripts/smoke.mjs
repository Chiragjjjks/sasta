// End-to-end check through a real MCP client over stdio: node scripts/smoke.mjs [--live]
// Without --live it only lists tools and reads the location (no shopping sites are contacted).
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const live = process.argv.includes('--live')
const client = new Client({ name: 'sasta-smoke', version: '1' })
await client.connect(new StdioClientTransport({ command: process.execPath, args: [new URL('../dist/sasta-mcp.mjs', import.meta.url).pathname], env: { ...process.env }, stderr: 'inherit' }))
const call = async (name, args = {}) => {
  const t = Date.now()
  const r = await client.callTool({ name, arguments: args })
  const text = r.content?.[0]?.text ?? ''
  console.log(`\n# ${name} ${JSON.stringify(args)} (${Date.now() - t} ms)${r.isError ? ' ERROR' : ''}\n${text.split('\n\n')[0]}`)
  if (r.isError) process.exitCode = 1
  return r.structuredContent
}
const { tools } = await client.listTools()
console.log('tools:', tools.map((t) => t.name).join(', '))
await call('get_location')
if (live) {
  await call('search_products', { query: 'amul butter', limit: 3 })
  await call('price_check', { products: ['maggi', 'lays magic masala'] })
  const food = await call('search_food', { query: 'meghana', limit: 3 })
  const r = food?.restaurants?.[0]
  if (r) {
    const menu = await call('restaurant_menu', { restaurant: r.key })
    const dishes = (menu?.restaurant?.dishes ?? []).filter((d) => d.perApp.length > 1).slice(0, 2)
    if (dishes.length) await call('quote_food_order', { restaurant: r.key, items: dishes.map((d) => ({ dish: d.key, qty: 1 })) })
  }
}
await client.close()
