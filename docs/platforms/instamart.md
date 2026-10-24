# Instamart

The native app now calls Swiggy's official `search_products` MCP tool at
`https://mcp.swiggy.com/im`. The previous `/instamart` URL was wrong, and the
adapter registry previously had no Instamart search implementation.

Sources checked 2026-10-24:
- https://mcp.swiggy.com/builders/docs/reference/instamart/search_products/
- https://mcp.swiggy.com/builders/docs/start/authenticate/

Search uses the documented coordinate/guest-price mode (`query`, `latitude`,
`longitude`), using the exact coordinates selected in Sasta. It never invents
saved address IDs or selects an account's default address. A postcode alone
returns `needs_location`. This mode does not promise account-specific offers.

The MCP transport still requires OAuth: an unauthenticated initialize against
`/im` returned HTTP 401. Website cookies do not authenticate MCP. Account has a
Reconnect Swiggy action for existing website sessions and expired/old tokens.
Swiggy's documented JSON encoding is used for token exchange and refresh.

The parser handles MCP text and structured content and maps each variation's
`skuId`, `quantityDescription`, `price.offerPrice`, `price.mrp`, and
`isInStockAndAvailable`. Prices use the published rupee fields. Deep links open
the real Instamart search because the contract does not provide product URLs.
No cart, address-creation, checkout, or ordering tool is called.

Validation: production MCP client and adapter run against the local Postman
simulation (synthetic values based on the official schema), including auth,
variants, stock, malformed data, provider errors and cancellation. Positive live
search and the full OTP flow remain unverified without an authenticated phone
session. A mock pass is not a claim of live account access.
