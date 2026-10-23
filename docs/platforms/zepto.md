# zepto

**Verdict:** B (needs WebView, capture the page's own request). Spiked live on 2026-10-24. Not built yet: setting the delivery location is the open problem.

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

**Fixture:** `fixtures/zepto/lays.json`

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
