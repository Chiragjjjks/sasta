# Actions, scripts and the site index

Sasta does everything through **actions**. Something the user does (types a search, opens the cart, taps Connect) triggers an action. The action runs one **script** per platform in parallel. Each script returns a typed result plus **metadata** saying where it came from. The UI and the desktop runner only read action results. They never call a platform directly.

```
trigger ──► action ──► preconditions ──► one script per platform (parallel, timeout, queue per origin)
 (user)     (id)       session? area?     MCP tool │ API call inside the page │ DOM reader
                                                     │
                       result + metadata ◄── normalize ◄── raw platform response
```

The **site index** (`automation/index/<platform>.json`) records each platform's pages, elements, network endpoints, sign-in signals and location mechanics. It is built by driving the real, signed-in websites. Scripts are written from the index. When a platform changes, re-run the indexer and diff.

## Where scripts run

| Runtime | Used for | Script form |
|---|---|---|
| Android app (`mobile/`) | Everything the user sees | MCP client (`core/mcp.ts`), or a reader function run inside a hidden WebView on the platform's own site (`core/adapters/*`, shipped as `readers.generated.json`) |
| Desktop (`automation/`) | Indexing, live verification of the app's readers, scripted checks | Playwright driving real Chrome with a persistent signed-in profile. It runs the **same** reader functions as the app where possible |

## Lifecycles

Each action has an id, a trigger, preconditions, per-platform strategies, and a result. `strategy` is one of `mcp`, `api-in-page`, `dom`, `none`.

| Action | Trigger | Preconditions | Result |
|---|---|---|---|
| `session.status` | App start, Account screen, before any signed-in action | none | `{ signedIn, label?, via, checkedAt }` |
| `session.connect` | Tap **Connect**. Prompts the user to sign in on the platform's own page (OTP never seen by Sasta) | none | `Account` |
| `session.disconnect` | Tap **Disconnect** | none | cookies, storage and tokens for that platform removed |
| `location.sync` | Location changed, or **Delivery area** tapped | exact location in Sasta | `{ matches, selected: { lat, lng, pincode?, label? } }` per platform |
| `catalog.search` | Search box, pull to refresh | location | `Offer[]` (title, pack, price, MRP, stock, ETA, image, id, URL) |
| `price.check` | "price of amul milk 500 ml", list item, cart refresh | location | per platform: best matching offer, its alternatives, and the cheapest overall |
| `product.detail` | Tap a product | location | variants, images, description, seller, stock |
| `cart.quote` | Cart screen | session (for real fees), location | `{ itemTotal, deliveryFee, handlingFee, smallCartFee, freeDeliveryAbove?, payable }` per platform |
| `cart.handoff` | **Open in <app> with these items** (explicit tap only) | session, location | platform cart filled, platform opened for the user to pay |
| `orders.history` | Account → History, "reorder my usual" | session | past orders, read only |
| `offers.list` | Cart screen | session | coupons and member prices |

**Never automated:** placing an order, paying, confirming checkout, deleting or creating addresses, changing account details. `cart.handoff` stops at the platform's own cart screen.

### Example: `price.check`

Input: `{ query: "amul taaza 500 ml", location: { lat: 12.9915, lng: 77.5544, pincode: "560010" } }`

1. Resolve to `catalog.search` per platform with the same query.
2. Keep offers whose brand, variant and pack match the query (`core/normalize.ts`, `relevantOffers`).
3. Per platform pick the cheapest in-stock match. Order platforms by price, then ETA.
4. Return:

```json
{
  "action": "price.check",
  "query": "amul taaza 500 ml",
  "cheapest": { "platform": "zepto", "price": 27, "productId": "…" },
  "platforms": [
    { "platform": "zepto", "state": "done", "strategy": "mcp", "best": { "title": "Amul Taaza Toned Milk 500 ml", "price": 27, "mrp": 28, "inStock": true, "etaMinutes": 9, "url": "https://www.zepto.com/pn/…" }, "alternatives": 2 },
    { "platform": "blinkit", "state": "done", "strategy": "api-in-page", "best": { "price": 28 } },
    { "platform": "amazon_now", "state": "unavailable", "error": "Amazon Now is not exposed in this web session" }
  ],
  "meta": { "location": "560010", "fetchedAt": 1793173279000, "signedIn": { "zepto": true, "blinkit": false } }
}
```

## Result metadata

Every per-platform result carries:

| Field | Meaning |
|---|---|
| `platform` | Platform id |
| `state` | `done`, `needs_login`, `needs_location`, `blocked`, `timeout`, `unavailable`, `failed` |
| `strategy` | Which script ran: `mcp`, `api-in-page`, `dom` |
| `signedIn` | Whether the platform session was signed in when the script ran |
| `location` | The platform's own selected delivery point, when it exposes one |
| `fetchedAt`, `ms` | When and how long |
| `error` | Human sentence when `state` is not `done` |
| `source` | Endpoint id or page id from the index that produced the data |

## Site index format

One file per platform: `automation/index/<platform>.json`. Platform ids: `blinkit`, `zepto`, `instamart`, `bigbasket`, `flipkart_minutes`, `amazon_now`.

```ts
interface SiteIndex {
  platform: string
  origins: string[]                 // every origin the site uses (web + API hosts)
  indexedAt: string                 // ISO date
  indexedWith: { signedIn: boolean; viewport: 'mobile' | 'desktop'; location: { pincode: string; lat?: number; lng?: number } }
  mcp?: { url: string; authServer: string; tools: { name: string; description?: string; inputSchema?: unknown }[] }
  auth: {
    loginUrl: string
    steps: string[]                 // what the user does, in order
    signals: { cookies: string[]; localStorage: string[]; check?: string }   // check: JS expression true when signed in
  }
  location: {
    how: 'ui' | 'storage' | 'cookie' | 'api' | 'account-address'
    steps: string[]
    storageKeys: string[]; cookies: string[]; endpoints: string[]           // endpoint ids
    read?: string                   // JS expression returning { lat, lng, pincode?, label? } of the selected area
  }
  pages: {
    id: string; urlPattern: string; example: string; purpose: string
    requiresLogin: boolean; requiresLocation: boolean
    elements: { name: string; selector: string; notes?: string }[]
    endpoints: string[]
  }[]
  endpoints: {
    id: string; method: string; url: string; query?: Record<string, string>; body?: unknown
    headerNames: string[]           // names only, never values
    auth: 'none' | 'cookie' | 'bearer' | 'signed'
    callableFromPage: boolean       // can a script inside the site's page call it with fetch()
    fields?: Record<string, string> // e.g. { title: "data.products[].name", price: "…sellingPrice (paise)" }
    fixture?: string                // automation/fixtures/<platform>/<file>.json, trimmed and redacted
  }[]
  actions: Record<string, { strategy: 'mcp' | 'api-in-page' | 'dom' | 'none'; page?: string; endpoint?: string; tool?: string; steps?: string[]; notes?: string }>
  botProtection: string
  notes: string[]
}
```

Rules for the index and fixtures: no cookie or token values, no phone numbers, names, addresses, order ids or payment data. Header **names** only. Trim fixtures to a few products.
