# blinkit

**Verdict:** B (needs WebView). Search verified live on 2026-10-24 from real Chrome at Rajajinagar (12.9915, 77.5544): 19 products, logged out. Implemented in `src/adapters/blinkit.ts`.

| Item | Finding |
|---|---|
| Search endpoint | |
| Method and params | |
| How location is set | |
| Required headers and tokens | |
| Login needed to search | |
| Rate limiting or bot protection | |
| Title / price / MRP / stock / ETA / image / id paths | |
| Product deep link format | |

**Fixture:** `fixtures/blinkit/lays.json`

## Notes

## Logged in

| Item | Finding |
|---|---|
| Session cookie | `gr_1_accessToken` (URL-encoded access token). Also in `localStorage.auth.accessToken` |
| Auth headers on API calls | `access_token`, `auth_key` (from `GET /v2/accounts/auth_key/`), `device_id`, `session_uuid`, `lat`, `lon`, `app_client: consumer_web`, `platform: desktop_web` |
| Bot protection | Cloudflare blocks plain HTTP clients by TLS fingerprint (403 even with browser headers). Real Chrome passes. On Android, run requests inside a WebView on blinkit.com |
| Search | `POST /v1/layout/search?q={q}&search_type=type_to_search` with `lat`/`lon` headers. Works logged out |
| Cart pricing | `POST /v5/carts` is stateless: it prices a list of items (fees included) without storing a cart |
| Orders | `GET /v1/order_count`, `POST /v1/layout/order_history` (logged in) |

Sources (third-party, unverified by us): [blinkcli endpoint notes](https://github.com/maheshrijal/blinkcli/blob/main/docs/endpoint-notes.md), [blinkit-mcp research](https://github.com/yniks/blinkit-mcp/blob/main/RESEARCH.md), [quick-commerce-mcp auth notes](https://github.com/Hardik500/quick-commerce-mcp/blob/main/AUTHENTICATION.md).

## Cart hand-off and fees, verified 2026-10-24

| Item | Finding |
|---|---|
| Fees | `POST /v5/carts` returned items ₹78, delivery ₹25 (free at ₹99), handling ₹2, payable ₹105 for two 80 g packs. Fixture: `fixtures/blinkit/cart-bill.json` |
| Web cart | blinkit.com keeps its cart in `localStorage.cart` (`items[product_id] = { product, quantity }`, plus `count`, `total`, `uniqueSkuInCart`). Writing it and reloading showed "3 items ₹117 View Cart" |
| Web location | `localStorage.location.coords` = `{ lat, lon, locality, isDefault }`. Logged out it defaulted to Gurugram |
| In the app | "Open in Blinkit with these items" writes both keys in the shared WebView storage, then opens blinkit.com in the in-app browser for checkout. `upi:` and `intent:` links open the matching app |
