import { Capacitor, registerPlugin } from '@capacitor/core'

export interface SignInResult {
  kind: 'done' | 'redirect' | 'cancelled'
  redirectUrl?: string
}

export interface PlatformSessionPlugin {
  /** Opens the platform's own sign-in page in an in-app browser. */
  signIn(opts: { url: string; title?: string; interceptPrefix?: string }): Promise<SignInResult>
  /** Cookie names (never values) held for these URLs. */
  cookieNames(opts: { urls: string[] }): Promise<{ names: string[] }>
  clearSession(opts: { urls: string[] }): Promise<void>
  secureSet(opts: { key: string; value: string }): Promise<void>
  secureGet(opts: { key: string }): Promise<{ value: string | null }>
  secureRemove(opts: { key: string }): Promise<void>
  /** Runs the body of an async JS function inside the platform's own page (hidden WebView). */
  pageRun(opts: { origin: string; script: string; timeoutMs?: number }): Promise<{ ok: boolean; value?: unknown; error?: string }>
  pageReset(opts: { origin: string }): Promise<void>
}

/**
 * Browser-preview stand-in so the UI can be exercised with `npm run dev`.
 * It cannot really sign in anywhere: cookie sign-in asks for confirmation, OAuth is unavailable.
 */
const web: PlatformSessionPlugin = {
  async signIn({ url, interceptPrefix }) {
    if (interceptPrefix) throw new Error('Sign-in with this app only works in the Android app.')
    window.open(url, '_blank', 'noopener')
    return { kind: window.confirm('Preview: did you finish signing in?') ? 'done' : 'cancelled' }
  },
  async cookieNames() { return { names: [] } },
  async clearSession() {},
  async secureSet({ key, value }) { localStorage.setItem(`sasta.secure.${key}`, value) },
  async secureGet({ key }) { return { value: localStorage.getItem(`sasta.secure.${key}`) } },
  async secureRemove({ key }) { localStorage.removeItem(`sasta.secure.${key}`) },
  async pageRun() { return { ok: false, error: 'Live search only works in the Android app.' } },
  async pageReset() {},
}

export const PlatformSession: PlatformSessionPlugin = Capacitor.isNativePlatform()
  ? registerPlugin<PlatformSessionPlugin>('PlatformSession')
  : web
