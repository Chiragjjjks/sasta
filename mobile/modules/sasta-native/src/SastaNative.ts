import { NativeModule, requireNativeModule } from 'expo'

export interface OtpEvent { code: string; text: string; package: string }

declare class SastaNativeModule extends NativeModule<{ otp: (e: OtpEvent) => void }> {
  legacyPreference(key: string): Promise<string | null>
  removeLegacyPreference(key: string): Promise<void>
  legacySwiggySecret(): Promise<string | null>
  removeLegacySwiggySecret(): Promise<void>
  /** Names (never values) of cookies Android's WebView holds for these URLs. */
  cookieNames(urls: string[]): Promise<string[]>
  /** Expires every cookie and clears web storage for these URLs. */
  clearSession(urls: string[]): Promise<void>
  flushCookies(): Promise<void>
  /** Whether the user granted Sasta "Notification access" in Android Settings. */
  hasNotificationAccess(): boolean
  openNotificationAccess(): void
  /** Read one-time codes from notifications for this long (max 10 minutes); 0 stops. */
  armOtp(ms: number): void
}

export default requireNativeModule<SastaNativeModule>('SastaNative')
