# Offers and your account — plan

**Decision.** Once an app is connected, Sasta uses that account's own prices, fees, coupons, addresses and order history. Comparisons then show what *you* would pay, and Sasta can build lists from what you already buy. Everything stays on the phone.

Status: plan. Built so far: sign-in (all six), Swiggy over MCP, live Blinkit search and fees, Blinkit cart hand-off. See `docs/LOGIN_PLAN.md`.

## What each connected account gives us

| App | Data seen in the spikes | What Sasta does with it |
|---|---|---|
| Blinkit | Search and `/v5/carts` send `access_token` from blinkit.com's storage when signed in. The bill has `promo_codes`, `promo_data`, `free_delivery_offer`, `is_free_delivery_offer_applied`, `membership_config`, `wallet_details`, `address_id`. Orders at `/v1/layout/order_history` | Member and offer prices in search. Real fees per account. Coupons applied in the bill. Saved addresses. "Your usual" from past orders |
| Zepto | Every search result has `zeptoPassPrice` next to `sellingPrice` (0 when none) | Show the Zepto Pass price when your account has Pass, the normal price otherwise |
| Instamart (Swiggy MCP) | Tools are listed after connecting. Swiggy says agents can search, update the cart, apply offers and select an address | Use Swiggy's own offer and cart tools. No scraping |
| BigBasket, Flipkart, Amazon | Not spiked yet | Same pattern once their spikes are done |

## Features, in order

1. **Your price everywhere.** When an app is connected, its live adapter sends the signed-in session (already true for Blinkit) and reads the member price (Zepto Pass, Swiggy One, Prime). Cards show a small "Your price" tag when it differs from the public price.
2. **Real fees per account.** Fee rules come from your own bill, so free-delivery memberships make delivery ₹0. The cheapest-after-fees cart then reflects your memberships.
3. **Best coupon per app.** Read the coupons the bill offers and pick the one that lowers the payable amount most. Show "₹40 off with SAVE40 on Blinkit" in the cart, and compare carts after coupons.
4. **Pay with offers.** "Open in Blinkit with these items" already lands you on Blinkit checkout with your account, where bank and UPI offers apply. Do the same for Instamart through Swiggy's tools, and for Zepto through its web cart once spiked.
5. **Your usual (personalization).** Read recent orders from each connected app and suggest a list: "Your usual from Blinkit: 12 products". One tap turns it into a Sasta list. Re-order suggestions appear on the home screen ("Running low? You buy Amul butter every 9 days").
6. **Right address.** Use the saved delivery address from the connected account instead of a typed pincode, so stock and prices match the store that will deliver.
7. **Your app profile.** A small summary from your own data, on the phone only: which app is cheapest for you most often, average savings per order, memberships detected. This helps decide whether a membership pays for itself.

## Rules

- No background requests. Personal data is read only when you open the screen that uses it.
- No order is ever placed by Sasta. It fills carts and opens the app or site; you pay there.
- Order history and profile data stay in app storage and are deleted on Disconnect.
- Each feature works per app. A disconnected app falls back to public prices.

## Steps (one commit each)

1. Blinkit signed-in check: confirm search returns the same or lower prices with `access_token`, and record which fields change.
2. "Your price" tag on cards and in the compare sheet. Zepto Pass price once the Zepto adapter exists.
3. Coupons in the Blinkit bill: parse, pick the best, show savings.
4. Your usual from Blinkit order history, turned into a list.
5. Saved addresses from Blinkit and Swiggy.
6. Swiggy Instamart: map MCP tools to search, cart, offers and address once tool names are known from a real connection.
7. App profile screen.

## Needs from you

- One real sign-in on the phone for Blinkit and for Swiggy (Connected apps). That confirms sessions work in the app and gives Swiggy's tool names.
- Which memberships you have (Swiggy One, Zepto Pass, Prime, Flipkart VIP). That tells us which prices to trust first.
