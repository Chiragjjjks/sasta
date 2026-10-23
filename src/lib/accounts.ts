import { Preferences } from '@capacitor/preferences'
import { PlatformSession } from '@/native/platformSession'
import type { Platform } from './types'

/**
 * How Sasta signs in to each platform.
 * - mcp: the platform's official MCP server with OAuth (only Swiggy Instamart today)
 * - web: the platform's own website login inside the in-app browser; the session stays in cookies
 */
export type ConnectMethod = 'mcp' | 'web'

export interface AccountConfig {
  platform: Platform
  method: ConnectMethod
  /** Account the user signs in with, shown in the UI ("Swiggy account"). */
  account: string
  loginUrl: string
  /** Every origin whose cookies belong to this session, for sign-in checks and disconnect. */
  origins: string[]
  /**
   * Cookie names that prove a signed-in session. Empty means unknown, so sign-in is trusted but unverified.
   * Sources: docs/platforms/<platform>.md ("Logged in").
   */
  sessionCookies: string[]
  note?: string
  mcpUrl?: string
}

export const ACCOUNT_CONFIG: Record<Platform, AccountConfig> = {
  instamart: {
    platform: 'instamart', method: 'mcp', account: 'Swiggy',
    loginUrl: 'https://mcp.swiggy.com/auth/authorize', origins: ['https://mcp.swiggy.com'],
    sessionCookies: [], mcpUrl: 'https://mcp.swiggy.com/instamart',
    note: "Official Swiggy connection. You sign in on Swiggy's own page.",
  },
  blinkit: {
    platform: 'blinkit', method: 'web', account: 'Blinkit',
    loginUrl: 'https://blinkit.com/', origins: ['https://blinkit.com'], sessionCookies: ['gr_1_accessToken'],
    note: 'Separate from Zomato. Tap Login on the Blinkit page.',
  },
  zepto: {
    platform: 'zepto', method: 'web', account: 'Zepto',
    // Not session_id: anonymous visits get one too.
    loginUrl: 'https://www.zeptonow.com/', origins: ['https://www.zeptonow.com', 'https://zeptonow.com'], sessionCookies: ['user_id'],
  },
  bigbasket: {
    platform: 'bigbasket', method: 'web', account: 'BigBasket',
    loginUrl: 'https://www.bigbasket.com/', origins: ['https://www.bigbasket.com'], sessionCookies: [],
  },
  flipkart_minutes: {
    platform: 'flipkart_minutes', method: 'web', account: 'Flipkart',
    loginUrl: 'https://www.flipkart.com/account/login', origins: ['https://www.flipkart.com'], sessionCookies: [],
    note: 'Minutes may only work in the Flipkart app. Not confirmed yet.',
  },
  amazon_now: {
    platform: 'amazon_now', method: 'web', account: 'Amazon',
    loginUrl: 'https://www.amazon.in/gp/sign-in.html', origins: ['https://www.amazon.in'], sessionCookies: [],
    note: 'Amazon Now may only work in the Amazon app. Not confirmed yet.',
  },
}

export type AccountStatus = 'disconnected' | 'connected' | 'expired'

export interface Account {
  platform: Platform
  status: AccountStatus
  connectedAt?: number
  /** False when sign-in can't be checked yet (session cookie names unknown) and the user said they finished. */
  verified?: boolean
  /** Swiggy MCP: tool names the server offered after connecting. */
  tools?: string[]
}

const KEY = 'sasta.accounts'

export async function loadAccounts(): Promise<Partial<Record<Platform, Account>>> {
  try {
    const { value } = await Preferences.get({ key: KEY })
    return value ? JSON.parse(value) : {}
  } catch {
    return {}
  }
}

export async function saveAccounts(a: Partial<Record<Platform, Account>>) {
  // Only status metadata lives here. Cookies stay in the WebView store, tokens in Keystore-encrypted storage.
  await Preferences.set({ key: KEY, value: JSON.stringify(a) })
}

/** Decides whether a cookie sign-in succeeded from the cookie names now present. */
export function judgeWebSignIn(cfg: AccountConfig, names: string[]): Pick<Account, 'status' | 'verified'> {
  if (cfg.sessionCookies.length === 0) return { status: 'connected', verified: false }
  const ok = cfg.sessionCookies.some((c) => names.includes(c))
  return ok ? { status: 'connected', verified: true } : { status: 'disconnected' }
}

export async function connectWeb(platform: Platform): Promise<Account> {
  const cfg = ACCOUNT_CONFIG[platform]
  const res = await PlatformSession.signIn({ url: cfg.loginUrl, title: `Sign in to ${cfg.account}` })
  if (res.kind === 'cancelled') return { platform, status: 'disconnected' }
  const { names } = await PlatformSession.cookieNames({ urls: cfg.origins })
  const judged = judgeWebSignIn(cfg, names)
  return { platform, ...judged, connectedAt: judged.status === 'connected' ? Date.now() : undefined }
}

/**
 * Re-checks cookie sessions on this phone. A verified sign-in whose session cookie is gone becomes "expired".
 * Unverifiable sign-ins and MCP connections are left as they are.
 */
export async function recheckWebSessions(accounts: Partial<Record<Platform, Account>>): Promise<Partial<Record<Platform, Account>>> {
  const next = { ...accounts }
  for (const cfg of Object.values(ACCOUNT_CONFIG)) {
    const acc = next[cfg.platform]
    if (cfg.method !== 'web' || !cfg.sessionCookies.length || !acc || acc.status === 'disconnected') continue
    const { names } = await PlatformSession.cookieNames({ urls: cfg.origins })
    const judged = judgeWebSignIn(cfg, names)
    next[cfg.platform] = judged.status === 'connected' ? { ...acc, ...judged } : { ...acc, status: 'expired', verified: false }
  }
  return next
}

export async function disconnectWeb(platform: Platform): Promise<Account> {
  await PlatformSession.clearSession({ urls: ACCOUNT_CONFIG[platform].origins })
  return { platform, status: 'disconnected' }
}
