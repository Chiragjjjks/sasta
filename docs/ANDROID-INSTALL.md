# Android APK installation

Sasta is installed from a downloaded APK, rather than the Play Store. Android and
Google Play Protect decide which installation and scanning prompts appear; app
copy cannot change those decisions.

## Play Protect: “App blocked to protect your device”

Reported by the owner on 2026-10-30. The v0.8.0 APK declares a notification listener
for OTP auto-fill. Google's [developer guidance](https://developers.google.com/android/play-protect/warning-dev-guidance)
lists notification access, SMS reading/receiving and accessibility access as
sensitive capabilities which can trigger this block for internet-sideloaded APKs.
The notification service is the likely cause here, rather than the app's UI text.

The fix on main removes the service and its Kotlin and JavaScript OTP-reading path.
It also blocks unused storage, overlay, biometric and vibration permissions added
by dependencies. Connect-all still fills the phone number and opens each provider's
own page. The user enters each OTP there. Providers with a recognised session signal
close automatically; otherwise the user taps “I'm signed in”. Search, lists, cart,
foreground location and encrypted on-device account storage remain available.

CI decodes the **packaged APK's** manifest using `apkanalyzer manifest print` and
runs `mobile/scripts/check-apk-manifest.py`. It allows internet, foreground location
and the app-private AndroidX receiver permission only, rejects notification-reading
and accessibility services, and rejects debuggable/test-only APKs. This catches
permissions and services contributed by dependencies as well as Sasta's own code.

An emulator install verifies Android package/signature compatibility and startup,
but does not establish that Google's Play Protect scan on the owner's phone will
accept it. Check the fixed APK on that phone with Play Protect enabled. A scan
request for an unknown APK is distinct from a sensitive-access block. If the fixed
APK is still blocked, record its SHA-256 and exact message; Google's guidance links
the developer appeal process for incorrect classifications.

The public v0.8.0 download still contains the old service. Publishing a replacement
requires a new release approved by the owner. Do not claim an install fix is in the
website's public download until that release exists.

## "Can't download it, or it won't open" (owner, 2026-11-18)

Checked against the published v0.10.0 APK, its 12 predecessors and a Pixel-class ARM64 emulator
(Android 15, `google_apis`, the same CPU type as a phone; CI only tests the x86_64 build):

| Check | Result |
|---|---|
| Download from the site's default link and from the GitHub API link | 200, 59,999,889 bytes, SHA-256 matches `SHA256SUMS.txt` |
| Fresh install, then launch | Installs; opens on the Grocery home in about 5 s; no crash in `logcat -b crash` |
| Install over v0.9.1 (after a search) and over v0.8.0 | Updates in place; opens; the v0.9.1 recent search is kept |
| Signing key of every main APK, v0.1.0 to v0.10.0 | One key (`CN=Sasta public build key`, cert SHA-256 `baa8f83b…ce9ba42`); versionCode always rises (3 … 10089, 10094) |
| The extra `-android-debug.apk` files on v0.1.0 to v0.3.2 | Each has its own random debug key: installing any later release over one fails with `INSTALL_FAILED_UPDATE_INCOMPATIBLE` ("App not installed as package conflicts with an existing package"). Uninstall Sasta, then install |
| CPU types in the APK | `arm64-v8a` and `x86_64` only: 32-bit-only phones (some Android Go models) get "not compatible" |

What was wrong with the download itself: 47 MB of the 60 MB APK was native libraries stored
**uncompressed** (the Android default, so they can be mapped in place). From v0.10.1,
`plugins/withSastaAndroid.js` sets `expo.useLegacyPackaging=true`, which compresses them; a local
release build of the same code is 27.0 MB, installs over v0.10.0 on the ARM64 emulator, keeps the
same signing key and opens. Android unpacks the libraries once at install. CI fails the build if
the APK grows past 40 MB.

The site's FAQ now has "The APK won't download, install or open": use Chrome rather than an in-app
browser, open the file from Downloads, allow installs from Chrome, the Play Protect "Install anyway"
path, uninstall-first for the old debug builds, and the 64-bit requirement.

Still not proven: what the owner's own phone shows. If it still fails, note the exact message
(screenshot), the phone model and Android version, and which Sasta version (if any) is already installed.
