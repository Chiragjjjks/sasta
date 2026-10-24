# Local provider contracts

These mocks stay local; they do not contain accounts, tokens or personal addresses. Postman CLI 1.70+ is required. No owner-published mock was pulled because the available CLI was signed out; public API discovery returned no reusable provider contract.

From the repository root:

```sh
postman simulation run postman/simulations/search.sim.yaml --port 4955 --no-history --output ndjson > /tmp/sasta-sim.ndjson 2> /tmp/sasta-sim.err
```

In a second terminal:

```sh
node mobile/scripts/provider-simulation.cjs
```

The verifier extracts and compiles the production `readFlipkartPage` function and runs its real fetch client against the simulation. Requests retain `/api/4/page/fetch`, the Hyperlocal scope, postcode and headers. Check the log for both a `listening` event and actual `request` events. Stop the simulation with `pkill -INT -f 'simulation run postman/simulations/search.sim.yaml'`.

For the DOM reader, open `http://127.0.0.1:4955/zepto/search?query=lays` in a browser. Generate the production reader with `node mobile/scripts/provider-simulation.cjs --browser zepto`, evaluate it on that page, then call `await readZeptoPage('lays', 1800)`. The expected result has 30 products. Repeat with `mode=login`, `mode=location` and `mode=blocked` for their corresponding states. This uses real served HTML rather than a stubbed DOM/client.

## Provenance and evidence

- Zepto: public title/pack/price/stock/URL fields captured from its first-party search page on 2026-10-24, with a public Bengaluru neighbourhood selected. The mock renders those fields using the observed card selectors. The same production reader also returned 30 cards directly from the live Zepto page. The point is the public selected neighbourhood, not an account/home address.
- Flipkart: representative widget contract based on the Hyperlocal page API and server-driven `productInfo.value` structure. Prices and IDs are synthetic. The location redirect shape was observed live; a positive signed-in Minutes catalogue was not obtained. The HTTP check verifies parsing, stock, scope, location prompt and 401/403/429/503 handling; it does not establish live account availability.
- Amazon: no positive Now response is mocked. The production reader was run on the available first-party Fresh storefront and returned `unavailable`, excluding Fresh/retail as required. A real Now storefront still needs live verification.

Run `cd mobile && npm test` for pack identity, saved-data migration, query filtering and separate login/search reporting. Native WebView/session persistence is checked separately by the signed Android emulator smoke workflow; mocks do not prove real OTP login or personal prices.
