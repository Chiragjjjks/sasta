# Sasta — one search, every quick-commerce app

Sasta is an Android app (APK). You type one product, and it shows every matching pack from every quick-commerce app that delivers to you, sorted by price. No login, no backend server. All fetching happens on the phone.

This file is the handoff. A coding agent should be able to read it top to bottom and continue without any other context.

## Problem

Buying a pack of Lay's in Bengaluru means opening Blinkit, Zepto, Instamart, BigBasket, Flipkart Minutes and Amazon Now one by one, typing the same search six times, and comparing prices and delivery times in your head. The same pack differs by ₹2–₹10 between apps, and stock differs by dark store.

## Example

The user types `lays`.

1. The app uses the saved delivery pin, for example Rajajinagar 560010.
2. It searches all six platforms in parallel.
3. Results are grouped by brand, then flavor (Classic Salted, India's Magic Masala, Cream & Onion, Tomato Tango, Chile Limón), then pack size (48 g, 115 g).
4. Each card shows the cheapest in-stock offer, its platform and ETA, and the other platforms' prices.
5. A "Best value" card shows the lowest ₹/100 g across all results.
6. Tapping a card opens a sheet with every platform's price, MRP, ETA and stock, and an **Open** button into that app.

`lays cream onion` runs the same flow, pre-filtered to Cream & Onion.

## Current status (v0.2.0)

| Phase | Status |
|---|---|
| 0. Scaffold, UI port, mock data, APK release pipeline | **Done** |
| 1. Platform spikes (find real endpoints) | Not started. **Do this next.** |
| 2. Live adapters | Not started |
| 3. Matching polish on real data | Normalizer exists and is unit-tested on mock titles |
| 4. Location and polish | Partly done: manual pin + GPS, recents, 10 min cache |
| 5. Ship | Pipeline done. Every `v*` tag publishes a signed APK to GitHub Releases |

**What works now:** the full UI from the reference prototype, running on a deterministic mock adapter per platform. Search, streaming per-platform status, grouping of differently spelled titles into one card, best value, flavor chips, pack-size toggle, cheapest/fastest sort, compare sheet with Open links, location sheet, recent searches, dark mode, Android back button.

**Cart (v0.2.0):** add any number of products from different searches. Each item defaults to its cheapest in-stock app, and the cart shows the total, savings vs MRP, and how many apps the order is split across. You can instead put everything on one app ("All on Zepto ₹60, +₹4"), or pin a single item to a specific app. Quantities, refresh prices, and the cart persist on the phone. Logic lives in `src/lib/cart.ts` with tests in `cart.test.ts`. Delivery fees and minimum order values are not modelled yet; they need logged-in data (see `docs/LOGIN_PLAN.md`).

**What is fake:** every price, stock flag and ETA. The app says so in its footer ("Preview build · sample prices, not live"). Remove that line only when `IS_SAMPLE_DATA` in `src/adapters/index.ts` becomes `false`.

## Reality check (read before building adapters)

- **No platform has a public API.** "Just call an API" means calling the same internal JSON endpoints their websites and apps call. They are undocumented, change without notice, and may need headers, cookies or signed tokens.
- **Location is mandatory.** Every platform prices and stocks per dark store. Each adapter must set location (lat/lng cookie, header, or a "set location" call) before searching.
- **Google is not a data source.** Google does not index live, per-location quick-commerce prices. Do not build on it.
- **Zomato has no grocery.** Its grocery app is Blinkit. Swiggy's grocery is Instamart. The platform list is Blinkit, Zepto, Instamart, BigBasket, Flipkart Minutes, Amazon Now. JioMart is an optional 7th.
- **Terms of service.** Automated access likely breaks each platform's terms. Keep Sasta a personal tool on your own phone at human-like request rates. Do not publish to the Play Store or run it at scale.
- Some platforms may need login even to search, or block non-app user agents. Phase 1 exists to find this out.

## Architecture

```
┌──────────── Android app (Capacitor 8) ──────────────┐
│ UI: React 19 + Vite + Tailwind v4, shadcn-style     │
│   components, vaul bottom sheets (src/components)   │
│                                                     │
│ Search orchestrator (src/lib/search.ts)             │
│   ├─ all adapters in parallel, results stream in    │
│   ├─ 6 s timeout per adapter, one retry             │
│   ├─ 10 min cache per (platform, pincode, query)    │
│   └─ normalizer → grouper → ranker (normalize.ts)   │
│                                                     │
│ Adapters (src/adapters/<platform>.ts)               │
│   Strategy A: direct HTTP via CapacitorHttp         │
│               (native, no CORS, native cookies)     │
│   Strategy B: hidden WebView plugin (Kotlin), loads │
│               the real search page, returns JSON    │
│   Today: mock.ts for all six                        │
└─────────────────────────────────────────────────────┘
```

`CapacitorHttp` is already enabled in `capacitor.config.ts`, so `fetch()` inside the APK goes through native HTTP and is not subject to CORS. In a desktop browser (`npm run dev`) the same calls will fail on CORS. Test live adapters on a device or emulator.

## Repository map

| Path | What it is |
|---|---|
| `src/App.tsx` | Screen state: search, filters, sort, sheets, back button |
| `src/components/` | SearchHeader, PlatformProgress, BestValueCard, VariantChips, Segmented, ProductCard, CompareSheet, LocationSheet, Sheet, PackIcon |
| `src/lib/types.ts` | `Platform`, `Location`, `Offer`, `ProductGroup`, `Adapter`, `NeedsLoginError` |
| `src/lib/normalize.ts` | Title cleanup, size parsing, brand/flavor synonym maps, grouping, fuzzy fallback |
| `src/lib/normalize.test.ts` | Unit tests (Vitest). Add fixture-based tests here or next to adapters |
| `src/lib/cart.ts` | Cart: cheapest offer per item, totals, single-app options, refresh |
| `src/lib/search.ts` | Parallel orchestrator with timeout, retry, cache, per-platform status |
| `src/lib/platforms.ts` | Names, colors, web search URLs used by **Open** |
| `src/adapters/mock.ts` | Deterministic fake catalog with per-platform title spellings |
| `src/adapters/index.ts` | The adapter list the app uses, and `IS_SAMPLE_DATA` |
| `android/` | Capacitor Android project. Version and signing are in `android/app/build.gradle` |
| `.github/workflows/android.yml` | CI: tests, debug + release APK, GitHub Release on `v*` tags |
| `docs/platforms/` | Phase 1 spike notes, one file per platform |
| `docs/releases/` | Hand-written release notes, one file per tag |

## Data model

See `src/lib/types.ts`. The contract every adapter implements:

```ts
interface Adapter {
  platform: Platform
  setLocation(loc: Location): Promise<void>
  search(query: string, signal: AbortSignal): Promise<Offer[]>
}
```

Throw `NeedsLoginError` when a platform demands login. The UI then shows "Needs login · skipped" for that row only.

## Next steps, in order

Do these one at a time. Commit after each numbered step with a short message saying what works.

### Phase 1: platform spikes (most important, 1–2 days)

Do not write any live adapter before its spike note exists.

1. For each platform, open its mobile website in Chrome DevTools with device emulation. If the website is useless, inspect the Android app with HTTP Toolkit on an emulator.
2. Set a delivery location to a Bengaluru pin, for example 560010.
3. Search `lays`. Find the request that returns product JSON.
4. Record in `docs/platforms/<platform>.md` (template already there):
   - search endpoint, method, query params
   - how location is set: cookie name, header, or API call
   - required headers and tokens, and whether they expire
   - whether login is needed to search
   - rate limiting or bot protection seen
   - field paths for title, price, MRP, stock, ETA, image, product id
   - verdict: **A** (direct HTTP works), **B** (needs WebView), **X** (login or blocked, skip in v1)
5. Save one trimmed real response to `fixtures/<platform>/lays.json`. Strip cookies and personal data.
6. Fill the verdict table below and stop. Report the table to the user before Phase 2.

| Platform | Verdict | Notes |
|---|---|---|
| Blinkit | B | Live in the app via a hidden WebView on blinkit.com. Search works logged out; signed-in sessions are used automatically |
| Zepto | B | Search works by capturing the page's own signed request. Location setting still open |
| Instamart | ? | |
| BigBasket | ? | |
| Flipkart Minutes | ? | |
| Amazon Now | ? | |

### Phase 2: live adapters (2–4 days)

7. For each platform with verdict A, write `src/adapters/<platform>.ts` exporting `create<Platform>Adapter(): Adapter`. Use plain `fetch` (CapacitorHttp patches it natively in the APK).
8. Write a parser test per adapter: parse `fixtures/<platform>/lays.json` into `Offer[]` and assert titles, prices and stock. Keep parsing in a pure function so the test needs no network.
9. Swap the adapter into `src/adapters/index.ts`. Keep mocks for platforms not done yet. Set `IS_SAMPLE_DATA` to `false` only when no mock remains.
10. For verdict B, add a Capacitor plugin `HiddenWebView` in `android/app/src/main/java/app/sasta/android/`. It loads a URL with location cookies set, intercepts responses whose URL matches a pattern, and returns the body to JS. Use it only where A is impossible.
11. Map `deepLink` to the product page when the response has one, else keep the search URL from `platforms.ts`.
12. Done when a real `lays` search on a phone returns live offers from at least 4 platforms.

### Phase 3: matching on real data (1–2 days)

13. Run real titles from all fixtures through `groupOffers`. Extend the brand and flavor synonym maps in `normalize.ts` until `lays` gives at most 10 clean groups and no duplicate cards for the same pack.
14. Add those real titles to `normalize.test.ts` as regression cases.

### Phase 4: location and polish (1 day)

15. Send `lat`/`lng` from the location sheet to adapters. Today the GPS button stores coordinates but only the pincode and label are shown.
16. Add pull-to-refresh that calls `runSearch(..., { force: true })`.
17. Try an Android intent URL first for **Open**, then fall back to the web URL.
18. Show product images from `imageUrl` (the card already supports it).

### Next release: lists (v0.3.0)

Follow `docs/LISTS_PLAN.md`: multiple named lists of products, tick the ones you need, add them to the cart in one tap.

### After Phase 4: connect accounts

Follow `docs/LOGIN_PLAN.md`, then `docs/OFFERS_PLAN.md` for member prices, coupons and personalization. The login plan covers signing in to each platform inside the app, member prices, delivery fees in the cart total, and Swiggy Instamart's official MCP server.

### Phase 5: release

19. Bump `version` in `package.json`, write `docs/releases/vX.Y.Z.md`, commit, then `git tag vX.Y.Z && git push origin main vX.Y.Z`. CI does the rest.

## How to build and release

```bash
npm install
npm run dev            # browser preview with mock data, open on your phone via the LAN URL
npm test               # unit tests
npm run android:sync   # build web app and copy it into android/
npm run android:open   # open in Android Studio, or:
cd android && ./gradlew assembleRelease   # needs JDK 21 and Android SDK 36
```

**Releases.** Pushing a `v*` tag runs `.github/workflows/android.yml`. It fails if the tag does not match `package.json`. It publishes `Sasta-vX.Y.Z-android.apk`, a debug APK, and `SHA256SUMS.txt`, with notes from `docs/releases/vX.Y.Z.md`. Every push to `main` also uploads APKs as a workflow artifact.

**Signing.** With no repository secrets, release APKs are signed with `android/app/sasta-public-debug.keystore`. That key is committed on purpose so sideloaded updates install over each other. It is public, so it proves nothing about who built the APK. To switch to a private key, create one and add these repository secrets: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`, `ANDROID_STORE_PASSWORD`. Switching keys means uninstalling the old app once.

## Non-goals for v1

- Placing orders or paying inside Sasta. Sasta's cart is for comparing; you pay in the platform's app
- Logging in to any platform in v1. The plan for accounts is in `docs/LOGIN_PLAN.md` and starts after Phase 1
- Any backend server
- Price history and alerts (good v2)
- iOS
- Play Store listing

## Risks

| Risk | Mitigation |
|---|---|
| Endpoint changes break an adapter | Adapters are isolated, fixture tests catch parser drift, the UI shows "Failed" for that platform only |
| Bot protection or captcha | Strategy B (real WebView), low request rate, 10 min cache |
| Platform requires login | Verdict X, skip in v1, UI shows "Needs login · skipped" |
| Bad product matching | Synonym map, fuzzy threshold, unmatched offers still get their own card |
| Terms of service | Personal use only, never published |

## Rules for the coding agent

1. Start with Phase 1. Do not write live adapters before the spike notes exist.
2. The reference prototype (`sasta.html` artifact) is the design spec, and this app already matches it. Do not redesign.
3. Commit every time a feature or fix works, with a short message saying what now works. Never batch several features into one commit. Run `npm run typecheck && npm test` before each commit, and push to `main` after committing.
4. If a platform needs login or is blocked, record verdict X and move on. Do not fight it.
5. Report the Phase 1 verdict table to the user before starting Phase 2.
6. Keep `npm run typecheck` and `npm test` green. CI runs both.
7. Never commit cookies, tokens or personal data in fixtures.
