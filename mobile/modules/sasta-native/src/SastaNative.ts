import { NativeModule, requireNativeModule } from 'expo'

declare class SastaNativeModule extends NativeModule {
  legacyPreference(key: string): Promise<string | null>
  removeLegacyPreference(key: string): Promise<void>
  legacySwiggySecret(): Promise<string | null>
  removeLegacySwiggySecret(): Promise<void>
  /** Names (never values) of cookies Android's WebView holds for these URLs. */
  cookieNames(urls: string[]): Promise<string[]>
  /** Expires every cookie and clears web storage for these URLs. */
  clearSession(urls: string[]): Promise<void>
  flushCookies(): Promise<void>
}

export default requireNativeModule<SastaNativeModule>('SastaNative')
