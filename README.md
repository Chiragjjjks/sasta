# Sasta

### 🌐 [chiragjjjks.github.io/sasta](https://chiragjjjks.github.io/sasta/)

**[Visit the website](https://chiragjjjks.github.io/sasta/)** · **[Download the APK for your phone](https://github.com/Chiragjjjks/sasta/releases/latest)**

An Android app for comparing quick-commerce prices and keeping reusable shopping lists. Built with React Native and Expo, with native inputs, navigation, scrolling and Android sharing.

**Live search:** Blinkit (hidden WebView on blinkit.com), Instamart and Zepto (their official MCP servers), BigBasket (its own listing API, inside its page), Flipkart Minutes (Hyperlocal page API, needs an exact Flipkart address) and Amazon Now (only when your Amazon web session offers a Now store). Instamart searches one of your saved Swiggy addresses, chosen in **Account → Delivery address**. Zepto uses Sasta's exact location. **Test search** in Account reports product counts or the exact reason a search could not complete, separately from login. Confirm prices, stock, offers and final fees in the shopping app before payment.

How searches, prices and other actions are triggered and what metadata they return: `docs/ACTIONS.md`. Per-platform findings: `docs/platforms/`.

## Install

Download `Sasta-vX.Y.Z-android.apk` from [Releases](https://github.com/Chiragjjjks/sasta/releases/latest) and open it on your Android phone (Android 7 or newer; ARM64 or x86_64). Install over the previous release to keep your lists, cart and location. The rebuild migrates data from v0.3.2 on first launch.

**Several products at once (v0.9.0):** type `lays, maggi, amul butter` in Grocery to see the best price for each product, then every product's prices in its own section.

**Food (v0.9.0):** the Food tab compares one dish or restaurant across Zomato and Swiggy at your location, matching the same dish at the same restaurant on both apps. Ownly and Swish are app-only, so Sasta links to them. Food prices were checked in desktop Chrome; phone verification is pending.

If Google Play Protect blocks v0.8.0, see [Android installation](docs/ANDROID-INSTALL.md). v0.9.0 removes the notification-reading service used by that release; sign-in now fills your number and lets you enter each OTP on the provider's own page.

## Website

The landing page at https://chiragjjjks.github.io/sasta/ is built from `site/` (plain HTML, CSS and JS). `.github/workflows/site.yml` publishes it to the `gh-pages` branch whenever `site/` changes on `main`, and GitHub Pages serves that branch.

## Develop

The current app lives in `mobile/`. Root `src/` and `android/` retain the previous Capacitor implementation for reference.

```bash
cd mobile
npm ci
npm start              # Expo development server
npm run android        # generate and run a native development build
npm run lint
npm run typecheck
npm test
npm run export:web     # browser preview with labelled sample prices
```

Choose the same delivery area in Sasta and every shopping service using **Account → Delivery area**. Each service keeps its own account session on the phone.

Sign-in and live search need a native Android build, not Expo Go or the browser preview. The local Android module shares WebView cookies with sign-in, migrates older preferences, and keeps OAuth secrets in encrypted on-device storage.

## Release

Set the same version in root and mobile `package.json` / lockfiles and `mobile/app.json`, then add `docs/releases/vX.Y.Z.md`. Push to `main` first: GitHub Actions checks lint, types and regressions, builds a signed APK, and runs it on an Android emulator. The emulator checks an in-place update from v0.3.2, migrated data, persistence, native inputs, navigation, sign-in cancellation and offline recovery. Screenshots and logs are retained as workflow artifacts.

After the main build passes:

```bash
git tag vX.Y.Z
git push origin vX.Y.Z
```

The tag workflow requires a successful main build for the exact tagged commit, verifies its SHA-256 checksums, and publishes that same tested APK. Private signing secrets are supported; otherwise the existing public sideload key keeps signatures consistent. The public key does not establish publisher identity.

Personal project at [Chiragjjjks/sasta](https://github.com/Chiragjjjks/sasta). Not affiliated with the shopping platforms.
