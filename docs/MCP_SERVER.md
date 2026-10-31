# Sasta MCP server

Sasta's actions (`docs/ACTIONS.md`) exposed as an MCP server, so Claude, Codex, or any other MCP client can ask "where is this cheapest, delivered to me?" and get the same answer the app gives.

The owner asked for this on 2026-11-01 ("do MCP for Sasta so we can connect it to other things"). Merged to `main` on 2026-11-01 in PR #3 (`f3653af`). Pushes and PRs go through the `prospeck` GitHub account.

## Design

- **Where it runs: on a desktop (the owner's Mac).** The phone app has no backend and Android can't host a reachable MCP server, so the server is a Node program in `mcp/`.
- **One copy of the logic.** The server imports `mobile/src/core` directly: adapters, `normalize`, `relevantOffers`, `runSources`, `groupOffers`, food `match.ts`. It does not fork them. The esbuild bundle and vitest aliases replace only the native parts:
  - `@/native/platformSession` → `mcp/src/host/platformSession.ts`. Playwright drives the real Chrome with a persistent profile at `~/.sasta/mcp/chrome-profile`. Each origin gets one page, standing in for the phone's hidden WebView. `pageRun` runs the same reader scripts (`readers.generated.json`), wrapped the same way `SessionHosts.tsx` wraps them.
  - `@/native/kv` → a JSON file at `~/.sasta/mcp/prefs.json`.
  - Secure storage (MCP tokens) → `~/.sasta/mcp/secrets.json`, file mode 0600, never in the repo.
  - `react-native` → a tiny shim (`Platform.OS = 'android'`).
- **Sign-in.** `session_connect` opens a visible Chrome window on the platform's own sign-in page, and the user types the OTP there. Sasta never sees it.
  - **Instamart and Zepto** use their official MCP servers with OAuth and PKCE. Their redirects (`http://localhost/sasta/oauth/swiggy`, `http://localhost/callback`) are caught by Playwright request routing, exactly as the WebView intercepts them on the phone. No local port is needed.
  - **Web platforms** keep their cookies in the Chrome profile.
- **Transports.**
  - `stdio` (the default) for Claude Desktop, Claude Code and Codex.
  - `--http`: Streamable HTTP on `127.0.0.1`, with a bearer token, for other tools.
- **Rules carried over from the app.**
  - Read-only actions only: no orders, payments, checkout or address edits.
  - One page per origin, serialised (`withSessionTurn`).
  - Location is mandatory; the default is Rajajinagar 560010.
  - Results carry the action metadata from `docs/ACTIONS.md`: `state`, `strategy`, `fetchedAt`, `ms`, `error`.

## Tools

| Tool | Action | Notes |
|---|---|---|
| `get_location` / `set_location` | `location.sync` | Takes a pincode (looked up through OpenStreetMap if no coordinates are given), or lat/lng plus a label |
| `search_products` | `catalog.search` | One product on every grocery app. Results are grouped by brand, variant and pack, cheapest in stock first, with a status per app |
| `price_check` | `price.check` | Up to 5 products (the same limit as the app). For each product: the best offer on each app and the cheapest overall |
| `search_food` | `food.search` | A dish or restaurant on Zomato and Swiggy, with the same dish matched at the same restaurant across apps |
| `restaurant_menu` | `food.menu` | One restaurant from `search_food`: menu dishes with each app's price |
| `list_platforms` / `session_status` | `session.status` | Which apps are live, signed in, or app-only |
| `session_connect` / `session_disconnect` | `session.*` | Opens a visible Chrome sign-in window |

## Status

- [x] Package skeleton, host shims, bundle (`3ce5ae0`)
- [x] Grocery tools: live Blinkit search and price_check at Rajajinagar
- [x] Food tools: live Zomato and Swiggy, plus menu and order quote
- [x] Sessions: `connect_app` (MCP OAuth redirect caught by Playwright routing; web sign-in by cookies or page check), `open_app`, `disconnect_app`. **Not yet tried live**: it needs the owner at the Chrome window to type OTPs
- [x] HTTP transport (bearer token; live `search_food` over HTTP)
- [x] Tests (15, including real Chrome against a local page) and the CI workflow `.github/workflows/mcp.yml`
- [x] Live check through a real stdio client (`scripts/smoke.mjs --live`)
- [x] Docs, PR #3, CI green (Android APK and MCP server workflows), merged as `f3653af`

Next: run `connect_app instamart` and `connect_app zepto` with the owner at the Chrome window, and `open_app` for BigBasket, Flipkart Minutes and Zepto. Then re-run `scripts/smoke.mjs --live` in the daytime, when Meghana and the other restaurants are open.

## Findings

- Generated readers began with `"use strict";`, a syntax error inside `(<reader>)(args)`. Fixed in PR #2 for the app as well.
- Swiggy restaurant-name searches had no dishes. The fix is the Dishes tab (PR #2).
- At night Zomato marks closed restaurants not serviceable and Sasta skips them. "meghana" at 2 am finds both outlets but returns no dishes. That is correct behaviour, not a bug.
- BigBasket, Flipkart Minutes and Zepto's storefront price only after their own area picker has been used in the profile. `open_app` exists for that.
