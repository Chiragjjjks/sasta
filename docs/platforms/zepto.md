# zepto

**Verdict:** B (provider storefront in WebView). Implemented in `mobile/src/core/adapters/zepto.ts`; the production reader returned 30 real product cards on 2026-10-24 after selecting a public delivery area.

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

**Fixture:** `mobile/fixtures/zepto/lays.json` (public page fields; no account or personal address).

## Notes

## Logged in

| Item | Finding |
|---|---|
| Session cookie | `user_id`. Not `session_id`, which anonymous visits also get |
| Bot protection | Aggressive. Third-party tools drive a real Chrome rather than raw HTTP |

Source (third-party): [quick-commerce-mcp auth notes](https://github.com/Hardik500/quick-commerce-mcp/blob/main/AUTHENTICATION.md).

## Spike, 2026-10-24 (logged out, real Chrome)

| Item | Finding |
|---|---|
| Domain | Site moved to `www.zepto.com` (zeptonow.com redirects) |
| Search | `POST https://bff-gateway.zepto.com/user-search-service/api/v3/search`, body `{"query","pageNumber":0,"mode":"SHOW_ALL_RESULTS","userSessionId"}` |
| Why not call it directly | Every request carries a `request-signature` header, plus `x-xsrf-token`, `x-csrf-secret`, `storeId`, `store_ids`, `device_id`, `session_id`. Cookies include `aws-waf-token` (AWS WAF bot check) |
| What works | Inside zepto.com, hook `fetch`/`XMLHttpRequest`, then push `/search?query=…` and fire `popstate`. The page signs and sends its own search; capture the response body |
| Product fields | Each result `data` has `product.name`, `product.brand`, `productVariant.formattedPacksize` ("1 pack (200 g)"), `productVariant.weightInGms`, `mrp`, `sellingPrice`, `discountedSellingPrice`, `zeptoPassPrice`, `outOfStock`, `availableQuantity`, `storeId`. **Prices are in paise** (4600 = ₹46) |
| Member price | `zeptoPassPrice` is the Zepto Pass price, 0 when none. Use it once the account is connected |
| Location | Logged out, the site used a default point (12.96902, 77.75395) and its store. Writing `userPosition` into `localStorage['user-position']` was overwritten on reload. Next: drive "Select Location" in the hidden page, or grant the WebView geolocation so Zepto uses the phone's GPS |

## v0.5.0 implementation

The site itself issues its signed search requests at `/search?query=…`. Sasta reads `a[data-testid="product-card"][href*="/pvid/"]`, the `ProductName`, `PackSize` and `EdlpPrice` slots, stock markers, product IDs, image URLs and links. Displayed rupee prices are used directly; the API's paise fields above are not mixed with them.

Use Account → Delivery area to choose the same area in Zepto. The page's `user-position.state.userPosition` point must exist and, when Sasta has coordinates, be within 2 km. No location is overwritten through storage injection. Variable packs such as “48 g or 58 g” remain separate from exact packs. Login, location, blocked and unavailable states are returned explicitly. Account Test search runs a real query separately from the login check.
