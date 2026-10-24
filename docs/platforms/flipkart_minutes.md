# Flipkart Minutes

The adapter uses the website session inside its own WebView. Only Hyperlocal search is requested; regular marketplace responses and product links are excluded.

- Search page: `/hyperlocal/pr?q=…&marketplace=HYPERLOCAL&sid=search.flipkart.com`.
- Request: `POST https://1.rome.api.flipkart.com/api/4/page/fetch?cacheFirst=false` with the page URI, `BROWSE_PAGE` context and selected postcode. Credentials are included; headers match the site's `FKUA/msite` request shape.
- Response reader: server-driven `RESPONSE.slots`, nested `productInfo.value` fields for titles, `pricing.finalPrice.value`, MRP, availability, media and product links.
- Address redirects to `hyperlocal-preview-page` or `address-map` require the user to choose a serviceable delivery area. Sasta does not substitute retail listings.

On 2026-10-24, the live endpoint returned HTTP 200 with an exact-address selection redirect. The available anonymous session could not complete the site's map selection. **Positive live Minutes prices remain unverified.** The local HTTP simulation uses representative widget data with synthetic IDs and prices, and the actual observed redirect shape. It checks price/stock parsing, scope, retail rejection, location selection and HTTP failures; it does not certify a signed-in catalogue. See `postman/README.md`.
