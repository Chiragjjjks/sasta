# Sasta Food: UI spec

Mockup (light, sample data): `/tmp/sasta-food/mock.html`. Reuses `theme.ts`, fonts and kit; only additions are listed. Names follow `core/food` and `state/food.tsx`.

## 1. Navigation

- New tab **Food** (`Utensils`), second: Grocery, Food, Lists, Cart, Account.
- Rename **Search** to **Grocery** (`ShoppingBasket`): with two search surfaces, "Search" no longer says what is searched. A tab beats a switch inside Search: results, filters and carts differ.
- Routes: `(tabs)/food.tsx` (home and results, same two states as `index.tsx`); `restaurant/[key].tsx` (stack push, title is the restaurant). Lists and Cart stay grocery.
- The food cart is the store's single `order`. While it exists, Cart shows a top `Card`: "Food order · Meghana Foods · 2 dishes".
- Extract logo, location pill and search bar of `index.tsx` into `ui/SearchHeader.tsx`.

## 2. New pieces

- `VegMark({veg?, size=14})`: square, 1.5 px border, `surface` fill (readable on an active ink Chip). Veg: `good` border and dot. Non-veg: `bad` border and up-triangle (tokens, not the brown in the current file). `Chip` gets `leading?`.
- `FoodSlots` (section 4), `DishCard`, `RestaurantCard`, `MenuRow`.
- `OrderBar`: ink pill above the tab bar while `order` exists: app mark, "Meghana Foods · 2 dishes · ₹758".
- Widen `PlatformMark` and `PlanHero` to `Platform | FoodPlatform`.

## 3. App marks

| App | Text | bg | fg | Contrast |
|---|---|---|---|---|
| Zomato | z | `#e23744` | `#ffffff` | 4.32:1 |
| Swiggy | S | `#fc8019` | `#14152a` | 7.0:1 |
| Ownly | O | `#0f766e` teal | `#ffffff` | 5.5:1 |
| Swish | sw | `#d6246e` pink | `#ffffff` | 4.8:1 |

- Zomato keeps the briefed red, just under AA for a small glyph; `#d92f3d` gives 4.75:1.
- Swiggy's S is dark ink (white on that orange is 2.6:1), unlike Instamart's white I.
- On dark `#171829`: Ownly 3.2, Swish 3.6 (3:1 needed).
- Distinct: Ownly is ΔE 39 from Amazon navy; Swish is ΔE 31 from Zomato. The `platforms.ts` placeholders fail: Ownly green is 4.3:1, Swish black ΔE 18 from Amazon.

## 4. Ranked app rows (`FoodSlots`)

Same rhythm as `OfferSlots` (rank, mark 22, name, `+₹x`, price, `goodBg` cheapest row), in two lines:

- Line 1: app name, `★ 4.3` (that app's rating), `Cheapest` badge on rank 1 (beside the name, so line 2 keeps width).
- Line 2: `32 min · Free delivery`, `32 min · ₹35 fee`, or `28 min · fee not shown`.
- Offer: third line in `accentText`, restaurant screen only. Shown, never subtracted.
- Ties go to the faster app. Rows that cannot be ordered get rank "–", muted ink and a reason: `Closed now`, `Sold out`, `Doesn't list Mutton Dum Biryani`. Apps that answered without the dish: caption "Not on Zomato".

## 5. Screens

### (a) Food home

1. `SearchHeader`: "Dish or restaurant", button "Compare", recents (starters if none: biryani, butter chicken, dosa, pizza).
2. `Eyebrow live` "4 apps · delivering to 560010", `Headline` "Same biryani." / "Four prices.", sub "Dish or restaurant, checked on every app. Cheapest first."
3. Static example `Card` ("Example · Meghana Foods", Badge "Save ₹60", three ranked rows) teaches the idea without reading.
4. `Eyebrow` "Apps Sasta checks": four tiles (mark, name, `Ready` / `Sign in` / `Not live yet` / `Limited` for Swish), tap opens Account. Caption: "Sasta never orders or pays".

### (b) Results

Order: header, status, problems, hero, sort, filters, list.

- **Status row** as grocery: "Searching 4 apps…", then "14 dishes from 2 apps · 3.4 s", four marks.
- **Searching:** cards fill in per app, ending "Checking Zomato, Swish…". No hero, Save badges, sort or filters; order stays frozen until the last app answers.
- **Hero** (dark, taps to the restaurant): mark 44, "Biggest gap right now", dish and restaurant, accent price, "on Ownly · ₹60 less than Swiggy". Only when saving is at least ₹10 and it is not the first card.
- **Sort** (`Segmented`): **Cheapest** (default: name match, price, ETA), **Biggest gap** (`saving`), **Fastest**. Rows inside a card stay price-ranked.
- **Filters** (`Chip`): All, Veg, Non-veg, On 2+ apps. Unknown veg shows only under All.
- **Restaurant match:** if the query names one, up to two `RestaurantCard`s lead: name, app marks, "Cheapest on Ownly for 7 of 9 shared dishes", "Compare menu".
- **`DishCard`:** head `VegMark`, dish, Badge `Save ₹60` (good) or `Only on Swiggy` (muted). Sub-line "Serves 2 · Meghana Foods · ★ 4.4" (area only if several outlets; star is the cheapest app's; "Bestseller" in `accentText`). Then `FoodSlots`. Footer: "Whole menu ›" and the one primary pill `Add · Ownly`.
- `Add` sets `order` and shows `OrderBar`. From another restaurant, confirm: "Start a new order?" / "Your Meghana Foods order (2 dishes) will be cleared." [Keep] [Start new].
- Save = priciest minus cheapest orderable offer, same dish and portion.

| Status | Copy (problems card, action on the same row) | Action |
|---|---|---|
| needs_login | "Zomato: needs you to sign in." | Connect Zomato |
| needs_location | "Swiggy: needs your exact location." | Set my location |
| blocked | "Zomato: asked for a check." | Open Zomato |
| timeout, failed | "Zomato: took too long." / "Ownly: couldn't search (reason)." | Retry |
| unavailable | "Swish: doesn't deliver to 560010 yet." / "Ownly: not live in Sasta yet." | none |

Closed outlets and sold-out dishes stay visible, greyed, unranked. Empty: "No dishes found" / "Try a dish like biryani."

### (c) Restaurant

Header: back, name, caption "Rajajinagar · on 3 of 4 apps".

1. **`PlanHero`**, no `groups`: "Cheapest for your order", total, "on Ownly · 2 dishes", "₹125 less than Zomato" (priciest ranked app). Empty: "Pick dishes to compare".
2. **App rows** (`FoodSlots` in a `Card`; tap picks an app, badge "Your pick" if not cheapest). Total = items + known fee; unknown fee counts 0 and prints `₹668+`. Apps missing a picked dish sit below: "Doesn't list …".
3. **Menu:** eyebrow "Menu · same dish on every app", Chips All, Veg, Non-veg. While `loadMenu` runs, unread apps show a spinner cell; failures say "Couldn't read Zomato's menu" with Retry.
4. **`MenuRow`** (one `Card`): line 1 `VegMark`, dish, sub "Serves 2 · Bestseller", `Stepper` (small "Add" pill at 0). Line 2: a cell per delivering app, fixed order Zomato, Swiggy, Ownly, Swish: mark 14, price, muted `+50` over cheapest; cheapest cell `goodBg`/`good`; `Not listed` or `Sold out` otherwise. Order: search matches, bestsellers, biggest gap.
5. **Sticky bar:** caption "Sasta never orders. Add these 2 dishes in Ownly. Taxes and offers apply there." and primary `Button` "Open in Ownly · ₹758" (mark, arrow), following the picked row. Empty: disabled "Pick a dish to compare". Tap calls `openApp(deepLink)` and toasts "Opening Ownly. Add: 1 × Chicken Dum Biryani, 1 × Mutton Dum Biryani".

One app only: one row, no saving line, hero label "Your order".

### (d) Account

Below grocery: `T h2` "Food apps" + Badge `Beta`, sub "Same sign-in as grocery. Swiggy food and Instamart share one Swiggy login." A `Card` with the saved number and "Connect 4 food apps", then four rows like the grocery rows (mark, "Zomato account · connected", "Search: Ready / Sign in to search", Connect, Disconnect, Test search). No Delivery area button; caption "Searches at Rajajinagar 560010". Swish adds "Delivers in parts of Bengaluru."

## 6. Rules

- The "cheaper elsewhere" story appears four times, beside the cheaper app's mark: `+₹60` on pricier rows, `Save ₹60`, the hero, the green matrix cell.
- Every price sits beside its app mark. One primary action per screen: `Add · Ownly`, `Open in Ownly`, `Connect`.
- Prices are menu prices; fees only when the app states them; offers never subtracted; never claim a final bill.
- No new colours except the four marks.
- **Ties (added after live data, 2026-10-29).** Zomato and Swiggy usually charge a restaurant's same menu price. Equal prices are never called "Cheapest" or painted green: the card shows a muted `Same price` badge, rows tie-break on ETA with a `Faster` badge, offers show on every row, results say "Same menu price on Zomato and Swiggy for N dishes. Fees, offers and delivery time differ.", and the restaurant verdict and order total say "Same … on every app".
