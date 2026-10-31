# sasta-mcp

Sasta's price comparison as an MCP server. Any MCP client (Claude Desktop, Claude Code, Codex, Cursor, n8n, your own scripts) can ask where a product or dish is cheapest, delivered to your saved location, and get the same answer the Android app gives.

It runs on your computer. Searches go through your own Google Chrome: an invisible window with its own profile, the same way the app uses hidden WebViews on the phone. It is read-only: it never orders, pays or changes addresses. Design notes: [`docs/MCP_SERVER.md`](../docs/MCP_SERVER.md).

## Install

You need Node 22 or newer and Google Chrome.

```bash
cd mcp
npm ci
npm run build          # writes dist/sasta-mcp.mjs
node dist/sasta-mcp.mjs location            # Rajajinagar 560010 by default
node dist/sasta-mcp.mjs location 560001     # or any pincode (placed on the map with OpenStreetMap)
node dist/sasta-mcp.mjs search amul butter  # quick live check, JSON out
```

## Connect a client

Use the absolute path to `dist/sasta-mcp.mjs` in each client.

**Claude Code.** Opening this repo already offers the server (`.mcp.json` at the root). To use it everywhere:

```bash
claude mcp add --scope user sasta -- node /path/to/sasta/mcp/dist/sasta-mcp.mjs
```

**Claude Desktop.** Settings → Developer → Edit Config (`claude_desktop_config.json`):

```json
{ "mcpServers": { "sasta": { "command": "node", "args": ["/path/to/sasta/mcp/dist/sasta-mcp.mjs"] } } }
```

**Codex.** In `~/.codex/config.toml`:

```toml
[mcp_servers.sasta]
command = "node"
args = ["/path/to/sasta/mcp/dist/sasta-mcp.mjs"]
```

**Anything over HTTP** (n8n, scripts, another machine on your network):

```bash
node dist/sasta-mcp.mjs http                  # http://127.0.0.1:8723/mcp
node dist/sasta-mcp.mjs token                 # the bearer token (kept in ~/.sasta/mcp, mode 0600)
node dist/sasta-mcp.mjs http --host 0.0.0.0   # reachable on your network; anyone with the token can search as you
```

Send `Authorization: Bearer <token>`. The server is stateless Streamable HTTP; `GET /health` needs no token.

Only one server can use the Chrome profile at a time. If several clients need Sasta at once, run `http` once and point them all at it, or give each a different `SASTA_MCP_HOME`.

## Tools

| Tool | What it does |
|---|---|
| `get_location`, `set_location` | The delivery point every search uses. Prices are per dark store, so exact coordinates matter |
| `search_products` | One product on Blinkit, Zepto, Instamart, BigBasket, Flipkart Minutes and Amazon Now. Grouped by brand, variant and pack, cheapest in stock first, with each app's state |
| `price_check` | Up to 5 products, one at a time. The best match per product, its price on every app, and the cheapest total |
| `search_food` | A dish or restaurant on Zomato and Swiggy. The same dish at the same restaurant is matched across apps. Equal prices say "Same price", never "cheaper" |
| `restaurant_menu` | One restaurant's dishes, each app's price side by side |
| `quote_food_order` | One order (dishes and quantities) totalled on each app, with the delivery fee when the app shows it |
| `list_platforms` | Which apps are live and signed in |
| `connect_app` | Opens the app's own sign-in in a visible Chrome window. Instamart and Zepto use their official MCP sign-in. Sasta never sees your OTP |
| `open_app` | Opens a site so you can choose its delivery area (BigBasket, Flipkart Minutes, and Zepto when it isn't connected) |
| `disconnect_app` | Signs this computer out of one app |

Every result says, for each app: `state` (`done`, `needs_login`, `needs_location`, `blocked`, `timeout`, `unavailable`, `app_only`), `strategy` (`mcp`, `api-in-page`), `count` and `ms`. The fields follow `docs/ACTIONS.md`.

## What each app needs

| App | Without setup | To get more |
|---|---|---|
| Blinkit | Works logged out | `connect_app blinkit` for member prices |
| Zepto | Storefront reader, after you pick the area once with `open_app zepto` | `connect_app zepto` (official MCP, read-only scopes) |
| Instamart | Needs sign-in | `connect_app instamart` (official Swiggy MCP). It searches your default saved Swiggy address |
| BigBasket | `open_app bigbasket`, then choose the area | |
| Flipkart Minutes | `open_app flipkart_minutes`, then choose an exact address | Not yet verified to return prices |
| Amazon Now | Only if your Amazon session offers a Now store | `connect_app amazon_now` |
| Zomato, Swiggy (food) | Work logged out at your coordinates | |
| Ownly, Swish | App only: there is no website to read. The result links to the app | |

## Develop

```bash
npm run typecheck && npm test && npm run build
node scripts/smoke.mjs          # a real stdio client: tools and location (offline)
node scripts/smoke.mjs --live   # plus live grocery, price check, food, menu and quote
SASTA_MCP_HEADED=1 node dist/sasta-mcp.mjs search maggi   # watch the browser
```

The server imports `mobile/src/core` (adapters, matching, grouping) directly. The aliases in `tsconfig.json`, `vitest.config.ts` and `scripts/build.mjs` swap only `@/native/platformSession` (→ `src/host/`, Chrome through Playwright), `@/native/kv` (a JSON file) and `react-native`. Fix a reader or parser in `mobile/` and both the app and the server pick it up. CI runs `.github/workflows/mcp.yml`.

Data: `~/.sasta/mcp/`, or `SASTA_MCP_HOME`. It holds `chrome-profile/` (site cookies), `prefs.json` (location and accounts), `secrets.json` (MCP tokens, 0600) and `http-token.json` (0600). Nothing is sent anywhere except the shopping sites themselves, and OpenStreetMap when you set a pincode without coordinates.
