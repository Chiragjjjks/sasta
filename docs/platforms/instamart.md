# Instamart

**Verdict:** official MCP. Verified end to end on 2026-10-28 with a real Swiggy sign-in: OAuth, `tools/list`, `get_addresses` and `search_products` returned 12 priced products for "amul milk" in about 1 s. The production adapter passed the same check (`SASTA_LIVE_TOKENS=… npm test -- live-mcp`).

| Item | Finding |
|---|---|
| Server | `https://mcp.swiggy.com/im` (Streamable HTTP, `Mcp-Session-Id`) |
| Auth | `https://mcp.swiggy.com/auth`: dynamic registration (always returns `client_id: swiggy-mcp`), PKCE S256, JSON token body. Access token 5 days, refresh 30 days and rotates |
| Redirect | `http://localhost/sasta/oauth/swiggy` works. The sign-in page names the client "Local Application". Production use outside localhost needs Builders Club approval |
| Tools (16) | `get_addresses`, `create_address`, `delete_address`, `search_products`, `your_go_to_items`, `get_cart`, `update_cart`, `clear_cart`, `checkout`, `get_orders`, `track_order`, `get_delivery_status`, `report_error`, `get_payment_options`, `check_payment_status`, `confirm_order` |
| Location | **A signed-in session must pass `addressId`.** Guest `latitude`/`longitude` are refused with `addressId is required`. `get_addresses` returns `addresses[] { id, addressLine, addressTag, addressCategory, phoneNumber }` (no coordinates) and `resolution.defaultAddressId` |
| Search response | `structuredContent` is `{ nextOffset, products, similarProducts }`. **No `success`/`data` envelope**, unlike the docs. Each product: `displayName`, `brand`, `inStock`, `isAvail`, `isPromoted`, `variations[] { skuId, spinId, displayName, brandName, quantityDescription, price { mrp, offerPrice }, isInStockAndAvailable, imageUrl, sla { value, unit: "MINS" } }`. Prices in rupees |
| Fixture | `mobile/fixtures/instamart/mcp-search.json` (catalog only) |

## Why Instamart showed nothing before v0.6.0

1. The adapter sent only coordinates, which signed-in sessions refuse.
2. The parser required `success: true` and `data.products`, which the live server does not send.

## How Sasta uses it now

- Instamart searches one saved Swiggy address: the one you chose in **Account → Delivery address**, else Swiggy's own `defaultAddressId`, else the only address. The row shows which one. Sasta never creates or deletes addresses.
- ETA comes from `sla`. Deep links open Instamart's own search, because the contract has no product URL.
- Cart, checkout, payment and order tools are never called.
- Website sign-in (`www.swiggy.com`, cookie `_session_tid`) stays as a fallback but does not enable search.

Sources: https://mcp.swiggy.com/builders/docs/reference/instamart/search_products/, https://mcp.swiggy.com/builders/docs/start/authenticate/
