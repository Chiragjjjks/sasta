# Connecting your accounts — plan

**Decision.** Sasta signs you in on each platform's own login page, inside the app, and keeps the resulting session on your phone. Sasta never sees or stores your password or OTP. For Swiggy Instamart, use Swiggy's official MCP server first, because it is the only platform with a sanctioned way in. Paying still happens in the platform's own app.

## Status (2026-10-24)

| Piece | State |
|---|---|
| In-app sign-in screen and Keystore-encrypted token storage (`PlatformSessionPlugin.java`, `SignInActivity.java`) | Built. Compiles in CI. Not yet tried on a phone |
| Connected apps screen with Connect / Disconnect for all six | Built |
| Blinkit, Zepto, BigBasket, Flipkart, Amazon sign-in | Built. Marked "not verified yet" until each platform's session cookie names are recorded in `src/lib/accounts.ts` |
| Swiggy Instamart over the official MCP server | Built: discovery, app registration, PKCE sign-in, token exchange and refresh, `tools/list`. Checked live up to Swiggy's sign-in page. The OTP step needs a real phone |
| Using a connection for prices, fees or carts | Not started. Next step |

### Verified facts about Swiggy's MCP server

- `https://mcp.swiggy.com/instamart` answers 401 with `resource_metadata` pointing to `/.well-known/oauth-protected-resource`.
- Auth server `https://mcp.swiggy.com/auth`: authorization code + PKCE (S256), refresh tokens, public clients (`token_endpoint_auth_method: none`), dynamic registration at `/auth/register`.
- Registration only accepts redirect URIs on `http:`, `https:` or a fixed list of partner app schemes. Sasta uses `http://localhost/sasta/oauth/swiggy`, which the in-app browser captures and never loads.
- The authorize step rewrites `client_id` to `swiggy-mcp`. Sasta retries the token exchange with that id if its own is refused.

### How to test on a phone

1. Install the APK from the latest `main` build (GitHub Actions → Android APK → artifact `sasta-apk`).
2. Tap the person icon next to the location pill, then **Connect** on Instamart.
3. Sign in with your Swiggy number and OTP on Swiggy's page.
4. The row should turn **connected** and list the actions Swiggy offers. Those tool names are what the Instamart live adapter will call next.

## The idea in one example

You search `lays` and add it to the cart. Logged out, Sasta shows Zepto ₹15 vs Instamart ₹16, so Zepto wins. With Swiggy connected, Sasta asks Swiggy's official server for your Instamart price and fees as a Swiggy One member: ₹14 with free delivery. With Zepto connected, Sasta reads ₹15 plus a ₹25 small-cart fee. The cheapest cart flips to Instamart, and the cart total is what you would really pay. You then tap through and pay in Swiggy's app.

## Why log in at all

Logged out, Sasta can see list prices. Logged in, it can see what you would actually pay.

| Unlocks with login | Why it matters for "cheapest" |
|---|---|
| Member prices (Swiggy One, Zepto Pass, Flipkart Plus/VIP, Prime) | Can flip which app is cheapest |
| Delivery fee, handling fee, small-cart fee, free-delivery threshold | A ₹2 cheaper item can cost ₹30 more after fees |
| Your saved addresses | Exact dark store, so stock and price are right |
| Your coupons and offers | Real final price |
| The platform's real cart | "Send to Blinkit cart", then pay in Blinkit |

The cart already works without login. Login makes its totals true, and lets the cart pick the cheapest **after fees**.

## Platform by platform

| Platform | Account you use | How you sign in | How Sasta connects | Open question |
|---|---|---|---|---|
| Swiggy Instamart | Swiggy | Phone + OTP | **Official MCP server** `mcp.swiggy.com/instamart`. Fallback: in-app web login on swiggy.com | Can a non-ChatGPT/Claude client connect without Builders Club approval? Is checkout exposed yet? |
| Blinkit | Blinkit (separate from Zomato) | Phone + OTP | In-app web login on blinkit.com | Which cookies and headers carry the session |
| Zepto | Zepto | Phone + OTP | In-app web login on zeptonow.com | Whether web search is allowed logged in at human rates |
| BigBasket (bb now) | BigBasket | Phone/email + OTP | In-app web login on bigbasket.com | Whether bb now prices show on web |
| Flipkart Minutes | Flipkart | Phone + OTP | In-app web login on flipkart.com, **if** Minutes works on web | Minutes is a tab in the Flipkart app. Web support is unconfirmed |
| Amazon Now | Amazon.in | Password + OTP or 2-step | In-app web login on amazon.in, **if** Now works on web | Amazon Now lives in the Amazon app. Web support is unconfirmed |
| Zomato | — | — | **Nothing to connect.** Zomato has no grocery. Its grocery app is Blinkit, which has its own login | — |

There is no single login for all of them. Expect six separate OTP sign-ins, once each, then sessions last weeks to months.

## How it works on the phone

```
Accounts screen
  └─ "Connect Blinkit"
       └─ opens blinkit.com login in an in-app WebView (Sasta's own, not a browser tab)
            └─ you type your number and the OTP on Blinkit's own page
                 └─ Blinkit sets its session cookies in Android's CookieManager
                      └─ Sasta sees you are signed in (cookie present / URL changes) and closes the view

Search and cart
  └─ adapters call the platform with fetch()
       └─ CapacitorHttp uses the same CookieManager, so the session cookie rides along automatically
```

- **Where the session lives:** Android's CookieManager inside Sasta's private app storage. Other apps cannot read it. It never leaves the phone. There is no server.
- **What Sasta stores itself:** only `{ platform, status, connectedAt, name shown on the account }`. No tokens in Preferences, logs, fixtures or crash reports.
- **Disconnect:** clears that platform's cookies and WebView storage. One tap per platform, plus "Disconnect all".
- **Expiry:** an adapter that gets a 401 or a login redirect marks the account `expired`. The UI shows "Reconnect Zepto" on that row only. Search keeps working logged out for that platform.
- **Swiggy via MCP:** Sasta acts as an MCP client over HTTPS to `mcp.swiggy.com/instamart`. You sign in through Swiggy's own OTP screen in the in-app WebView. Sasta then calls Swiggy's search and cart tools instead of scraping. If Swiggy only allows approved clients, apply to Builders Club or fall back to the web-login path.

## Changes to the code

- `src/lib/types.ts`
  - `AccountStatus = 'disconnected' | 'connected' | 'expired' | 'unsupported'`
  - `Account { platform, status, connectedAt?, label? }`
  - `Offer.memberPrice?: number`
  - `PlatformQuote { deliveryFee, handlingFee, smallCartFee, freeDeliveryAbove?, minOrder? }`
  - `Adapter` gains optional `session` methods: `isSignedIn()`, `quote(lines)`, `addToCart(lines)`
- `src/lib/cart.ts`: add fees per platform to `summarize` and `singleAppOptions`, so "Cheapest mix" includes one delivery fee per app used. When every connected app returns a quote, remove the "fees not included" note.
- New native plugin `android/.../PlatformSessionPlugin.kt`:
  - `open(platform, loginUrl, successPattern)` shows a full-screen WebView and resolves when signed in
  - `isSignedIn(domain)`, `signOut(domain)`
  - Uses the shared `CookieManager`, so `CapacitorHttp` sees the same cookies
- New `src/components/AccountsSheet.tsx`: one row per platform with status, Connect / Reconnect / Disconnect.
- New `src/adapters/swiggy-mcp.ts`: a small MCP client (streamable HTTP + auth) used by the Instamart adapter.

## Steps, in order (one commit each)

1. **Logged-in spikes.** For each platform, sign in on the mobile website in Chrome DevTools. Record in `docs/platforms/<platform>.md` under a new "Logged in" heading: session cookie names, how long they last, the fee/quote endpoint, the add-to-cart endpoint, and whether the platform works on web at all. Do the same for Swiggy's MCP server with a desktop MCP client.
2. **Accounts screen** with fake connect and disconnect, persisted status, and a "Connected apps" pill in the header.
3. **PlatformSession plugin** with real WebView sign-in, sign-in detection, and sign-out. Test on Blinkit first.
4. **Session-aware adapters**: read member prices and stock with the session. Handle expiry.
5. **Fees in the cart**: per-app quotes feed the cart, so the cheapest mix is the cheapest after fees.
6. **Swiggy Instamart over MCP**: connect, search, quote. Keep the web path as fallback.
7. **Send to app cart** (behind a setting, off by default): fill the chosen platform's cart with your session, then open its app on the cart screen to pay.
8. **Polish**: biometric lock on the Accounts screen, "Disconnect all", and a clear log of what each platform was asked and when.

Order of platforms: Swiggy Instamart (official), Blinkit, Zepto, BigBasket, then Flipkart Minutes and Amazon Now once their web support is confirmed.

## What Sasta will not do

- Ask for, see or store your password or OTP in its own screens.
- Read your SMS to auto-fill OTPs.
- Place orders or take payment. You pay in the platform's app.
- Send cookies or tokens to any server, including our own. There is none.
- Search or refresh in the background. Every request comes from you tapping something.
- Drive the other apps with Android Accessibility automation. That is fragile and breaks Play policy. It is the only route for an app-only platform, so it stays a documented last resort, not a plan.

## Risks

| Risk | What could happen | Mitigation |
|---|---|---|
| Account action by a platform | Automated access on your **real** account could get it rate-limited or blocked | Human-triggered requests only, caching, low rates. Consider a secondary number for testing |
| Terms of service | Unofficial access likely breaks each platform's terms, except Swiggy's MCP | Personal use on your own phone, never published |
| Session expiry and captchas | Searches for that app fail until you reconnect | Per-platform "Reconnect", logged-out fallback |
| App-only services | Flipkart Minutes or Amazon Now may have no web surface | Mark unsupported, keep Open-in-app links |
| Swiggy MCP access limits | Custom clients may need Builders Club approval, and grocery checkout was not exposed at launch | Use it for search and cart only. Fall back to web login |

## Decisions needed from you

1. Use your main accounts, or a secondary phone number while this is being tested?
2. Do you want "Send to app cart" at all, given it is the riskiest step?
3. Should Sasta apply to Swiggy Builders Club for proper MCP access?

## Sources

- [Swiggy MCP endpoints and launch test (MediaNama, Jan 2026)](https://www.medianama.com/2026/01/223-ordering-chatgpt-swiggy-services-working/)
- [Swiggy launches MCP for ChatGPT and other AI tools (exchange4media)](https://www.exchange4media.com/industry-briefing-news/swiggy-launches-model-context-protocol-to-enable-orders-via-chatgpt-and-other-ai-tools-151410.html)
- [Swiggy Builders Club opens MCP servers to developers (Stellagent)](https://stellagent.ai/insights/swiggy-builders-club-ai-commerce-stack)
- [How Swiggy is using AI agents beyond its app (Inc42)](https://inc42.com/buzz/how-swiggy-is-using-ai-agents-to-take-commerce-beyond-its-app/)
- [Flipkart plans a standalone Flipkart Minutes app (Apparel Resources)](https://apparelresources.com/business-news/retail/flipkart-plans-standalone-app-for-flipkart-minutes-amid-quick-commerce-expansion/)
- [Amazon Now rollout in Bengaluru (Social Samosa)](https://www.socialsamosa.com/industry-updates/amazon-rolls-out-amazon-now-10-minute-deliveries-bengaluru-8718241)
