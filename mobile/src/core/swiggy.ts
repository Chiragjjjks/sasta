import { PlatformSession } from '@/native/platformSession'
import type { Account } from './accounts'
import { ACCOUNT_CONFIG } from './accounts'
import { McpClient } from './mcp'
import {
  authorizeUrl, createPkce, discover, exchangeCode, needsRefresh, parseRedirect, randomState,
  refreshTokens, registerClient, type AuthServerMetadata, type Tokens,
} from './oauth'

/**
 * Swiggy Instamart through Swiggy's official MCP server.
 * The user signs in on Swiggy's own page in the in-app browser; Sasta keeps only the
 * resulting tokens, encrypted with the Android Keystore, on this phone.
 */

const MCP_URL = ACCOUNT_CONFIG.instamart.mcpUrl!
// Never loaded: the in-app browser captures this redirect and hands the code back.
export const SWIGGY_REDIRECT = 'http://localhost/sasta/oauth/swiggy'
const SCOPE = 'mcp:tools'
const STORE = 'swiggy.instamart'

interface Stored { clientId: string; tokens: Tokens; meta: AuthServerMetadata }

async function load(): Promise<Stored | null> {
  const { value } = await PlatformSession.secureGet({ key: STORE })
  return value ? (JSON.parse(value) as Stored) : null
}

async function save(s: Stored) {
  await PlatformSession.secureSet({ key: STORE, value: JSON.stringify(s) })
}

async function accessToken(): Promise<string> {
  const s = await load()
  if (!s) throw new Error('Swiggy is not connected.')
  if (needsRefresh(s.tokens)) {
    s.tokens = await refreshTokens(s.meta, s.tokens, s.clientId, MCP_URL)
    await save(s)
  }
  return s.tokens.access_token
}

export function swiggyClient(): McpClient {
  return new McpClient(MCP_URL, accessToken)
}

export async function connectSwiggy(): Promise<Account> {
  const meta = await discover(MCP_URL)
  const clientId = await registerClient(meta, { name: 'Sasta (personal Android app)', redirectUri: SWIGGY_REDIRECT, scope: SCOPE })
  const { verifier, challenge } = await createPkce()
  const state = randomState()
  const url = authorizeUrl(meta, { clientId, redirectUri: SWIGGY_REDIRECT, challenge, state, scope: SCOPE, resource: MCP_URL })

  const res = await PlatformSession.signIn({ url, title: 'Sign in to Swiggy', interceptPrefix: SWIGGY_REDIRECT })
  if (res.kind !== 'redirect' || !res.redirectUrl) return { platform: 'instamart', status: 'disconnected' }

  const code = parseRedirect(res.redirectUrl, state)
  // Swiggy's authorize step rewrites client_id (seen as "swiggy-mcp" on 2026-10-24), so try the id it used if ours is refused.
  const ids = [clientId, ...(await clientIdUsedBySwiggy(url).then((id) => (id && id !== clientId ? [id] : [])))]
  let tokens: Tokens | undefined
  let usedId = clientId
  let lastError: unknown
  for (const id of ids) {
    try {
      tokens = await exchangeCode(meta, { code, verifier, clientId: id, redirectUri: SWIGGY_REDIRECT, resource: MCP_URL })
      usedId = id
      break
    } catch (e) { lastError = e }
  }
  if (!tokens) throw lastError instanceof Error ? lastError : new Error('Swiggy sign-in could not be completed.')
  await save({ clientId: usedId, tokens, meta })

  // Prove the connection works and record what Swiggy lets Sasta do.
  const tools = await swiggyClient().listTools()
  return { platform: 'instamart', status: 'connected', verified: true, connectedAt: Date.now(), tools: tools.map((t) => t.name) }
}

/** Reads the client_id Swiggy redirects the authorize URL to, without following the redirect. */
async function clientIdUsedBySwiggy(url: string): Promise<string | undefined> {
  try {
    const r = await fetch(url, { redirect: 'manual' })
    const loc = r.headers.get('location') ?? r.url
    return loc ? new URL(loc, url).searchParams.get('client_id') ?? undefined : undefined
  } catch {
    return undefined
  }
}

export async function disconnectSwiggy(): Promise<Account> {
  await PlatformSession.secureRemove({ key: STORE })
  await PlatformSession.clearSession({ urls: ACCOUNT_CONFIG.instamart.origins })
  return { platform: 'instamart', status: 'disconnected' }
}
