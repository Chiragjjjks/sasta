# Ownly by Rapido

**Verdict:** app only, nothing to connect to. No website, no public or documented API, no MCP server was found. Adapter strategy: **none yet**. Show an "Open in Rapido" hand-off at most, and revisit if Rapido publishes a web menu or an API.

Legend: **[live]** checked on 2026-10-29, **[news]** from press coverage, **[?]** unknown.

| Item | Finding |
|---|---|
| What it is | Rapido's zero-commission food delivery service. Pilot in Bengaluru from August 2025 (Koramangala, HSR Layout, BTM Layout); formal Bengaluru-wide launch 3 March 2026 **[news]** |
| Where you order | A standalone Ownly app (Google Play first, iOS later), and since July 2026 **inside the main Rapido app** for Bengaluru users **[news]**. Press coverage mentions no web ordering and no ordering website at all |
| Website | None found. `ownly.in` does not resolve **[live]**. Searches turned up no official Ownly or Rapido page for ordering; I could not confirm a Play Store package id |
| API, MCP, partner feed | None found. Restaurants connect through POS integrations such as UrbanPiper and Rista **[news]**, which is the restaurant side, not a customer API |
| Pricing facts that matter for comparison | Restaurants pay no commission, platform fee or packaging cost, and Ownly says menu prices are not inflated **[news]**. Customer delivery fee reports differ: ₹20 or ₹25 (2025), a flat ₹30 (2026), or none during the pilot. Treat all as unconfirmed and read the fee from the app at order time **[?]** |
| Catalogue | "Close to 20,000 restaurants" **[news]**; veg-only filter and budget ordering **[news]** |
| Deep links | Unknown. No `ownly://` or Rapido link format is documented **[?]** |
| Login | Phone number and OTP in the app **[?]** |

## What was not tried

- No traffic capture from the app. The app's private API is not something Sasta should use: it is not published, the traffic is probably certificate-pinned, and rule 7 says not to fight protection.
- No account sign-in anywhere.

## How Sasta should use it

- Do not add an adapter. Keep the site's "coming soon" line honest: Ownly is blocked on having any machine-readable source.
- If the owner still wants it listed, add a hand-off row that says "Check Ownly in the Rapido app" with no price, and mark it unverified.
- Revisit when Rapido ships a web menu, a public API, or an MCP server (Swiggy and Zomato both did). Check Rapido's developer pages and the MCP directories.

Sources: https://www.businesstoday.in/amp/latest/trends/story/no-platform-fees-20000-restaurants-rapidos-ownly-food-delivery-goes-live-within-the-main-app-545689-2026-07-28, https://www.storyboard18.com/brand-marketing/rapido-rolls-out-ownly-across-bengaluru-with-zero-commission-model-for-restaurants-91261.htm, https://www.freepressjournal.in/tech/rapido-officially-launches-zero-commission-food-delivery-app-ownly-will-rival-zomato-swiggy, https://www.mobigyaan.com/rapido-ownly-food-delivery-app-india, https://inc42.com/buzz/how-rapidos-ownly-stacks-up-against-zomato-swiggy
