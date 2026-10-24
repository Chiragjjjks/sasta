import { Preferences } from '@/native/kv'
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
  /**
   * JS expression run inside the platform's page that is true once signed in, read from the site's
   * own storage. Used to close the sign-in screen right after the OTP and to test the connection.
   */
  signedInScript?: string
  /** Swiggy: sign in on the website instead, if the official MCP connection fails. */
  webFallback?: { loginUrl: string; origins: string[]; sessionCookies: string[] }
}

export const ACCOUNT_CONFIG: Record<Platform, AccountConfig> = {
  instamart: {
    platform: 'instamart', method: 'mcp', account: 'Swiggy',
    loginUrl: 'https://mcp.swiggy.com/auth/authorize', origins: ['https://mcp.swiggy.com'],
    sessionCookies: [], mcpUrl: 'https://mcp.swiggy.com/instamart',
    note: "Official Swiggy connection. You sign in on Swiggy's own page.",
    webFallback: { loginUrl: 'https://www.swiggy.com/instamart', origins: ['https://www.swiggy.com'], sessionCookies: ['_session_tid'] },
  },
  blinkit: {
    platform: 'blinkit', method: 'web', account: 'Blinkit',
    loginUrl: 'https://blinkit.com/', origins: ['https://blinkit.com'], sessionCookies: ['gr_1_accessToken'],
    note: 'Separate from Zomato. Tap Login on the Blinkit page.',
    signedInScript: "(function(){var a=JSON.parse(localStorage.getItem('auth')||'null');return !!(a&&a.accessToken)})()",
  },
  zepto: {
    platform: 'zepto', method: 'web', account: 'Zepto',
    // Not session_id: anonymous visits get one too.
    // zeptonow.com now redirects to zepto.com; check both.
    loginUrl: 'https://www.zepto.com/', origins: ['https://www.zepto.com', 'https://zepto.com', 'https://www.zeptonow.com'], sessionCookies: ['user_id'],
    // zepto.com keeps { state: { user, isAuth } } under localStorage "user" (seen in its web bundle).
    signedInScript: "(function(){var u=JSON.parse(localStorage.getItem('user')||'null');return !!(u&&u.state&&(u.state.isAuth||(u.state.user&&u.state.user.id)))})()",
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
    // Anonymous visits get session-id and ubid-acbin; these appear only after sign-in.
    loginUrl: 'https://www.amazon.in/gp/sign-in.html', origins: ['https://www.amazon.in'], sessionCookies: ['at-acbin', 'x-acbin', 'sess-at-acbin'],
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
  /** How it was connected. Swiggy can fall back to the website. */
  via?: ConnectMethod
  /** Session cookies learned on this phone by comparing cookies before and after sign-in. */
  learnedCookies?: string[]
  /** Who is signed in, masked, e.g. "•••• 1234". */
  label?: string
  /** Result of the quick check run right after connecting (or from the Test button). */
  lastTest?: { ok: boolean; detail: string; at: number }
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

/** Cookies every visitor gets (analytics, bot checks); never evidence of a sign-in. */
const NOISE = /^(_ga|_gid|_gat|_gcl|_fbp|_abck|bm_|ak_|aws-waf|csm-hit|i18n|lc-|ubid|session-id|session-token|NRBA|T$|vh$|vw$|dpr$|fonts|Network|isH2|h2Network|ts$|adb$|rxc$|csrftoken|csurftoken|XSRF|x-channel)/i
const AUTH_HINT = /(auth|token|sess|login|user|uid|sso|jwt|acc|^at$|^rt$|^sn$|member)/i

/** New cookies that look like a session, from names before vs after sign-in. */
export function learnSessionCookies(before: string[], after: string[]): string[] {
  const prev = new Set(before)
  return after.filter((n) => !prev.has(n) && !NOISE.test(n) && AUTH_HINT.test(n))
}

/** Decides whether a cookie sign-in holds, from the cookie names now present. */
export function judgeWebSignIn(cfg: Pick<AccountConfig, 'sessionCookies'>, names: string[], learned: string[] = []): Pick<Account, 'status' | 'verified'> {
  const signals = cfg.sessionCookies.length ? cfg.sessionCookies : learned
  if (signals.length === 0) return { status: 'connected', verified: false }
  const ok = signals.some((c) => names.includes(c))
  return ok ? { status: 'connected', verified: true } : { status: 'disconnected' }
}

export interface SignInTarget { loginUrl: string; origins: string[]; sessionCookies: string[]; account: string; signedInScript?: string }

/** Signs in on a platform's own page in the in-app browser and works out whether it worked. */
export async function signInOnWeb(platform: Platform, target: SignInTarget, via: ConnectMethod = 'web'): Promise<Account> {
  const before = (await PlatformSession.cookieNames({ urls: target.origins })).names
  const res = await PlatformSession.signIn({
    url: target.loginUrl,
    title: `Sign in to ${target.account}`,
    doneCookies: target.sessionCookies,
    doneOrigins: target.origins,
    doneScript: target.signedInScript,
  })
  if (res.kind === 'cancelled') return { platform, status: 'disconnected' }
  const after = (await PlatformSession.cookieNames({ urls: target.origins })).names
  const learned = target.sessionCookies.length ? [] : learnSessionCookies(before, after)
  let judged = judgeWebSignIn(target, after, learned)
  // The page said "signed in" from its own storage even if the cookie check is unsure.
  if (judged.status !== 'connected' && target.signedInScript && (await checkInPage(target.origins[0], target.signedInScript))) {
    judged = { status: 'connected', verified: true }
  }
  return {
    platform, ...judged, via,
    learnedCookies: learned.length ? learned : undefined,
    connectedAt: judged.status === 'connected' ? Date.now() : undefined,
  }
}

/** Runs the platform's signed-in check inside its own page (fresh hidden WebView, shared storage). */
export async function checkInPage(origin: string, script: string): Promise<boolean> {
  await PlatformSession.pageReset({ origin })
  const res = await PlatformSession.pageRun({ origin, script: `return ${script};`, timeoutMs: 12000 })
  return res.ok && res.value === true
}

export interface ConnectionTest { ok: boolean; detail: string }

/** One quick check after connecting, so the user knows the session really works. */
export async function testWebConnection(platform: Platform, acc: Account): Promise<ConnectionTest> {
  const cfg = ACCOUNT_CONFIG[platform]
  const target = cfg.method === 'web' ? cfg : acc.via === 'web' ? cfg.webFallback : undefined
  if (!target) return { ok: false, detail: 'Nothing to test' }
  const script: string | undefined = cfg.method === 'web' ? cfg.signedInScript : undefined
  if (script && (await checkInPage(target.origins[0], script).catch(() => false))) return { ok: true, detail: `${cfg.account} says you are signed in` }
  const { names } = await PlatformSession.cookieNames({ urls: target.origins })
  const judged = judgeWebSignIn(target, names, acc.learnedCookies)
  if (judged.status === 'connected' && judged.verified) return { ok: true, detail: 'Session found on this phone' }
  if (judged.status === 'connected') return { ok: true, detail: 'Signed in. This app can only be checked after first use' }
  return { ok: false, detail: `No ${cfg.account} session found. Tap Reconnect and sign in again` }
}

export async function connectWeb(platform: Platform): Promise<Account> {
  return signInOnWeb(platform, ACCOUNT_CONFIG[platform])
}

/** Swiggy website sign-in, used when the official MCP connection does not work. */
export async function connectSwiggyWebsite(): Promise<Account> {
  const fb = ACCOUNT_CONFIG.instamart.webFallback!
  return signInOnWeb('instamart', { ...fb, account: 'Swiggy' }, 'web')
}

/**
 * Re-checks cookie sessions on this phone. A verified sign-in whose session cookie is gone becomes "expired".
 * Unverifiable sign-ins and MCP connections are left as they are.
 */
export async function recheckWebSessions(accounts: Partial<Record<Platform, Account>>): Promise<Partial<Record<Platform, Account>>> {
  const next = { ...accounts }
  for (const cfg of Object.values(ACCOUNT_CONFIG)) {
    const acc = next[cfg.platform]
    if (!acc || acc.status === 'disconnected') continue
    const web = cfg.method === 'web' ? cfg : acc.via === 'web' ? cfg.webFallback : undefined
    if (!web) continue
    const signals = web.sessionCookies.length ? web.sessionCookies : acc.learnedCookies ?? []
    if (!signals.length) continue
    const { names } = await PlatformSession.cookieNames({ urls: web.origins })
    const judged = judgeWebSignIn(web, names, acc.learnedCookies)
    next[cfg.platform] = judged.status === 'connected' ? { ...acc, ...judged } : { ...acc, status: 'expired', verified: false }
  }
  return next
}

export async function disconnectWeb(platform: Platform): Promise<Account> {
  const cfg = ACCOUNT_CONFIG[platform]
  await PlatformSession.clearSession({ urls: [...cfg.origins, ...(cfg.webFallback?.origins ?? [])] })
  return { platform, status: 'disconnected' }
}
