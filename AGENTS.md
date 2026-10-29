# Sasta: context for coding agents

Read this first. Claude Code (through `CLAUDE.md`) and Codex both load it. It is the authority over older docs. Keep **Current state** and **Next** up to date whenever a feature or release lands.

## What we are building

Sasta is a personal Android app (sideloaded APK, no backend, no Play Store) that answers one question: **where is this cheapest to buy right now, delivered to me?**

- **Search.** Type one product (e.g. `lays`). Sasta searches Blinkit, Zepto, Swiggy Instamart, BigBasket (bb now), Flipkart Minutes and Amazon Now in parallel, at the user's delivery location. It groups the results by brand, then variant, then pack size, and shows the cheapest in-stock offer first. Every platform's price, MRP, ETA and stock sit one tap away.
- **Lists.** Reusable shopping lists. Opening a list re-checks every item on every app. Each item shows a ranked slot per app ("1. Blinkit ₹20 · 2. Zepto ₹22"), and the list shows the cheapest plan grouped by app. The user can pin an item to an app. The UI must make sense at a glance: the user sees it and understands it without reading.
- **Cart.** Compares totals, then hands off to the real app to pay. **Sasta never places orders or pays.**
- **Accounts.** Optional sign-in per app, kept only on the phone. It gives member prices and the right store. Instamart and Zepto use their official MCP servers; the other apps use their own website session inside a hidden WebView.
- **Actions.** Every capability is a named action with a lifecycle (`session.*`, `location.sync`, `catalog.search`, `price.check`, `product.detail`, `cart.quote`, `cart.handoff`, `orders.history`, `offers.list`, and for food `food.search`, `food.menu`, `food.handoff`). See `docs/ACTIONS.md`. The same contract drives the phone and the desktop Playwright toolkit.

Owner: Chirag (GitHub `Chiragjjjks`), Bengaluru. The test location is Rajajinagar 560010. The project is personal use only, at human-like request rates. Not affiliated with any platform.

## How the owner works

- They hand work back and forth between Claude Code and Codex, usually through T3 Code. Every doc must stand alone so the next agent can continue cold.
- They want visible progress: small commits, real verification (screenshots, live checks), plain-language reports.
- They care a lot about UI clarity ("instinct-to-UI"). Before declaring UI work done, check it visually. The browser preview with sample data is fine for that.
- When a delegated agent asks a question meant for the owner (for example a login prompt), tell the owner. Never answer it on their behalf.

## Current state: v0.8.0 published (tag on fea695f)

| Platform | How Sasta searches | Status |
|---|---|---|
| Blinkit | `POST /v1/layout/search` run inside a hidden WebView on blinkit.com | Live; works logged out |
| Instamart | Official Swiggy MCP `https://mcp.swiggy.com/im`, `search_products` with a saved Swiggy `addressId` | Live sign-in and search verified 2026-10-28 |
| Zepto | Official Zepto MCP `https://mcp.zepto.co.in/mcp`, read-only scopes; storefront WebView fallback | Live sign-in and search verified 2026-10-28 |
| BigBasket | `/listing-svc/v2/products` inside the page; DOM card reader fallback | Live in Chrome 2026-10-28 |
| Flipkart Minutes | Hyperlocal page API inside the page | **Unverified.** Needs an exact Flipkart address; no positive price list seen yet |
| Amazon Now | Guarded Now storefront discovery | **Unverified.** Only works if the Amazon session offers a Now store |

Releases: v0.6.0 is published (live Instamart and Zepto). v0.7.0 is published (2026-10-29). It covers lists by app and coloured platform marks, plus the UI rework from 2026-10-28:
- light and dark with an Appearance switch;
- ranked app rows (`ui/OfferSlots.tsx`) in results, compare, lists and cart;
- a shared plan card (`ui/PlanHero.tsx`);
- a cart that re-checks prices when they are over 5 minutes old (`refreshPrices`, `cartChanges` in the store).

Open work outside main:
- **Site index toolkit (Codex).** Branch `t3/research-site-index-toolkit`, worktree `~/.t3/worktrees/sasta/t3-5eeaf107`, folder `automation/`. It is Playwright + TypeScript (`npm run login|crawl|action|verify-readers|inspect`) with a persistent profile at `~/.sasta/automation-profile`. It is not merged and the crawl is unfinished: no logins persisted yet, and each login needs the owner in that window.

v0.8.0 published (2026-10-29): **one-tap connect with OTP auto-fill**.
- Account takes one mobile number (encrypted on the phone) and connects every app at once.
- `AutoSignInHost` (`native/SessionHosts.tsx`) runs each app's own sign-in page in parallel. `autofillStep` (`core/adapters/autofill.ts`) types the number once and requests the OTP.
- `OtpListenerService` (Kotlin, user-granted Notification access, armed only during sign-in) passes each code to `routeOtp` (`core/otp.ts`), which types it into the app the message names.
- Not yet verified on a phone with real OTPs. Amazon may ask for a password; that app then shows "Needs you".

Since v0.8.0 (on `main`, unreleased):
- **Landing site** in `site/` (plain HTML/CSS/JS, no build step; preview with `npx serve site`). It is modelled on the Downmix Renderer page, with editorial touches from Kenpath's Svara page, and includes an interactive sample-price demo. It is live at https://chiragjjjks.github.io/sasta/. `.github/workflows/site.yml` publishes `site/` to the `gh-pages` branch on every change, and Pages serves that branch, the same way Downmix Renderer is hosted. Download buttons link straight to the APK, and `main.js` switches them to the newest release at load time. The site also announces food delivery as **coming soon** (Zomato, Swiggy food, Ownly by Rapido, Swish). None of these are in the app yet.
- **App UI polish:** JetBrains Mono is now loaded (`fonts.mono`, `fonts.monoBold`), and the kit has `Eyebrow` (mono section label, optionally numbered or live), `Headline` (two-line display heading, second line muted) and `LiveDot`. They are used on the Search home, Lists, Cart, ranked rows and the plan card.

- **Food section (branch `feat/food-compare`, not merged).** A new **Food** tab (the Search tab is now **Grocery**) compares one dish across Zomato, Swiggy, Ownly and Swish. Design spec: `docs/FOOD_UI.md`.
  - Core in `src/core/food/`: `types.ts` (`FoodOutlet`, `Dish`, `DishGroup`, `RestaurantMatch`, `FoodSource`), `match.ts` (spellings, portions, veg, branch names; `groupDishes` matches the same dish at the same restaurant across apps; `quoteOrder` prices one order on every app), `adapters/` (`swiggy.ts`, `zomato.ts`, `mock.ts`, the `LIVE` map in `index.ts`). Store: `src/state/food.tsx` (`useFood`). `runSources` in `core/search.ts` is the shared parallel runner for groceries and food.
  - Screens: `(tabs)/food.tsx` (results, gap hero, sort, veg filters, order bar) and `restaurant/[key].tsx` (order priced per app, menu with each app's price side by side, "Open in <app>"). UI pieces: `FoodSlots`, `DishCard`, `OrderBar`, `VegMark`, `SearchHeader` (shared with Grocery), `confirm.ts`.
  - Live: **Swiggy** searches `/dapi/restaurants/search/v3` inside a hidden WebView, logged out at exact coordinates (verified in desktop Chrome: 289 Rajajinagar dishes). Its full menu (`/dapi/menu/pl`) returned 403, so the restaurant screen falls back to the dishes from search. **Zomato** sets its delivery area inside the page by writing the site's own `ltv`/`lty`/`locus` cookies from `/webroutes/location/get`, then reads the dish page (or autosuggest for restaurant names) and up to four restaurant menus in sequence (≤ 7 requests per search). Verified in desktop Chrome 2026-10-29: "biryani" gave 415 dishes from 4 Rajajinagar outlets, "meghana" 89. See `docs/platforms/zomato.md`. **Ownly** and **Swish** are app-only (no website or API), so the app shows them as "App only" with an Open link. Nothing is verified on a phone yet.
  - Live finding (2026-10-29, both adapters' real scripts in desktop Chrome, "biryani" at Rajajinagar): Meghana Foods, RNR Biryani, Nandhana Palace and Hotel Aditya matched across Zomato and Swiggy, and all 47 shared dishes had the **same menu price**. The UI therefore treats ties as ties (`Same price`, `Faster`, offers on every row). The useful differences are fees, offers and ETA, and Swiggy's delivery fee is not in its search response.

## Next, in order

1. Finish and merge the `automation/` site index, then use it to fix Flipkart Minutes and Amazon Now.
2. Wishlist and list follow-ups the owner asked for after the list redesign.
3. `cart.quote` for Instamart and Zepto over MCP. This needs cart write scopes, so put it behind an explicit setting.
4. `orders.history` and `offers.list` per `docs/ACTIONS.md`.
5. Food: verify Swiggy and Zomato inside the Android WebView, then merge `feat/food-compare`. After that, Swiggy Food's official MCP (`https://mcp.swiggy.com/food`, needs the owner's sign-in) for signed-in prices and menus, and Zomato's MCP only if its consent page accepts Sasta's localhost redirect. Ownly and Swish stay app-only until they publish a web or API route.

## Repository map

The app is in **`mobile/`** (Expo SDK 58, React Native 0.88, expo-router, Hermes). Root `src/`, `android/`, `index.html` and `vite.config.ts` are the **retired Capacitor app**, kept only for reference. Do not change them. The Architecture and Repository map sections of `PLAN.md` describe that old app.

| Path (under `mobile/`) | What it is |
|---|---|
| `src/app/` | Routes only (expo-router). `(tabs)/index.tsx` search, `lists.tsx`, `cart.tsx`, `account.tsx`; `list/[id].tsx` list detail; `product/[key].tsx` compare; `save/[key].tsx` save to list; `location.tsx`. Don't export helpers from route files |
| `src/state/store.tsx` | The one app store: search, lists (`refreshList`, `pinListItem`), cart, accounts, location, Instamart address |
| `src/core/types.ts` | `Platform`, `Location`, `Offer`, `ProductGroup`, `Adapter`, and typed errors (`NeedsLoginError`, `NeedsLocationError`, `ProviderBlockedError`, `ProviderUnavailableError`, `NotLiveError`) that map to per-platform UI states |
| `src/core/search.ts` | Parallel orchestrator: timeout, retry, cache, per-platform status |
| `src/core/normalize.ts` | Title cleanup, size parsing, brand/flavour synonyms, grouping |
| `src/core/lists.ts` | Lists: `rankedOffers`, `chosenListOffer`, `listPlan`, `singleAppTotals`, `pinItem` |
| `src/core/cart.ts` | Cart totals, single-app options, `refreshCart` |
| `src/core/platforms.ts` | Names, colours, `mark` monograms, search URLs |
| `src/core/adapters/<platform>.ts` | One adapter per platform. Pure `parse…` functions are tested against `fixtures/` |
| `src/core/adapters/readers.generated.json` | In-page reader scripts compiled to text (Hermes has no `Function#toString`). **Regenerate with `npm run generate:readers` after editing any `read…Page` function.** `pretest` fails if it is stale |
| `src/core/mcp.ts`, `mcp-connect.ts`, `oauth.ts` | Streamable-HTTP MCP client, and OAuth 2.1 + PKCE with dynamic client registration for Swiggy and Zepto (`MCP_PROVIDERS`) |
| `src/core/accounts.ts` | Per-platform sign-in method (`mcp` or `web`), web fallback, signed-in checks |
| `src/core/session-turn.ts` | Serialises work per origin so an account check never interrupts a search |
| `src/native/SessionHosts.tsx` | One invisible WebView per shopping site (`HiddenPages`) plus the sign-in host |
| `modules/sasta-native/` | Local Expo module (Kotlin): shares WebView cookies, migrates old preferences, encrypted storage |
| `plugins/withSastaAndroid.js` | Config plugin for Android settings (versionCode default, etc.) |
| `src/core/food/`, `src/state/food.tsx` | The Food section: dish matching, food sources and its own store (see Current state) |
| `src/ui/` | `kit.tsx` (Segmented, buttons, `Eyebrow`, `Headline`, `LiveDot`…), `PlatformMark.tsx` (coloured app monogram; use it wherever an app is named), `OfferSlots.tsx` (ranked app rows; use them wherever prices are compared), `PlanHero.tsx` (total split by app with alternative pills), `ProductCard`, `PackIcon`, `theme.ts` (light/dark tokens and the saved Appearance choice) |
| `fixtures/<platform>/` | Trimmed real responses for parser tests |
| `scripts/android-smoke.py` | Emulator smoke test run by CI |

Outside `mobile/`: `site/` is the static landing page (see Current state).

Other docs: `docs/ACTIONS.md` (actions contract), `docs/platforms/*.md` (per-platform endpoints, auth, gotchas; **read before touching an adapter**), `docs/releases/vX.Y.Z.md`, `postman/mocks/` (Instamart, Zepto and Flipkart mocks), `PLAN.md` (original phased plan and reality check).

## How live data works

Plain HTTP from the phone is blocked: Blinkit checks the Cloudflare TLS fingerprint and Zepto signs its requests. So:

- **Web platforms** run a script inside a hidden WebView loaded on the real site. Requests then look like real Chrome and carry the signed-in cookies. Location is set the way the site sets it (for example BigBasket's `_bb_addressinfo` cookie).
- **Instamart and Zepto** use their official MCP servers. Gotchas:
  - Swiggy signed-in search requires an `addressId` from `get_addresses` (lat/lng is refused). Its replies have no success/data envelope.
  - Zepto prices are in paise. Zepto location is linked per MCP session through `get_location_serviceability`.
- Before scraping a new platform, check whether it has an official MCP or API.
- Every platform prices and stocks per dark store, so location is mandatory before any search.

## Commands

```bash
cd mobile
npm ci
npm run lint && npm run typecheck && npm test   # run all three before every commit; CI runs the same
npx expo install --check                        # CI fails if Expo package versions drift; fix with --fix
npm run export:web                              # browser preview with labelled sample prices
npm start                                       # Expo dev server (web preview: press w)
SASTA_LIVE_TOKENS=<dir> npm test -- live-mcp    # opt-in live MCP check; token files never committed
```

Sign-in and live search only work in a native Android build, not Expo Go or the web preview.

## Rules

1. **Never automate** placing orders, payment, checkout, or creating or deleting addresses. Ask for the narrowest OAuth scopes (read-only unless a feature needs more).
2. **Never commit** cookies, tokens, OAuth secrets or personal data, in fixtures or anywhere else. Trim and redact fixtures.
3. **Commit after every working feature or fix** with a short message saying what now works. Never batch. Lint, typecheck and tests must be green first. Commits end with the attribution line your harness specifies.
4. **Git.** Push with plain `git push` (remote `github-personal:Chiragjjjks/sasta`). The `gh` CLI is logged in to a work account with read-only access, so use it only to read runs and releases, never to write. Repo secrets are set by the owner.
5. **Releases need the owner's explicit go-ahead every time.** One approval does not carry over to the next version.
6. Keep the existing design language: Bricolage Grotesque, Figtree and JetBrains Mono fonts, `PlatformMark` colours, dark hero cards. Redesign only when the owner asks. Show which app each price comes from wherever prices appear.
7. If a platform is blocked or needs something you can't get, record it in `docs/platforms/<platform>.md` and move on. Don't fight bot protection.
8. Use `npx expo install <pkg>` to add packages. Never hand-edit `mobile/android/`: it is generated by `expo prebuild` and not tracked.

## Release

1. Set the same version in root and `mobile/package.json` and the lockfiles, and in `mobile/app.json` (`version`, plus `android.versionCode`: 0.6.0 was 600 and 0.7.0 is 700, and it must always go up). `scripts/check-version.cjs` fails CI if the versions disagree or the tag doesn't match.
2. Write `docs/releases/vX.Y.Z.md` and update the status tables in `README.md`, `PLAN.md` and this file.
3. Push to `main` and wait for the **Android APK** workflow (lint, types, tests, signed APK, emulator smoke test) to pass for that exact commit.
4. Only after the owner approves: `git tag vX.Y.Z <sha> && git push origin vX.Y.Z`. The tag workflow publishes the same tested APK and `SHA256SUMS.txt`.
5. Check the result with `gh release view vX.Y.Z -R Chiragjjjks/sasta`.

## Known traps

- Running `npm start` can rewrite `mobile/tsconfig.json` and drop `expo-env.d.ts` from `include`. Revert it with `git checkout mobile/tsconfig.json` before committing.
- With `CI=1` the Expo dev server never reloads, so screenshots show stale UI.
- In vitest jsdom tests, `import.meta.url` is not a file URL. Load fixtures with `readFileSync('fixtures/...')` relative to `mobile/`.
- `singleAppTotals` sorts by items covered, then total. A tie keeps platform order.
- The Amazon `color` stays `#ff9900` (navy disappears in dark mode). Its `mark` carries the dark tile.
- Theme text colours: use `ink` or `muted` for text. `faint` is only for icons, placeholders and disabled states, and `accentText` is for orange words. Both themes pass WCAG AA; check new colours in both.
- Screens that check prices as they open rely on the store's refs updating in `useLayoutEffect`. Child effects run before the parent's passive effects, so a passive effect would hand the check an empty cart.
