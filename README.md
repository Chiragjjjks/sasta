# Sasta

An Android app for comparing quick-commerce prices and keeping reusable shopping lists. Built with React Native and Expo, with native inputs, navigation, scrolling and Android sharing.

**Search adapters: Blinkit, Zepto and Flipkart Minutes, plus guarded Amazon Now discovery.** Zepto was checked against a live product page. Minutes needs an exact provider delivery address and its positive catalogue remains unverified on a signed-in account. Amazon Now is available only if the account exposes a verified Now web storefront; Fresh and regular marketplace listings are excluded. Instamart and BigBasket currently support sign-in only. Account **Test search** reports a real product count or failure reason separately from login verification. Confirm prices, stock, offers and final fees in the shopping app before payment.

## Install

Download `Sasta-vX.Y.Z-android.apk` from [Releases](https://github.com/Chiragjjjks/sasta/releases/latest) and open it on your Android phone (Android 7 or newer; ARM64 or x86_64). Install over the previous release to keep your lists, cart and location. The rebuild migrates data from v0.3.2 on first launch.

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
