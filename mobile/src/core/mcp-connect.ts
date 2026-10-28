import { PlatformSession } from '@/native/platformSession'
import type { Account } from './accounts'
import { McpAuthError, McpClient } from './mcp'
import {
  authorizeUrl, createPkce, discover, exchangeCode, needsRefresh, parseRedirect, randomState,
  refreshTokens, registerClient, type AuthServerMetadata, type Tokens,
} from './oauth'
import type { Platform } from './types'

/**
 * Official MCP servers. The user signs in on the platform's own page in the in-app browser;
 * Sasta keeps only the resulting tokens, encrypted on this phone.
 * Every value below was checked live on 2026-10-28 (docs/platforms/instamart.md, zepto.md).
 */
export interface McpProvider {
  platform: Platform
  account: string
  url: string
  /** RFC 8707 resource sent with authorize and token requests. */
  resource: string
  /** Must be on the server's allow-list. Never loaded: the in-app browser captures it. */
  redirect: string
  scope: string
  tokenEncoding: 'json' | 'form'
  store: string
  /** Origins whose cookies belong to the sign-in page, cleared on disconnect. */
  origins: string[]
}

export const MCP_PROVIDERS = {
  instamart: {
    platform: 'instamart', account: 'Swiggy', url: 'https://mcp.swiggy.com/im', resource: 'https://mcp.swiggy.com/im',
    redirect: 'http://localhost/sasta/oauth/swiggy', scope: 'mcp:tools', tokenEncoding: 'json', store: 'swiggy.instamart',
    origins: ['https://mcp.swiggy.com'],
  },
  zepto: {
    platform: 'zepto', account: 'Zepto', url: 'https://mcp.zepto.co.in/mcp', resource: 'https://mcp.zepto.co.in',
    // Zepto's allow-list: http://localhost/callback (github.com/zeptonow/mcp). Read-only scopes: no cart or order tools.
    redirect: 'http://localhost/callback', tokenEncoding: 'form', store: 'zepto.mcp', origins: ['https://auth.zepto.co.in'],
    scope: 'tools:read dev.ucp.shopping.catalog.search:read dev.ucp.shopping.catalog.lookup:read dev.ucp.common.location.search:read dev.ucp.common.location.lookup:read',
  },
} satisfies Partial<Record<Platform, McpProvider>>

export type McpPlatform = keyof typeof MCP_PROVIDERS
export const isMcpPlatform = (p: Platform): p is McpPlatform => p in MCP_PROVIDERS

interface Stored { clientId: string; tokens: Tokens; meta: AuthServerMetadata }

async function load(p: McpProvider): Promise<Stored | null> {
  const { value } = await PlatformSession.secureGet({ key: p.store })
  if (!value) return null
  try { return JSON.parse(value) as Stored } catch { return null }
}

const save = (p: McpProvider, s: Stored) => PlatformSession.secureSet({ key: p.store, value: JSON.stringify(s) })

/** True when this phone holds a token for the platform's official server. */
export async function hasMcpSession(platform: McpPlatform): Promise<boolean> {
  return !!(await load(MCP_PROVIDERS[platform]))
}

// One refresh at a time per platform: refresh tokens rotate, so two parallel refreshes would log the user out.
const refreshing = new Map<string, Promise<string>>()

async function accessToken(p: McpProvider): Promise<string> {
  const s = await load(p)
  if (!s) throw new McpAuthError()
  if (!needsRefresh(s.tokens)) return s.tokens.access_token
  const pending = refreshing.get(p.store) ?? (async () => {
    try {
      s.tokens = await refreshTokens(s.meta, s.tokens, s.clientId, p.resource, p.tokenEncoding)
      await save(p, s)
      return s.tokens.access_token
    } catch { throw new McpAuthError() }
    finally { refreshing.delete(p.store) }
  })()
  refreshing.set(p.store, pending)
  return pending
}

export function mcpClient(platform: McpPlatform, signal?: AbortSignal): McpClient {
  const p = MCP_PROVIDERS[platform]
  return new McpClient(p.url, () => accessToken(p), signal)
}

export async function connectMcp(platform: McpPlatform): Promise<Account> {
  const p: McpProvider = MCP_PROVIDERS[platform]
  const meta = await discover(p.url)
  const clientId = await registerClient(meta, { name: 'Sasta (personal Android app)', redirectUri: p.redirect, scope: p.scope })
  const { verifier, challenge } = await createPkce()
  const state = randomState()
  const url = authorizeUrl(meta, { clientId, redirectUri: p.redirect, challenge, state, scope: p.scope, resource: p.resource })

  const res = await PlatformSession.signIn({ url, title: `Sign in to ${p.account}`, interceptPrefix: p.redirect,
    hint: `Sign in on ${p.account}'s page. Sasta never sees your number or OTP.` })
  if (res.kind !== 'redirect' || !res.redirectUrl) return { platform, status: 'disconnected' }

  const code = parseRedirect(res.redirectUrl, state)
  const tokens = await exchangeCode(meta, { code, verifier, clientId, redirectUri: p.redirect, resource: p.resource, encoding: p.tokenEncoding })
  await save(p, { clientId, tokens, meta })

  // Prove the connection works and record what the platform lets Sasta do.
  const tools = await mcpClient(platform).listTools()
  return { platform, status: 'connected', via: 'mcp', verified: true, connectedAt: Date.now(), tools: tools.map((t) => t.name) }
}

export async function disconnectMcp(platform: McpPlatform): Promise<Account> {
  const p = MCP_PROVIDERS[platform]
  await PlatformSession.secureRemove({ key: p.store })
  await PlatformSession.clearSession({ urls: p.origins })
  return { platform, status: 'disconnected' }
}
