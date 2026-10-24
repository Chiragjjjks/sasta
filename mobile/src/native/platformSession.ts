import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'
import SastaNative from '../../modules/sasta-native'

/**
 * Sign-in sessions for each shopping app, kept only on this phone.
 * Same interface the shared core code was written against; the work is done by
 * <SignInHost/> and <HiddenPages/> (SessionHosts.tsx), which register themselves here.
 */

export interface SignInResult {
  kind: 'done' | 'redirect' | 'cancelled'
  redirectUrl?: string
}

export interface SignInOptions {
  url: string
  title?: string
  /** OAuth: navigation to a URL starting with this is captured and returned, never loaded. */
  interceptPrefix?: string
  /** Close by itself once one of these cookies appears on these origins. */
  doneCookies?: string[]
  doneOrigins?: string[]
  /** JS expression run in the page; true once signed in (reads the site's own storage). */
  doneScript?: string
}

export interface PageResult { ok: boolean; value?: unknown; error?: string }

interface Hosts {
  signIn?: (o: SignInOptions) => Promise<SignInResult>
  pageRun?: (o: { origin: string; script: string; timeoutMs?: number; path?: string }) => Promise<PageResult>
  pageReset?: (origin: string) => void
}

export const hosts: Hosts = {}
export function registerHosts(next: Hosts) { Object.assign(hosts, next) }
let hostsReady: () => void
const ready = new Promise<void>((r) => { hostsReady = r })
export function markHostsReady() { hostsReady() }

const isWeb = Platform.OS === 'web'

// SecureStore keys may only contain letters, digits, ".", "-" and "_".
const secureKey = (k: string) => `sasta_${k.replace(/[^A-Za-z0-9._-]/g, '_')}`

export const PlatformSession = {
  async signIn(opts: SignInOptions): Promise<SignInResult> {
    if (isWeb) throw new Error('Sign-in only works in the Android app.')
    await ready
    return hosts.signIn!(opts)
  },
  async cookieNames({ urls }: { urls: string[] }): Promise<{ names: string[] }> {
    if (isWeb) return { names: [] }
    return { names: await SastaNative.cookieNames(urls) }
  },
  async clearSession({ urls }: { urls: string[] }): Promise<void> {
    if (isWeb) return
    await SastaNative.clearSession(urls)
    for (const u of urls) hosts.pageReset?.(new URL(u).origin)
  },
  async secureSet({ key, value }: { key: string; value: string }): Promise<void> {
    if (isWeb) { localStorage.setItem(secureKey(key), value); return }
    await SecureStore.setItemAsync(secureKey(key), value)
  },
  async secureGet({ key }: { key: string }): Promise<{ value: string | null }> {
    if (isWeb) return { value: localStorage.getItem(secureKey(key)) }
    try {
      let value = await SecureStore.getItemAsync(secureKey(key))
      if (value === null && Platform.OS === 'android' && key === 'swiggy.instamart') {
        value = await SastaNative.legacySwiggySecret()
        if (value !== null) {
          await SecureStore.setItemAsync(secureKey(key), value)
          await SastaNative.removeLegacySwiggySecret()
        }
      }
      return { value }
    } catch { return { value: null } }
  },
  async secureRemove({ key }: { key: string }): Promise<void> {
    if (isWeb) { localStorage.removeItem(secureKey(key)); return }
    await SecureStore.deleteItemAsync(secureKey(key))
    if (Platform.OS === 'android' && key === 'swiggy.instamart') await SastaNative.removeLegacySwiggySecret()
  },
  async pageRun(opts: { origin: string; script: string; timeoutMs?: number; path?: string }): Promise<PageResult> {
    if (isWeb) return { ok: false, error: 'Live search only works in the Android app.' }
    await ready
    return hosts.pageRun!(opts)
  },
  async pageReset({ origin }: { origin: string }): Promise<void> {
    hosts.pageReset?.(origin)
  },
}
