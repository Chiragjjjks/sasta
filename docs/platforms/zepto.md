# zepto

**Verdict:** official MCP first, storefront WebView as fallback. Implemented in `mobile/src/core/adapters/zepto.ts`.

## Official MCP (verified 2026-10-28)

Zepto publishes an MCP server ([github.com/zeptonow/mcp](https://github.com/zeptonow/mcp)). A real sign-in, `tools/list`, `get_location_serviceability` and `search_products` all worked, and the production adapter passed `npm test -- live-mcp` (10 products for "amul milk" in about 0.7 s).

| Item | Finding |
|---|---|
| Server | `https://mcp.zepto.co.in/mcp`. Protected resource `https://mcp.zepto.co.in` |
| Auth | `https://auth.zepto.co.in`: dynamic registration (real client ids), PKCE S256, form-encoded token body. Access token 7 days. Redirect allow-list includes `http://localhost/callback` |
| Scopes Sasta asks for | Read only: `tools:read dev.ucp.shopping.catalog.search:read dev.ucp.shopping.catalog.lookup:read dev.ucp.common.location.search:read dev.ucp.common.location.lookup:read`. No cart, checkout or order scopes |
| Tools (23) | `zepto_shop`, `search_products`, `search_multiple_products`, `get_product_details`, `get_location_serviceability`, `select_store`, `list_saved_addresses`, `select_saved_address`, `add_saved_address`, `update_drop_zone`, `get_user_details`, `update_user_name`, `view_cart`, `update_cart`, `get_payment_methods`, `create_order`, `create_online_payment_order`, `create_wallet_order`, `create_upi_reserve_pay_order`, `check_payment_status`, `get_order_detail`, `list_order_history`, `get_past_order_items` |
| Location | `get_location_serviceability { latitude, longitude }` answers in text (store ids, `ETA: 10 minutes`) and **links the location to the MCP session**. Sasta calls it once per session and location |
| Search | `search_products { query, pageNumber }`. `structuredContent.products[] { id, productVariantId, storeProductId, name, price, mrp, imageUrl, packSize, availableQuantity, isAd }`. **Prices in paise** (8800 = ₹88). Product URL `https://www.zepto.com/pn/<slug>/pvid/<productVariantId>` |
| Fixtures | `mobile/fixtures/zepto/mcp-search.json`, `mcp-serviceability.txt` (store ids replaced) |

Without the official connection, Sasta falls back to the storefront reader below.

## Storefront fallback

The production reader returned 30 real product cards on 2026-10-24 after selecting a public delivery area.

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

## Connector repair

The price reader now handles a currency value on the price slot itself, not only
nested spans. Incomplete product cards wait for hydration rather than reporting
zero products as a successful search. Login probes and storefront searches share
an origin queue so a concurrent account check cannot reset the active search.
