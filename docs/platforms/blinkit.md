# blinkit

**Verdict:** ? (A = direct HTTP, B = needs WebView, X = login or blocked)

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
