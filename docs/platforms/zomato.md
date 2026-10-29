# Zomato

**Verdict:** the website JSON works logged out and gives prices, but **location cannot be set from the URL**; the official MCP is gated by policy. Neither route is ready to build against without one more spike with the owner.

1. **Official MCP, `https://mcp-server.zomato.com/mcp`.** Real OAuth server with dynamic registration. Zomato's manifest says third-party apps are **not allowed** and the access is "personal use only", "only for testing". But the server **accepted a `http://localhost/callback` client and redirect** at registration and at `/authorize` (it issued a login challenge instead of a redirect error). Whether the sign-in, consent or token step later rejects it is unknown without a real sign-in, which the owner has to do. Tool schemas are not public.
2. **Website JSON, `/webroutes/getPage`.** Plain curl returned restaurant lists and a full restaurant menu with rupee prices, no cookies, no login. The delivery area stayed on Zomato's default point (Table Space UB City) whatever we passed, so distances, ETAs and offers are for the wrong place.

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

## Website JSON (logged out, plain curl)

| Item | Finding |
|---|---|
| Endpoint | `GET https://www.zomato.com/webroutes/getPage?page_url=<url-encoded site path>&location=&isMobile=0` → 200 JSON **[live]**. Akamai cookies (`_abck`, `bm_sz`) are set but nothing was challenged at human rate |
| Restaurant list | `page_url=/bangalore/delivery` → `page_data.sections.SECTION_SEARCH_RESULT[]`, 9 restaurant cards per page, `SECTION_SEARCH_META_INFO.searchMetaData.totalResults` (2503), `hasMore`, and `postbackParams` for paging **[live]**. The paging request was not probed **[?]** |
| Dish page | `page_url=/bangalore/delivery/dish-biryani` returns the **restaurants** that serve the "Biryani" universal dish (1569), not dish prices. The dish entity comes from `LDC_Rail` items: `entity_type: "universal_dish"`, `entity_id` ("30308"), `actionInfo.clickUrl` ("/bangalore/delivery/dish-biryani") **[live]**. How to turn an arbitrary query into a dish slug (autosuggest) was not found **[?]** |
| Menu | `page_url=/bangalore/nandhana-palace-indiranagar/order` → 800 KB, 175 dishes **[live]** |
| Location | **Not settable from the URL.** `place_name=Rajajinagar…` in `page_url` and an encoded `locationDetails` object in `location=` were both ignored; the response `location` stayed on Table Space UB City (lat 12.9716, lng 77.5944, `fetchedFromCookie: false`) **[live]**. `GET /webroutes/location/get?lat=12.9915&lon=77.5544&isOrderLocation=1` resolves a point to a delivery subzone (`entityName` "ESI Post Graduate Institute… Rajajinagar", `cellId`, `deliverySubzoneId: 781`, `o2Serviceable: true`) but does not set it **[live]**. The site keeps the chosen place in a cookie; the cookie name and the call that writes it were not identified **[?]** |
| Envelope | `{ page_info, page_data, location, user, pageConfig, … }`. Responses also include analytics `trackingData` blobs: strip them |
| Fixtures | `mobile/fixtures/zomato/delivery-list.json` (3 restaurant cards), `restaurant-menu.json` (restaurant header and 4 dishes). Both note the default location |

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

## How Sasta should use it

- Do not build either route yet. Next step is one spike, in a WebView on `www.zomato.com`: pick Rajajinagar in the site's own location picker, then log the network calls and cookies to find what writes the delivery location. If `getPage` then returns Rajajinagar distances, a WebView adapter that calls `getPage` from inside the page is feasible; dish-level comparison needs one menu fetch per candidate restaurant (800 KB each), which is heavy.
- Separately, ask the owner whether to try one sign-in against the MCP server with a localhost redirect. If Zomato refuses it, record that here and stay on the WebView route.
- Cart, order and payment tools are never called.

## Not verified

- Anything signed in, including MCP tool schemas and whether a localhost redirect survives consent and token exchange.
- How the website stores the delivery location, and the paging call.
- Keyword search on the web (the `dish-<name>` page only works for Zomato's universal dish list).
- Delivery fee, closed states, per-item discounts.

Sources: https://github.com/Zomato/mcp-server-manifest, https://claude.com/connectors/zomato, https://mcp-server.zomato.com/.well-known/oauth-authorization-server, https://www.zomato.com/webroutes/getPage (live probes). Tool list: https://claude.com/connectors/zomato, https://manufact.com/mcp-catalog/zomato. Neither page gives schemas; https://agnost.ai/blog/zomato-mcp-server-order-food-claude-desktop/ names `get_all_restaurants` and says the server wants latitude, longitude and a formatted address, with no field names.
