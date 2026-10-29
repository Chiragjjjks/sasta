# Swiggy Food

**Verdict:** WebView dish search is implemented and verified logged out. Menus remain blocked; official MCP still needs the owner's sign-in.

1. **Official MCP (preferred, not yet signed in).** `https://mcp.swiggy.com/food` shares Instamart's auth server, so the existing Swiggy OAuth flow should carry over. Tool names and response schemas are public in the docs (read 2026-10-29). Nothing was called signed in, so field shapes below marked *docs* are unverified.
2. **Website JSON (verified logged out).** `GET https://www.swiggy.com/dapi/restaurants/search/v3` returned real dish and restaurant prices for Rajajinagar with plain curl on 2026-10-29. The restaurant **menu** endpoint (`/dapi/menu/pl`) sits behind an AWS WAF challenge, so it needs the hidden WebView.

Legend: **[live]** seen in a real response on 2026-10-29, **[docs]** from Swiggy's builder docs, **[?]** unknown or recalled and not checked.

## Official MCP

| Item | Finding |
|---|---|
| Server | `https://mcp.swiggy.com/food` (Streamable HTTP). Unauthenticated `initialize` returns `401` with `WWW-Authenticate: Bearer realm="mcp", resource_metadata="https://mcp.swiggy.com/.well-known/oauth-protected-resource"` **[live]**. `tools/list` is not public, but the docs publish every schema |
| Auth server | Same as Instamart: issuer `https://mcp.swiggy.com/auth`, authorize `/auth/authorize`, token `/auth/token`, register `/auth/register`, PKCE S256 only, scope `mcp:tools` (`mcp:resources`, `mcp:prompts` also listed) **[live]**. Scope is server-level, not read/write split **[docs]** |
| Client and redirect | Dynamic registration returns `client_id: swiggy-mcp` (seen for Instamart; same server). `http://localhost...` redirects need no approval for development; production redirects need Builders Club approval **[docs]**. Sasta's `http://localhost/sasta/oauth/swiggy` already works for `/im` |
| RFC 8707 resource | The protected-resource document says `"resource": "https://mcp.swiggy.com"` (the bare origin) **[live]**. Sasta sends `https://mcp.swiggy.com/im` for Instamart and that works. For Food, try `https://mcp.swiggy.com/food` first, then the bare origin **[?]** |
| One sign-in or two | Scope text says `mcp:tools` covers "any tool on any Swiggy MCP server the user is allowed to use" **[docs]**. Try the stored Instamart token against `/food` first; if it answers 401, run a second sign-in with `resource=https://mcp.swiggy.com/food` **[?]** |
| Tokens | Access 5 days, refresh 30 days and it rotates, JSON token body **[docs]**, same as Instamart **[live]** |
| Tools | Reference index lists 19; `llms.txt` adds `create_address`, `delete_address`. Read-only: `get_addresses`, `search_restaurants`, `search_menu`, `get_restaurant_menu`, `get_food_orders`, `get_food_order_details`, `fetch_food_coupons`, `recommend_address`. Never call: `update_food_cart`, `flush_food_cart`, `apply_food_coupon`, `place_food_order`, `confirm_order`, `get_payment_options`, `check_payment_status`, `create_address`, `delete_address`, plus the tracking tools until orders are in scope |
| Location | `search_restaurants`, `search_menu` and `get_restaurant_menu` accept **either** `addressId` (from `get_addresses`) **or** `latitude` + `longitude`, "for both authenticated and guest calls" **[docs]**. Instamart said the same and then refused coordinates when signed in, so test this live before relying on it **[?]**. Fallback: the same saved `addressId` Sasta already stores for Instamart |
| Response envelope | Docs show `{ success, data, message }`. Instamart's live server sent **no envelope**. Make the parser accept both (`structuredContent.data ?? structuredContent`) **[docs, likely differs]** |
| Price unit | Not stated in the docs. The website uses paise. Check on the first live call **[?]** |

### Tool signatures **[docs]**

- `get_addresses { page?, pageSize?, selectedAddressId?, explicitAddressId?, latitude?, longitude? }` returns `data.addresses[] { id, addressLine, phoneNumber, addressCategory?, addressTag? }`, `data.pagination { page, pageSize, total, totalPages, hasMore }`, `data.resolution { defaultAddressId?, resolutionSource, needsUserClarification, candidateAddressIds }`.
- `search_restaurants { query (required), addressId? | latitude+longitude, offset? }` returns `data.restaurants[] { id, name, cuisines[], avgRating, totalRatings, costForTwo, areaName, distanceKm, deliveryTimeMinutes, deliveryTimeRange, veg, offer, imageUrl, availabilityStatus ("OPEN" | "CLOSED" | "UNAVAILABLE"), nextOpenTime }`, `data.dishes[] { id, name, price, isVeg, description, imageUrl, category, inStock, restaurantId, restaurantName, restaurantRating, restaurantAreaName, deliveryTimeMinutes }`, `nextOffset`, `hasMore`, `totalRestaurants`.
- `search_menu { query (required, dish name), addressId? | latitude+longitude, restaurantIdOfAddedItem?, vegFilter? (0|1), offset? }` returns `data.items[] { name, price, isVeg, menu_item_id, inStock (number), restaurant_id, restaurant_name, imageUrl, rating, totalRatings, hasVariants, hasAddons, isBestseller, variations[] | variantsV2[], addons[] }`, `totalItems`, `hasMore`, `nextOffset`. This is the cross-restaurant **dish search**: omit `restaurantIdOfAddedItem` to search every restaurant.
- `get_restaurant_menu { restaurantId (required), addressId? | latitude+longitude, page?, pageSize? (max 8) }` returns `data.restaurant { id, name, areaName, avgRating, isOpen, deliveryTime, slaString, costForTwoMessage }` and `data.categories[] { title, categoryId, totalItems, hasMoreItems, items[] { id, name, description, price, inStock, isVeg, isBestseller, imageUrl, hasVariants, hasAddons } }` (pagination over categories, max 10 dishes each).

## Website JSON (logged out, plain curl, 2026-10-29)

| Item | Finding |
|---|---|
| Dish search | `GET https://www.swiggy.com/dapi/restaurants/search/v3?lat=12.9915&lng=77.5544&str=biryani&trackingId=undefined&submitAction=ENTER&queryUniqueId=<uuid>` → 200 JSON, ~1.1 MB, ~1.9 s upstream **[live]**. Default tab is dishes |
| Restaurant search | Same URL plus `&selectedPLTab=RESTAURANT` → 200, 102 restaurants, 230 KB **[live]** |
| Headers | Only a normal browser `User-Agent`, `Accept: application/json`, and a `Referer` of `https://www.swiggy.com/search`. No cookies or tokens were sent **[live]** |
| Location | `lat` and `lng` in the query string are honoured: distances came back as 0.7 to 10.9 km from Rajajinagar and every result was `SERVICEABLE` **[live]**. Unserviceable-area response shape not seen **[?]** |
| Menu | `GET /dapi/menu/pl?page-type=REGULAR_MENU&complete-menu=true&lat=…&lng=…&restaurantId=690552&catalog_qa=undefined&submitAction=ENTER` → **HTTP 202, empty body, `x-amzn-waf-action: challenge`** **[live]**. The WAF token is minted by JavaScript, so only the WebView can call it. Menu field paths are not captured here **[?]** |
| Envelope | `{ statusCode: 0, data: { statusMessage, cards[], firstOffsetRequest, configs }, tid, sid, deviceId, csrfToken }`. **Drop `tid`, `sid`, `deviceId`, `csrfToken`** from anything stored or logged |
| Pagination | `data.firstOffsetRequest` is true on the first page; the next-page offset parameter was not probed **[?]** |
| Fixtures | `mobile/fixtures/swiggy_food/search-dish.json` (3 restaurants, 2 to 3 dishes each, includes a `variantsV2` dish), `search-restaurant.json` (3 restaurants). Tracking, ad ids, analytics blobs and most add-ons removed |

### Field paths

Dish search: `data.cards[]` has a navigation card then `data.cards[1].groupedCard.cardGroupMap.DISH.cards[]`. Keep entries where `card.card['@type']` ends with `DishGroup` (50 per page; skip `SearchFilterSortWidget` and `SearchQueryList`). Each group has one restaurant and its matching dishes.

| Wanted | Path (under one DishGroup `g = card.card`) | Notes **[live]** |
|---|---|---|
| Restaurant id | `g.restaurant.info.id` | string, e.g. `"690552"` |
| Name | `g.restaurant.info.name` | |
| Area | `g.restaurant.info.areaName` (also `locality`, `address`) | |
| Rating | `g.restaurant.info.avgRating` (number), `avgRatingString`, `totalRatingsString` ("8.2K+") | can be missing on new restaurants |
| ETA minutes | `g.restaurant.info.sla.deliveryTime` (number), `minDeliveryTime`, `maxDeliveryTime`, `slaString` ("15-20 MINS") | |
| Distance | `g.restaurant.info.sla.lastMileTravel` (km, number), `lastMileTravelString` | |
| Delivery fee | none. `info.feeDetails` is always `{}` in search | needs menu endpoint **[?]** |
| Offer text | none. `info.aggregatedDiscountInfoV2.visible` is only a boolean | menu endpoint carries the text **[?]** |
| Open? | `g.restaurant.info.availability.opened` (bool) and `sla.serviceability === "SERVICEABLE"` | all 50 were open and serviceable |
| Pure veg? | `info.veg === true` on the restaurant tab (present for 12 of 102, absent otherwise). Not on dish-tab restaurants | absent means "not pure veg" |
| Cost for two | `info.costForTwo` is a **paise string** (`"50000"` = ₹500); `costForTwoMessage` is `"₹500 FOR TWO"` | |
| Dish id | `g.dishes[].info.id` | string |
| Dish name | `g.dishes[].info.name` | |
| Price | `g.dishes[].info.price` in **paise** (34500 = ₹345) | for variant dishes `price` is the default variant |
| Strike-through | none in search. `info.defaultPrice` (paise, only on `variantsV2` dishes) equalled `price` in every case seen | no MRP field **[live]** |
| Veg flag | `info.isVeg === 1` means veg; **absent means non-veg** (79 veg flags, 258 absent in 337 dishes) | |
| Available | `info.inStock === 1`; **absent means out of stock** (40 of 337, each with `info.nextAvailableAtMessage`, e.g. "Next available at 9:40 pm, tomorrow") | |
| Image | `info.imageId`; restaurant `info.cloudinaryImageId`. Both are Cloudinary ids; prefix `https://media-assets.swiggy.com/swiggy/image/upload/fl_lossy,f_auto,q_auto,w_208,h_208,c_fit/` **[recalled, not fetched]** | |
| Description | `info.description` (only some dishes) | |
| Category | `info.category` | |
| Variants | `info.variantsV2.variantGroups[].variations[] { id, name, price, default?, inStock }` and `variantsV2.pricingModels[] { variations[], price, addonCombinations[] }`. 68 of 337 dishes had them; none had legacy `variants` | |
| Add-ons | `info.addons[] { groupId, groupName, choices[] { id, name, price, inStock?, isVeg? }, maxAddons, maxFreeAddons }` | |
| Bolt (fast) | `info.isBolt === true` (51 of 337) | |
| Sponsored | `g.restaurant.info.promoted === true` (20 of 50). Skip or mark | |

Restaurant tab: `data.cards[0].groupedCard.cardGroupMap.RESTAURANT.cards[].card.card`, `@type` ends with `.Restaurant`, same `info` object as above.

## Deep links

- **App (observed):** each result carries `ctaWithParams: { link: "swiggy://menu", params: { restaurant_id, query, … } }` **[live]**. Build `swiggy://menu?restaurant_id=<id>&query=<dish name>`. Sasta should still check the OS can open it before showing the button.
- **Web restaurant:** `https://www.swiggy.com/city/<info.slugs.city>/<info.slugs.restaurant>-rest<info.id>`, e.g. `https://www.swiggy.com/city/bangalore/narmada-chain-of-restaurant-rajajinagar-rajajinagar-rest690552`. The slugs are in every result **[live]**; the URL pattern is recalled, not fetched **[?]**.
- **Dish:** no per-dish URL is known. Open the restaurant (with `query` in the app link) and show the dish name.

## How Sasta should use it

- Start with the MCP route if a stored Instamart token works on `/food`; otherwise the WebView route. Both give restaurants, dishes, prices and ETA. The MCP route avoids the AWS WAF problem on the menu.
- For the WebView route, run `fetch('/dapi/restaurants/search/v3?…')` inside a hidden page on `https://www.swiggy.com` (same shape as `createPageAdapter`), with `lat`/`lng` from the Sasta location. No login is needed to search.
- Prices are paise on the web; confirm the MCP unit before mixing them.
- Show `availability.opened`, out-of-stock and "next available" honestly; do not hide closed restaurants silently.
- Cart, coupon, address-writing, order and payment tools are never called.
- Record the first live signed-in `search_menu` and `get_restaurant_menu` replies as fixtures once available.

## Not verified

- Signed-in MCP calls of any kind, including whether `/food` accepts the Instamart token and whether coordinates work for a signed-in session.
- The `/dapi/menu/pl` response (blocked by WAF in curl).
- Delivery fee and restaurant offer text on the website.
- The next-page offset parameter.

Sources: https://mcp.swiggy.com/builders/docs/reference/food/index.md, `.../food/search_restaurants.md`, `.../food/search_menu.md`, `.../food/get_restaurant_menu.md`, `.../food/get_addresses.md`, https://mcp.swiggy.com/builders/docs/start/authenticate.md, https://mcp.swiggy.com/builders/llms.txt, https://mcp.swiggy.com/.well-known/oauth-protected-resource, https://mcp.swiggy.com/.well-known/oauth-authorization-server

## Source implementation (2026-10-29)

**Live browser check:** desktop Playwright with installed Chrome, fresh logged-out context, `https://www.swiggy.com/search` loaded HTTP 200. The actual generated `swiggySearchScript` and `parseSwiggySearch` returned **289 dishes** for `biryani` at `12.9915, 77.5544`. First results included Narmada Chain of Restaurant, Rajajinagar (1.8 km, 20 min), Paneer Biryani ₹345 and Box Paneer Biryani ₹224. The actual generated menu script for that outlet returned **HTTP 403** and stopped with `blocked:403`; no retry or challenge solving was attempted. No response tracking fields, cookies or session identifiers were saved. This verifies desktop in-page search, **not Android WebView execution**.

`mobile/src/core/food/adapters/swiggy.ts` runs one dish-tab request per search inside the Swiggy WebView, serialized with other work on that origin. It requires finite, in-range latitude and longitude; a postcode alone is insufficient. Coordinates are sent as `lat` and `lng` on both search and menu requests, rather than changing or creating a saved address. No cart or account writes are performed. Search prices are divided by 100, preserving the provider's default item price rather than choosing a variant minimum. Closed restaurants and out-of-stock dishes remain labelled as such. Fees and unobserved item discounts stay unknown.

Parser checks cover both existing logged-out search fixtures. `menu(outlet, loc, signal)` requests `/dapi/menu/pl` and reads `itemCards` and nested `categories` from the regular menu cards, with duplicate suppression and restaurant-id checking. **No live menu fixture exists**: its envelope is tested synthetically using real search item records; the category nesting and `defaultPrice` fallback are provisional until a real menu response can be captured. HTTP 202/403/429 and WAF challenge pages stop immediately with `ProviderBlockedError`. Other invalid responses are unavailable, never guessed prices.

Restaurant-tab parsing is available and fixture-tested, but search deliberately uses only the dish tab (one request). Restaurant-name queries therefore depend on what Swiggy returns on that tab; the source does not fan out to restaurant menus automatically.

**Next:** test the official `https://mcp.swiggy.com/food` with the owner's sign-in and capture trimmed read-only replies. MCP is not implemented by this source; no sign-in was attempted.
