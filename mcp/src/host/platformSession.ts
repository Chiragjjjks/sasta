import { join } from 'node:path'
import { chrome, type PageResult, type SignInOptions, type SignInResult } from './chrome'
import { home, readJson, writeJson } from './paths'

/**
 * Desktop implementation of mobile/src/native/platformSession.ts, the one seam the shared core is
 * written against. Pages run in real Chrome (host/chrome.ts); MCP tokens live in a 0600 file.
 */
export type { PageResult, SignInOptions, SignInResult }

const secrets = () => join(home(), 'secrets.json')

export function beginAutoSignIn(_phone: string) {}
export function endAutoSignIn() {}

export const PlatformSession = {
  signIn: (opts: SignInOptions): Promise<SignInResult> => chrome.signIn(opts),
  async cookieNames({ urls }: { urls: string[] }): Promise<{ names: string[] }> {
    return { names: await chrome.cookieNames(urls) }
  },
  clearSession: ({ urls }: { urls: string[] }): Promise<void> => chrome.clearSession(urls),
  async secureSet({ key, value }: { key: string; value: string }): Promise<void> {
    writeJson(secrets(), { ...readJson<Record<string, string>>(secrets(), {}), [key]: value }, true)
  },
  async secureGet({ key }: { key: string }): Promise<{ value: string | null }> {
    return { value: readJson<Record<string, string>>(secrets(), {})[key] ?? null }
  },
  async secureRemove({ key }: { key: string }): Promise<void> {
    const all = readJson<Record<string, string>>(secrets(), {})
    delete all[key]
    writeJson(secrets(), all, true)
  },
  pageRun: (opts: { origin: string; script: string; timeoutMs?: number; path?: string }): Promise<PageResult> => chrome.pageRun(opts),
  pageReset: ({ origin }: { origin: string }): Promise<void> => chrome.pageReset(origin),
}
