# Swish

**Verdict:** app only, and not a marketplace, so there is nothing to compare against Swiggy or Zomato through an API. Adapter strategy: **none yet**. `justswish.in` is a marketing page with a "Get Swish" app-download link, no menu and no ordering.

Legend: **[live]** checked on 2026-10-29, **[news]** from press coverage, **[?]** unknown.

| Item | Finding |
|---|---|
| What it is | A Bengaluru 10-minute food delivery company started in 2024. It runs its **own kitchens** ("delight centres"), sourcing and riders, with no third-party restaurants **[news, and the site says so]** |
| Scale and reach | About 20,000 orders a day across 10 Bengaluru micro-markets (March 2026); expansion to Delhi-NCR and Mumbai planned. $38M Series B, March 2026 **[news]**. One older report lists Gurugram, Noida, Delhi and Ghaziabad too, which I could not confirm **[?]** |
| Website | `https://justswish.in/` returns 200: a Framer-built landing page titled "Swish - 10 Min Food Delivery" with Careers, Press Kit and Get Swish links **[live]**. No menu, prices, search or cart in the page |
| App link | "Get Swish" points at the AppsFlyer OneLink `https://swish.onelink.me/OdaH/8b8tjqwr`, which redirects to the Play Store or App Store by device **[live]**. I did not follow it or learn the package id |
| Web ordering | None found **[live]** |
| API, MCP, partner feed | None found. Press coverage mentions no integrations; Swish avoids third-party commission by running its own kitchens **[news]** |
| Menu | More than 200 items across meals, snacks and beverages **[news]**. Because Swish owns its kitchens, its menu is one catalogue, probably varying by kitchen and area **[?]** |
| Deep links | None documented. The OneLink above opens the app store page, not a dish **[?]** |
| Login | Phone number and OTP in the app **[?]** |

## What was not tried

- No app install, no traffic capture, no sign-in. Private app APIs are out of bounds for Sasta (rule 7).

## How Sasta should use it

- No adapter. Keep Swish on the "coming soon" list with the honest note that it is app-only and has no data source we can read.
- If the owner wants it in a comparison anyway, the only honest option is a hand-off row ("Check Swish in its app") with the OneLink and no price.
- A Swish menu cannot be compared dish for dish with restaurant menus without a data source; pricing it by hand would go stale.
- Revisit if `justswish.in` gets a web menu or Swish publishes an API.

Sources: https://justswish.in/ (live), https://techcrunch.com/2026/03/23/bengaluru-food-startup-swish-raises-38m-in-its-third-round-in-18-months/, https://inc42.com/?p=474889, https://yourstory.com/2026/03/swish-raises-38-mn-led-by--hara-global-and-bain-capital-ventures
