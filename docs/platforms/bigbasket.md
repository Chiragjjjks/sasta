# BigBasket

Native search reads BigBasket's own `/ps/?q=…` page using its saved WebView
session. The previous registry had no BigBasket search adapter.

On 2026-10-24 the public first-party search page displayed `h3` headings with
`/pd/<id>/…` links, pack labels, rupee prices, Add buttons and per-card `10 MINS`
labels. Example visible card: Nandini Pasteurised Toned Milk, 500 ml pouch, ₹24.
The site also showed Select Location: those default-location prices are **not**
accepted by the adapter. Direct HTTP calls to the site's listing API were denied;
the adapter therefore reads the rendered storefront instead.

The reader requires minute-delivery labels (at most 60 minutes), excludes
scheduled delivery, checks a displayed header postcode when available, and
asks for an area when Select Location is visible. Choose the same area in Sasta
and BigBasket; the DOM does not always expose coordinates for distance validation.
Blocked, no-match and incomplete/unavailable pages remain distinct.

Regression fixtures reconstruct the observed DOM structure using synthetic/simple
markup. They verify pack/price/stock extraction, location, blocking and scheduled
item exclusion. The live page was inspected, but the new reader has not yet been
verified end-to-end inside a signed Android WebView with a selected delivery area.

## Listing API (verified 2026-10-28)

`GET /listing-svc/v2/products?type=ps&slug=<query>&page=1` returns JSON when called with `fetch()` from inside `www.bigbasket.com` (real Chrome, logged out). Sasta now uses it first and keeps the card reader as a fallback.

| Item | Finding |
|---|---|
| Products | `tabs[0].product_info.products[]`: `id`, `desc`, `brand.name`, `w` (pack), `pack_desc`, `absolute_url`, `images[].m`, `pricing.discount.prim_price.sp` (price), `pricing.discount.mrp`, `availability { avail_status: "001" in stock / "000" out, button: "Add" / "Notify Me", not_for_sale }`. Other pack sizes are in `children[]` with the same fields |
| Selected area | Cookie `_bb_addressinfo`, base64 of `lat|lng|area|pincode|city|…`, and `_bb_pin_code`. Empty until the user picks an area; then prices change (Amul Gold 500 ml ₹32 → ₹34 at Rajajinagar) |
| Quick delivery | Cookie `xentrycontext=bbnow` (`xentrycontextid=10`). `_bb_locSrc` and `_is_now_ec_serviceable` did **not** change after picking a serviceable area, so Sasta does not rely on them |
| Choosing an area | `GET /places/v1/places/autocomplete/?inputText=…`, then the site writes the cookies. `GET /ui-svc/v2/header/` lists the area's stores (`sa_list`) but carries no ETA |
| ETA | Not in the listing or header APIs. Left empty rather than guessed |
| Fixture | `mobile/fixtures/bigbasket/listing.json` |
