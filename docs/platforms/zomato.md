# Zomato

**Verdict:** logged-out desktop search and menus are live-verified for Rajajinagar (2026-10-29). The source resolves coordinates, sets Zomato's location cookies inside its own page, finds restaurants and reads up to four menus sequentially. Android WebView execution is still unverified. It refuses page responses for a different delivery subzone.

1. **Official MCP, `https://mcp-server.zomato.com/mcp`.** Investigated first; the manifest restricts third-party apps and completing OAuth still needs the owner. No MCP implementation or sign-in was added; findings below remain unchanged.
2. **Website JSON, `/webroutes/getPage`.** Works logged out inside a real Zomato page after selecting the delivery location through the resolver and cookie mechanism below. Earlier plain-curl fixtures used the default UB City location; they remain labelled as such.

Legend: **[live]** seen on 2026-10-29, **[docs]** from Zomato's manifest or directories, **[?]** unknown.

## Official MCP

| Item | Finding |
|---|---|
| Server | `https://mcp-server.zomato.com/mcp`, developer "Eternal Limited", listed as an Anthropic-verified Claude connector **[docs]**. Unauthenticated `initialize` → `401 {"error":"invalid_token"}`; `WWW-Authenticate` has **no** `resource_metadata` pointer **[live]** |
| Discovery | `/.well-known/oauth-authorization-server` → 200: issuer `https://mcp-server.zomato.com/`, `/authorize`, `/token`, `/register`, scopes `mcp:tools mcp:resources mcp:prompts`, PKCE S256, token auth `none`/`client_secret_basic`/`client_secret_post` **[live]**. `/.well-known/oauth-protected-resource` returns the same document (no `authorization_servers`, no `resource`), so Sasta's `discover()` falls back to the origin and works **[live]**. RFC 8707 resource value: not published; try none, then `https://mcp-server.zomato.com/mcp` **[?]** |
| Backend | The authorize redirect goes to `…/consent?login_challenge=…` and the scope came back as `offline openid`: this looks like Ory Hydra behind a Zomato login. `mcp:tools` was not echoed, so scopes cannot narrow access **[live]** |
| Dynamic registration | `POST /register` with `redirect_uris: ["http://localhost/callback"]`, `token_endpoint_auth_method: none` → **200**, a UUID `client_id`, and `client_secret: "Z-MCP"` **[live]**. `state` must be 8+ characters (Sasta's is 22) |
| Redirect allow-list in the manifest | `claude://claude.ai/settings/connectors`, `https://chatgpt.com/connector_platform_oauth_redirect`, `https://claude.ai/api/mcp/auth_callback`, `https://insiders.vscode.dev/redirect`, `https://vscode.dev/redirect`, `https://oauth.pstmn.io/v1/callback`. "To enable another client, reach out to us" **[docs]**. No localhost entry is listed, yet registration and `/authorize` took it **[live]** |
| Policy | "Not allowing any third party apps to be built on top of Zomato MCP" because of security and legal considerations; developer access is by form, "personal use only", reviewed **[docs]**. Sasta is a personal sideloaded app, but this is a risk to tell the owner about |
| Tools (11) | `get_restaurants_for_keyword`, `get_menu_items_listing`, `get_restaurant_menu_by_categories`, `get_saved_addresses_for_user`, `get_cart_offers`, `create_cart`, `checkout_cart`, `get_order_history`, `get_order_tracking_info`, `bind_user_number`, `bind_user_number_verify_code` **[docs: Claude connector listing]** |
| Schemas | Not published. One web-search summary of an unnamed third-party guide says `get_restaurants_for_keyword` takes `user_location`, `keyword`, optional `page_size`, `filters[]`, `postback_params` and returns `results[]`. I could not find that page, so treat it as a rumour **[unverified]**. Everything else is **[?]** until `tools/list` is read after a sign-in |
| Cart model | `create_cart` builds a whole cart in one call (no `update_cart`), with `payment_type` values `upi_qr` or `pay_later` **[docs, third party]**. Never call `create_cart` or `checkout_cart` |

### Feasibility of the localhost redirect

Passed: registration, `/authorize` handing out a login challenge. Not tested: completing login, consent, the redirect back to localhost, `/token`. A one-off owner sign-in in the in-app browser, using `MCP_PROVIDERS`-style config with `redirect: 'http://localhost/callback'`, `tokenEncoding` to be discovered (JSON or form), would settle it. Stop if the consent page errors with "redirect not allowed": that is Zomato's policy speaking, and Sasta should not try to get round it.

## Website JSON (logged out; initial curl probes and desktop verification)

| Item | Finding |
|---|---|
| Endpoint | `GET https://www.zomato.com/webroutes/getPage?page_url=<url-encoded site path>&location=&isMobile=0` → 200 JSON **[live]**. Akamai cookies (`_abck`, `bm_sz`) are set but nothing was challenged at human rate |
| Restaurant list | `page_url=/bangalore/delivery` → `page_data.sections.SECTION_SEARCH_RESULT[]`, 9 restaurant cards per page, `SECTION_SEARCH_META_INFO.searchMetaData.totalResults` (2503), `hasMore`, and `postbackParams` for paging **[live]**. The paging request was not probed **[?]** |
| Dish page | `page_url=/bangalore/delivery/dish-biryani` returns the **restaurants** that serve the "Biryani" universal dish (1569), not dish prices. The dish entity comes from `LDC_Rail` items: `entity_type: "universal_dish"`, `entity_id` ("30308"), `actionInfo.clickUrl` ("/bangalore/delivery/dish-biryani") **[live]**. The source tries a lowercase, hyphenated query slug, then falls back to restaurant autosuggest when no usable restaurant rows exist **[live]** |
| Menu | `page_url=/bangalore/nandhana-palace-indiranagar/order` → 800 KB, 175 dishes **[live]** |
| Location | `/webroutes/location/get` resolves the coordinates, then the site writes `ltv`, `lty`, `locus`, `fbcity`. The source reproduces these location-only writes; URL parameters alone do not select delivery location. See below **[live]** |
| Envelope | `{ page_info, page_data, location, user, pageConfig, … }`. Responses also include analytics `trackingData` blobs: strip them |
| Fixtures | `mobile/fixtures/zomato/rajajinagar-live.json`: 2 nearby restaurants, 3 dishes per menu and 2 autosuggest restaurant hits, trimmed from this round's desktop responses. The older `delivery-list.json` and `restaurant-menu.json` explicitly note their default UB City location |

### Field paths

Restaurant card, `s = SECTION_SEARCH_RESULT[i]` where `s.type === 'restaurant'` (skip `LDC_Rail` and `brands`):

| Wanted | Path | Notes **[live]** |
|---|---|---|
| Id | `s.info.resId` | number |
| Name | `s.info.name` | |
| Area | `s.info.locality.name` ("Indiranagar, Bangalore"), `s.info.locality.address` | |
| Rating | `s.info.rating.aggregate_rating` (string "4.4"), `s.info.rating.votes` ("33.2K"); delivery-only: `s.info.ratingNew.ratings.DELIVERY.rating` | |
| ETA | `s.order.deliveryTime` = "25–30 min" (en dash) | parse the digits; range, not a number |
| Distance | `s.distance` = "648 m" or "1.6 km" | string |
| Delivery fee | none in the list | **[?]** |
| Offer text | `s.bulkOffers[].text` ("30% OFF", "₹150 OFF"), `s.promoOffer` (usually empty) | |
| Open / orderable | `s.order.isServiceable`, `s.order.hasOnlineOrdering`, `s.isDisabled` | no closed state seen in 9 cards **[?]** |
| Pure veg? | not on the card. The list offers a "Pure Veg" filter (`meta_filter` `100354`, `postKey {"meta_filter":100354}`) | filter, not a flag |
| Cost | `s.info.cfo.text` "₹600 for one", `s.info.cft.text` "₹1,400 for two" | |
| Sponsored | `s.isPromoted` | |
| Open the menu | `s.order.actionInfo.clickUrl` / `s.cardAction.clickUrl`, e.g. `/bangalore/nandhana-palace-indiranagar/order` | |

Menu page: `page_data.order.menuList.menus[].menu.categories[].category.items[].item` (only categories that have `items`; nested categories may exist **[?]**). Restaurant header: `page_data.sections.SECTION_BASIC_INFO` `{ res_id, name, res_status_text ("Open now"), is_temp_closed, is_perm_closed, resUrl, rating }`; `page_data.orderDetails` `{ isServiceable, hasOnlineOrdering, deliveryTime ("44 min"), deeplink, minOrderAmountDetails }`.

| Wanted | Path (`it = …item`) | Notes **[live]** |
|---|---|---|
| Id | `it.id` ("ctl_481102763"), `it.variant_id`, `it.vendor_item_id` | |
| Name | `it.name` | |
| Price | `it.price` in **rupees** (375). Also `default_price`, `display_price`, `min_price`, `max_price` (range across variants) | |
| Strike-through | not seen. No MRP or `dis_price` key in the 175 items | discounts may sit in `item_metadata` **[?]** |
| Veg flag | `it.dietary_slugs[0]` is `"veg"` or `"non-veg"` (103 veg, 72 non-veg) | |
| Available | `it.item_state === "available"` (all 175); `it.disabled_text` | other states **[?]** |
| Image | `it.item_image_url` (172 of 175), `item_image_thumb_url` | |
| Description | `it.desc` | |
| Rating | `it.rating.value`, `it.rating.total_rating_text` ("1255 votes") | |
| Add-ons | `it.modifier_group_ids[]` → `page_data.order.menuList.modifierGroups[id].group.items` | |

## Deep links

- **App:** `zomato://order/<resId>` (`orderDetails.deeplink`) **[live]**.
- **Web restaurant:** `https://www.zomato.com/<city>/<slug>/order` from `clickUrl` (for example `https://www.zomato.com/bangalore/nandhana-palace-indiranagar/order`) **[live]**.
- **Dish:** no per-item URL. Dish-search cards append `?contextual_menu_params=<base64 JSON>` such as `{"dish_search":{"title":"Best in Biryani","dish_ids":["30308"],"cuisine_ids":[]}}`, which highlights a dish category **[live]**.

## Delivery location and source flow

One `PlatformSession.pageRun` on `https://www.zomato.com` (`/robots.txt` bootstrap), protected by `withSessionTurn`, handles an entire search. Source settings: `serial: true`, `attempts: 1`, `timeoutMs: 25000`; page timeout: 22000 ms. Abort resets the WebView and discards results.

1. `GET /webroutes/location/get?lat=<lat>&lon=<lng>&userDefinedLatitude=<lat>&userDefinedLongitude=<lng>` with `credentials: 'include'`. Read `locationDetails`. For the requested 12.9915, 77.5544 it returned `entityId: 5210`, `entityType: "subzone"`, `locationType: "poi"`, `cityId: 4`, `cityName: "Bengaluru"`, `deliverySubzoneId: 781`, `o2Serviceable: true`. Failure or incomplete location data becomes `NeedsLocationError`; explicit `o2Serviceable: false` becomes `ProviderUnavailableError("Zomato doesn't deliver to <area> yet.")`.
2. Write each location value using `document.cookie = key + '=' + encodeURIComponent(value) + '; path=/; domain=.zomato.com; max-age=86400; secure'`:
   - `ltv = String(entityId)` and **`lty = String(entityId)`** (the site's cookie uses the id too).
   - `locus = JSON.stringify({ addressId: 0, lat, lng, cityId, ltv: entityId, lty: entityType, fetchFromGoogle: false, dszId: deliverySubzoneId, fen: entityName })`.
   - `fbcity = String(cityId)`.
   These select a point for browsing; no saved address is created, edited or deleted.
3. `GET /webroutes/getPage?page_url=/<citySlug>/delivery/dish-<slug>&location=&isMobile=0`, URL-encoding `page_url`. Map Bengaluru to `bangalore` (also Gurugram → `gurgaon`, Delhi/New Delhi → `ncr`); otherwise slugify the returned city name, defaulting to `bangalore` if empty. Query slugs are lowercase ASCII words joined by hyphens. This is a bounded attempt, not a claim that every dish has a universal-dish page.
4. If the dish page is HTTP 404, Zomato's HTTP 200 `page_info.name: "404"`, or has no usable restaurant rows, request `/webroutes/search/autoSuggest?addressId=0&entityId=<id>&entityType=<type>&locationType=<type>&isOrderLocation=1&cityId=<id>&latitude=<lat>&longitude=<lng>&q=<query>&context=delivery`. Keep `entityType: "restaurant"` hits with `info.resId`, name and a valid `/order` URL. Non-serviceable rows are excluded from menu fan-out. Autosuggest supplies `info.rating.text` and `order.deliveryTime` can be `Delivery in 30 min`.
5. De-duplicate restaurant ids and keep at most four serviceable outlets. Read `order.actionInfo.clickUrl` and `cardAction.clickUrl`, accepting whichever is a safe Zomato `/order` URL; remove its query string. Fetch each menu sequentially through `getPage`. Verify `SECTION_BASIC_INFO.res_id` against the selected outlet in the script and again in the pure menu parser. A mismatch fails the search; it never attaches another outlet's menu.
6. Check every successful page response's `location.deliverySubzoneId` against the resolver. Missing or different subzones fail with `NeedsLocationError`, avoiding UB City fallback prices. Returned coordinates can be the resolved POI centroid (observed 12.989979, 77.554359), so exact coordinate equality would be incorrect. Return all parsed menu dishes; the shared runner applies `relevantDishes`.

**Request budget:** dish search: 1 resolver + 1 dish list + up to 4 menus = **6** API requests. Fallback: add 1 autosuggest = **7** maximum. Single-outlet `menu(outlet, loc, signal)`: 1 resolver + 1 menu = **2**. No paging, retries or parallel menu requests. The `/robots.txt` WebView bootstrap is a separate navigation when needed; the seven-request cap covers the search script's API calls. HTTP 202/403/429 or a challenge stops the flow; there is no protection bypass or retry loop. Resolver errors are reported as location failures.

MCP remains unimplemented. Signed-in investigation needs the owner; no sign-in was attempted. Cart, order and payment tools are never called.

## Not verified / remaining risks

- Android WebView execution, cookie acceptance and latency within the 22-second page budget.
- Signed-in behavior, MCP schemas and whether localhost OAuth survives consent/token exchange.
- Cities other than Bengaluru, arbitrary/non-ASCII dish slugs, paging and exhaustive restaurant coverage. Only four serviceable menus are sampled per query; a valid dish page takes precedence over restaurant-name lookup.
- Delivery fees, taxes, packing, variant/add-on totals, per-item discounts and closed-state shapes beyond fixtures. Menu prices are rupees before cart offers/fees.
- Undocumented website endpoints and cookies can change; WAF/rate limits may differ on Android. A failed menu currently fails that search rather than returning partial prices.

Sources: https://github.com/Zomato/mcp-server-manifest, https://claude.com/connectors/zomato, https://mcp-server.zomato.com/.well-known/oauth-authorization-server, https://www.zomato.com/webroutes/getPage (live probes). Tool list: https://claude.com/connectors/zomato, https://manufact.com/mcp-catalog/zomato. Neither page gives schemas; https://agnost.ai/blog/zomato-mcp-server-order-food-claude-desktop/ names `get_all_restaurants` and says the server wants latitude, longitude and a formatted address, with no field names.


## Desktop verification, round 2 (2026-10-29)

The previous round hit transport failures and could not reach the picker. Those blockers were superseded by the verified resolver/cookie mechanism above.

This round used the T3 collaborative desktop browser on a real `https://www.zomato.com/robots.txt` page. It reused no owner login and performed no sign-in. The exact generated `zomatoSearchScript` was evaluated with real in-page fetches for both queries; the existing pure parsers then read the complete responses in-page. `zomatoMenuScript` was also executed separately, including removal of an extra query string.

- **`biryani`: 6 API requests**, four Rajajinagar outlets, **415 menu dishes** (61 whose names contain `biryani`, before the runner's normalization/filtering). Meghana Foods: 89 dishes, 994 m; RNR Biryani - Taste Of 1953: 96 dishes, 455 m; Hotel Aditya- Mahalakshmipuram: 57 dishes, 1.9 km; Nandhana Palace: 173 dishes, 452 m. Each response had delivery subzone 781 and `fetchedFromCookie: true`.
- **`meghana`: 4 API requests**, HTTP 200 Zomato 404 dish page → autosuggest → Meghana Foods, Rajajinagar (id 19544819), **89 menu dishes**. Other autosuggest hits were not serviceable and did not trigger menu fetches.
- **Single outlet menu: 2 API requests**, Meghana Foods, same resId and subzone, **89 dishes**.
- Example rupee prices: Meghana Foods **Chicken Boneless Biryani ₹375**, **Meghana Special Boneless Biryani ₹383**; RNR **RNR Special Donne Chicken Boneless Biryani (Regular Packaging) ₹359**; Hotel Aditya **Chicken Biryani. ₹230**; Nandhana Palace **Nati Style Donne Chicken Biryani ₹365**.

**Total this round: 1 Zomato document navigation + 16 explicit API requests = 17 loads**, below the 25-load ceiling. The 16 API calls comprise 4 discovery calls (resolver, biryani list, meghana autosuggest, meghana dish-page check), then 6 + 4 + 2 implementation calls. No extra requests were needed to trim fixtures or parse the stored responses. Calls used one page sequentially at human rate.

`rajajinagar-live.json` retains only public restaurant/menu fields, two restaurants and three dishes per menu, plus two autosuggest hits. Authentication, tracking, full address, user, cookie and session payloads were omitted before writing the fixture. Existing UB City fixtures stay labelled and continue to test parser edge cases.
