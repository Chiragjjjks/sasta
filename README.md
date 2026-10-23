# Sasta

**One search, every quick-commerce app.** Type a product once and Sasta compares it across Blinkit, Zepto, Instamart, BigBasket, Flipkart Minutes and Amazon Now, then shows the cheapest pack. Android app, no login, no server.

> **Status: preview.** The app and release pipeline are complete. Prices are sample data until live platform search lands. See [PLAN.md](PLAN.md).

## Install

Download the latest `Sasta-vX.Y.Z-android.apk` from [Releases](https://github.com/Chiragjjjks/sasta/releases/latest) on your phone and open it. Android 7.0 or newer.

## Develop

```bash
npm install
npm run dev            # mobile web preview at the printed LAN URL
npm test               # unit tests
npm run android:sync   # build and copy into android/
npm run android:open   # open in Android Studio
```

Building the APK locally needs JDK 21 and Android SDK 36. CI builds it for you on every push.

## Release

Bump `version` in `package.json`, add `docs/releases/vX.Y.Z.md`, then:

```bash
git tag vX.Y.Z && git push origin main vX.Y.Z
```

GitHub Actions builds, signs and publishes the APK with checksums.

## Stack

React 19, Vite, Tailwind CSS v4, shadcn-style components with vaul sheets, Capacitor 8 for Android.

Personal tool. Not affiliated with any of the platforms it compares.
