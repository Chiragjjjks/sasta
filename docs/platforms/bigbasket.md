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
