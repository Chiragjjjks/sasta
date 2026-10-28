package expo.modules.sastanative

import android.content.Context
import android.content.Intent
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import android.net.Uri
import android.util.Base64
import android.webkit.CookieManager
import android.webkit.WebStorage
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Access to Android's app-wide WebView cookie store, which react-native-webview shares.
 * Only cookie NAMES leave native code; values (session tokens) never do.
 */
class SastaNativeModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SastaNative")
    Events("otp")

    OnCreate { OtpBus.listener = { code, text, pkg -> sendEvent("otp", mapOf("code" to code, "text" to text, "package" to pkg)) } }
    OnDestroy { OtpBus.listener = null; OtpBus.armedUntil = 0L }

    // OTP auto-fill: notification access is a user-granted setting; reading happens only while armed.
    Function("hasNotificationAccess") {
      val context = requireNotNull(appContext.reactContext)
      NotificationManagerCompat.getEnabledListenerPackages(context).contains(context.packageName)
    }
    Function("openNotificationAccess") {
      val context = requireNotNull(appContext.reactContext)
      context.startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      Unit
    }
    Function("armOtp") { ms: Double ->
      OtpBus.armedUntil = if (ms <= 0) 0L else System.currentTimeMillis() + ms.toLong().coerceAtMost(10 * 60 * 1000L)
      Unit
    }

    // Preserve on-device data when the v0.3 Capacitor APK is updated in place.
    AsyncFunction("legacyPreference") { key: String ->
      require(key in setOf("sasta.cart", "sasta.lists", "sasta.location", "sasta.recents", "sasta.fees", "sasta.accounts"))
      val context = requireNotNull(appContext.reactContext)
      context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE).getString(key, null)
    }
    AsyncFunction("removeLegacyPreference") { key: String ->
      require(key.startsWith("sasta."))
      requireNotNull(appContext.reactContext).getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE).edit().remove(key).commit()
      Unit
    }
    AsyncFunction("legacySwiggySecret") {
      val prefs = requireNotNull(appContext.reactContext).getSharedPreferences("sasta_secure", Context.MODE_PRIVATE)
      val stored = prefs.getString("swiggy.instamart", null)
      if (stored == null) null else try {
        val bytes = Base64.decode(stored, Base64.NO_WRAP)
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, store.getKey("sasta_session_key", null) as SecretKey, GCMParameterSpec(128, bytes, 0, 12))
        String(cipher.doFinal(bytes, 12, bytes.size - 12), Charsets.UTF_8)
      } catch (_: Exception) { null }
    }
    AsyncFunction("removeLegacySwiggySecret") {
      requireNotNull(appContext.reactContext).getSharedPreferences("sasta_secure", Context.MODE_PRIVATE).edit().remove("swiggy.instamart").commit()
      Unit
    }

    AsyncFunction("cookieNames") { urls: List<String> ->
      val names = LinkedHashSet<String>()
      for (url in urls) {
        val raw = CookieManager.getInstance().getCookie(url) ?: continue
        for (part in raw.split(";")) {
          val p = part.trim()
          val eq = p.indexOf('=')
          // Skip empty values: sites often leave a blank cookie behind after logout.
          if (eq > 0 && eq < p.length - 1) names.add(p.substring(0, eq))
        }
      }
      return@AsyncFunction names.toList()
    }

    AsyncFunction("clearSession") { urls: List<String> ->
      val cm = CookieManager.getInstance()
      for (url in urls) {
        val uri = Uri.parse(url)
        val host = uri.host ?: continue
        val raw = cm.getCookie(url)
        if (raw != null) {
          for (part in raw.split(";")) {
            val p = part.trim()
            val eq = p.indexOf('=')
            if (eq <= 0) continue
            val expired = p.substring(0, eq) + "=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/"
            cm.setCookie(url, expired)
            cm.setCookie(url, "$expired; Domain=$host")
            cm.setCookie(url, "$expired; Domain=." + host.removePrefix("www."))
          }
        }
        WebStorage.getInstance().deleteOrigin("${uri.scheme}://$host")
      }
      cm.flush()
    }

    AsyncFunction("flushCookies") {
      CookieManager.getInstance().flush()
    }
  }
}
