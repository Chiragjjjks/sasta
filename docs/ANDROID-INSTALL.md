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
