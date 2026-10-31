import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { APP } from '@/core/platforms'
import type { Platform } from '@/core/types'
import type { Sasta } from './sasta'

export const VERSION = '0.1.0'

const GROCERY = ['blinkit', 'zepto', 'instamart', 'bigbasket', 'flipkart_minutes', 'amazon_now'] as const
const grocery = z.enum(GROCERY)

const INSTRUCTIONS = `Sasta compares what things cost, delivered now, at the user's saved location in India.
Grocery: Blinkit, Zepto, Swiggy Instamart, BigBasket, Flipkart Minutes, Amazon Now. Food: Zomato and Swiggy (Ownly and Swish are app-only).
- Check get_location first; prices depend on the exact delivery point. Change it with set_location.
- search_products for one product, price_check for a short shopping list (up to 5), search_food for a dish or restaurant, then restaurant_menu and quote_food_order.
- Each result lists every app's state. "needs_login": run connect_app (a visible Chrome window; the user signs in there). "needs_location": run open_app so the user picks the delivery area on that site once.
- Equal prices are reported as ties, never as one app being cheaper. Prices exclude fees, taxes and cart offers unless a field says otherwise.
- Sasta is read-only. It never places orders, pays, or changes addresses; give the user the app link to finish there.`

type Result = { [k: string]: unknown }

const money = (n?: number) => n === undefined ? '' : `₹${n}`

function reply(summary: string, data: Result) {
  return { content: [{ type: 'text' as const, text: `${summary}\n\n${JSON.stringify(data)}` }], structuredContent: data }
}

async function guarded(work: () => Promise<{ content: { type: 'text'; text: string }[]; structuredContent?: Result }>) {
  try { return await work() } catch (e) {
    return { content: [{ type: 'text' as const, text: String((e as Error)?.message || e) }], isError: true }
  }
}

const platformLine = (ps: { name: string; state: string; count: number; error?: string }[]) =>
  ps.map((p) => `${p.name}: ${p.state === 'done' ? `${p.count} found` : p.state.replace('_', ' ')}`).join(' · ')

const readOnly = { readOnlyHint: true, destructiveHint: false, openWorldHint: true }

export function createServer(sasta: Sasta) {
  const server = new McpServer({ name: 'sasta', title: 'Sasta price comparison', version: VERSION }, { instructions: INSTRUCTIONS })

  server.registerTool('get_location', {
    title: 'Get delivery location',
    description: 'The delivery location every search uses: pincode, label and exact coordinates.',
    inputSchema: {}, annotations: { ...readOnly, openWorldHint: false },
  }, () => guarded(async () => {
    const loc = await sasta.location()
    return reply(`Delivering to ${loc.label} ${loc.pincode}${loc.lat !== undefined ? ` (${loc.lat}, ${loc.lng})` : ''}.`, { location: loc })
  }))

  server.registerTool('set_location', {
    title: 'Set delivery location',
    description: 'Change the delivery location. Give a 6-digit Indian pincode, and lat/lng when known (stores price per dark store, so exact coordinates give exact prices). Without lat/lng the pincode is placed on the map with OpenStreetMap.',
    inputSchema: {
      pincode: z.string().describe('6-digit pincode, e.g. "560010"'),
      lat: z.number().min(-90).max(90).optional(), lng: z.number().min(-180).max(180).optional(),
      label: z.string().max(60).optional().describe('Area name to show, e.g. "Rajajinagar"'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, (args) => guarded(async () => {
    const loc = await sasta.setLocation(args)
    return reply(`Delivery location set to ${loc.label} ${loc.pincode} (${loc.lat}, ${loc.lng}).`, { location: loc })
  }))

  server.registerTool('list_platforms', {
    title: 'Apps and sign-in status',
    description: 'Every app Sasta compares, whether it is searched live, and whether this computer is signed in to it.',
    inputSchema: {}, annotations: readOnly,
  }, () => guarded(async () => {
    const r = await sasta.platforms()
    return reply(r.platforms.map((p) => `${p.name}: ${p.live ? 'live' : 'app only'}${p.signedIn ? ', signed in' : p.needsSignInToSearch ? ', needs sign-in' : ''}`).join(' · '), r)
  }))

  server.registerTool('search_products', {
    title: 'Search one grocery product',
    description: 'Search one product (e.g. "lays magic masala", "amul butter 500 g") on every quick-commerce app at the saved location, in parallel. Results are grouped by brand, variant and pack size; each group lists every app\'s price, MRP, stock and ETA, cheapest in-stock first.',
    inputSchema: {
      query: z.string().min(1).max(120),
      platforms: z.array(grocery).optional().describe('Only these apps (default: all)'),
      limit: z.number().int().min(1).max(30).optional().describe('Product groups to return (default 8)'),
      fresh: z.boolean().optional().describe('Skip the 10-minute cache'),
    },
    annotations: readOnly,
  }, (args, extra) => guarded(async () => {
    const r = await sasta.searchProducts(args.query, { platforms: args.platforms as Platform[] | undefined, limit: args.limit, fresh: args.fresh, signal: extra.signal })
    const head = r.cheapest ? `Cheapest in stock: ${r.cheapest.product}${r.cheapest.pack ? ` ${r.cheapest.pack}` : ''} at ${money(r.cheapest.price)} on ${r.cheapest.app}.` : `No in-stock match for "${r.query}".`
    return reply(`${head} ${r.totalMatches} products at ${r.location.label}. ${platformLine(r.platforms)}`, r)
  }))

  server.registerTool('price_check', {
    title: 'Price a shopping list',
    description: 'Check up to 5 products (e.g. ["maggi", "amul butter 100 g", "lays"]). For each: the best match, its price on every app, and the cheapest app; then the total if each item is bought where it is cheapest. Products are checked one at a time with a short pause, like normal use.',
    inputSchema: {
      products: z.array(z.string().min(1).max(120)).min(1).max(5),
      platforms: z.array(grocery).optional(),
      fresh: z.boolean().optional(),
    },
    annotations: readOnly,
  }, (args, extra) => guarded(async () => {
    const r = await sasta.priceCheck(args.products, { platforms: args.platforms as Platform[] | undefined, fresh: args.fresh, signal: extra.signal })
    const lines = r.items.map((it) => it.match ? `${it.query}: ${it.match.product}${it.match.pack ? ` ${it.match.pack}` : ''} ${money(it.match.cheapest.price)} on ${it.match.cheapest.app}` : `${it.query}: not found`)
    return reply(`${lines.join('\n')}\nCheapest total ${money(r.plan.cheapestTotal)} (${r.plan.byApp.map((b) => `${b.app} ${b.items}`).join(', ')}).`, r)
  }))

  server.registerTool('search_food', {
    title: 'Compare a dish or restaurant',
    description: 'Search a dish ("chicken biryani") or a restaurant ("meghana foods") on Zomato and Swiggy at the saved location. The same dish at the same restaurant is matched across apps (spellings, branches and portions differ); each result says where it is cheaper or that the price is the same.',
    inputSchema: {
      query: z.string().min(1).max(120),
      sort: z.enum(['cheapest', 'biggest_gap']).optional().describe('cheapest (default) or biggest price gap between apps'),
      veg: z.boolean().optional().describe('true: veg only, false: non-veg only'),
      limit: z.number().int().min(1).max(40).optional().describe('Dishes to return (default 10)'),
      fresh: z.boolean().optional(),
    },
    annotations: readOnly,
  }, (args, extra) => guarded(async () => {
    const r = await sasta.searchFood(args.query, { sort: args.sort, veg: args.veg, limit: args.limit, fresh: args.fresh, signal: extra.signal })
    const top = r.dishes.slice(0, 3).map((d) => `${d.dish} (${d.restaurant}) ${money(d.best.price)} on ${d.best.app}: ${d.verdict}`)
    return reply(`${r.totalDishes} dishes at ${r.location.label}.\n${top.join('\n')}\n${platformLine(r.platforms)}`, r)
  }))

  server.registerTool('restaurant_menu', {
    title: 'Restaurant menu on every app',
    description: 'One restaurant\'s dishes with each app\'s price side by side. Pass the restaurant name or the restaurantKey from search_food.',
    inputSchema: { restaurant: z.string().min(1).max(120) },
    annotations: readOnly,
  }, (args, extra) => guarded(async () => {
    const r = await sasta.restaurantMenu(args.restaurant, { signal: extra.signal })
    return reply(`${r.restaurant.name}: ${r.restaurant.verdict}. ${(r.restaurant.dishes ?? []).length} dishes.${r.menuErrors ? ` ${r.menuErrors}.` : ''}`, r)
  }))

  server.registerTool('quote_food_order', {
    title: 'Price a food order on every app',
    description: 'Total for one order from one restaurant on each app: menu prices times quantity plus the delivery fee the app shows. Run search_food or restaurant_menu first. Sasta never places the order; the result has the app link.',
    inputSchema: {
      restaurant: z.string().min(1).max(120),
      items: z.array(z.object({ dish: z.string().min(1).describe('Dish name or key from search_food'), qty: z.number().int().min(1).max(20).optional() })).min(1).max(20),
    },
    annotations: readOnly,
  }, (args, extra) => guarded(async () => {
    const r = await sasta.quoteFoodOrder(args.restaurant, args.items, { signal: extra.signal })
    const lines = r.quotes.map((q) => `${q.app}: ${money(q.total)}${q.totalIsMinimum ? '+ (fee not shown)' : ''}${q.missing.length ? `, missing ${q.missing.join(', ')}` : ''}`)
    return reply(`${r.restaurant}\n${lines.join('\n')}${r.notFound.length ? `\nNot on the menu: ${r.notFound.join(', ')}` : ''}`, r)
  }))

  server.registerTool('connect_app', {
    title: 'Sign in to an app',
    description: 'Opens the app\'s own sign-in page in a visible Chrome window on this computer; the user signs in there (Sasta never sees the OTP). Instamart and Zepto use their official MCP sign-in. Gives member prices and the right store; Instamart needs it to search at all.',
    inputSchema: { platform: grocery },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, (args) => guarded(async () => {
    const acc = await sasta.connect(args.platform as Platform)
    return reply(`${APP[args.platform].name}: ${acc.status === 'connected' ? 'signed in' : 'not signed in (window closed or timed out)'}.`, { account: acc })
  }))

  server.registerTool('open_app', {
    title: 'Open an app to set its delivery area',
    description: 'Opens the app\'s website in a visible Chrome window on this computer so the user can choose the delivery area it prices by (BigBasket, Flipkart Minutes, and Zepto when not connected over MCP report "needs_location" until then). Returns when the user closes the tab.',
    inputSchema: { platform: grocery },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, (args) => guarded(async () => {
    const r = await sasta.openApp(args.platform as Platform)
    return reply(`${APP[args.platform].name} was opened; search again to use the area chosen there.`, r)
  }))

  server.registerTool('disconnect_app', {
    title: 'Sign out of an app',
    description: 'Removes this computer\'s saved session for one app (cookies, site storage or MCP token).',
    inputSchema: { platform: grocery },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  }, (args) => guarded(async () => {
    const acc = await sasta.disconnect(args.platform as Platform)
    return reply(`${APP[args.platform].name}: signed out.`, { account: acc })
  }))

  return server
}
