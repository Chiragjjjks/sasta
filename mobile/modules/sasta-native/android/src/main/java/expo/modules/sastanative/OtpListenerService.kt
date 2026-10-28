package expo.modules.sastanative

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

/**
 * Passes one-time codes to Sasta while it is signing in to shopping apps.
 * Does nothing unless armed: notifications outside a sign-in window are never read.
 * Only the code, the sender's name and the first part of the message leave this class.
 */
object OtpBus {
  @Volatile var armedUntil = 0L
  @Volatile var listener: ((code: String, text: String, pkg: String) -> Unit)? = null
  private val code = Regex("""(?<![\d])(\d{4,8})(?![\d])""")
  private val keyword = Regex("""(?i)\b(otp|code|verification|verify|one[ -]?time|login|password|pin)\b""")

  fun handle(title: String, body: String, pkg: String) {
    if (System.currentTimeMillis() > armedUntil) return
    val text = "$title $body"
    if (!keyword.containsMatchIn(text)) return
    val match = code.find(body) ?: code.find(title) ?: return
    listener?.invoke(match.groupValues[1], text.take(240), pkg)
  }
}

class OtpListenerService : NotificationListenerService() {
  override fun onNotificationPosted(sbn: StatusBarNotification?) {
    if (sbn == null || System.currentTimeMillis() > OtpBus.armedUntil) return
    val extras = sbn.notification?.extras ?: return
    val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString() ?: ""
    val body = (extras.getCharSequence(Notification.EXTRA_BIG_TEXT) ?: extras.getCharSequence(Notification.EXTRA_TEXT))?.toString() ?: ""
    OtpBus.handle(title, body, sbn.packageName ?: "")
  }
}
