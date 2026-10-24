/**
 * OAuth 2.1 for MCP servers (authorization code + PKCE, public client, dynamic client registration).
 * Pure helpers here; the Swiggy connector wires them to the in-app browser and secure storage.
 */

export interface AuthServerMetadata {
  issuer: string
  authorization_endpoint: string
  token_endpoint: string
  registration_endpoint?: string
}

export interface Tokens {
  access_token: string
  refresh_token?: string
  /** Epoch ms. */
  expires_at?: number
  token_type?: string
}

function b64url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function createPkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)))
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return { verifier, challenge: b64url(new Uint8Array(digest)) }
}

export function randomState(): string {
  return b64url(crypto.getRandomValues(new Uint8Array(16)))
}

/** Reads `resource_metadata="…"` from a 401's WWW-Authenticate header. */
export function resourceMetadataUrl(wwwAuthenticate: string | null): string | undefined {
  return wwwAuthenticate?.match(/resource_metadata="([^"]+)"/)?.[1]
}

export function authorizeUrl(meta: AuthServerMetadata, p: {
  clientId: string; redirectUri: string; challenge: string; state: string; scope: string; resource: string
}): string {
  const u = new URL(meta.authorization_endpoint)
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('client_id', p.clientId)
  u.searchParams.set('redirect_uri', p.redirectUri)
  u.searchParams.set('scope', p.scope)
  u.searchParams.set('state', p.state)
  u.searchParams.set('code_challenge', p.challenge)
  u.searchParams.set('code_challenge_method', 'S256')
  u.searchParams.set('resource', p.resource)
  return u.toString()
}

/** Pulls the code out of the captured redirect, rejecting a state mismatch or a provider error. */
export function parseRedirect(url: string, expectedState: string): string {
  const u = new URL(url)
  const err = u.searchParams.get('error')
  if (err) throw new Error(u.searchParams.get('error_description') || `Sign-in failed: ${err}`)
  if (u.searchParams.get('state') !== expectedState) throw new Error('Sign-in response did not match this request. Try again.')
  const code = u.searchParams.get('code')
  if (!code) throw new Error('Sign-in finished without an authorization code.')
  return code
}

export function toTokens(json: Record<string, unknown>, now = Date.now()): Tokens {
  if (typeof json.access_token !== 'string') throw new Error('Token response had no access token.')
  return {
    access_token: json.access_token,
    refresh_token: typeof json.refresh_token === 'string' ? json.refresh_token : undefined,
    token_type: typeof json.token_type === 'string' ? json.token_type : undefined,
    expires_at: typeof json.expires_in === 'number' ? now + json.expires_in * 1000 : undefined,
  }
}

export function needsRefresh(t: Tokens, now = Date.now()): boolean {
  return !!t.expires_at && t.expires_at - now < 60_000
}

async function postForm(url: string, body: Record<string, string>, encoding: 'form' | 'json' = 'form'): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': encoding === 'json' ? 'application/json' : 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: encoding === 'json' ? JSON.stringify(body) : new URLSearchParams(body).toString(),
  })
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) throw new Error(String(json.error_description || json.error || `Token request failed (${res.status})`))
  return json
}

export async function discover(mcpUrl: string): Promise<AuthServerMetadata> {
  const probe = await fetch(mcpUrl, { method: 'GET', headers: { Accept: 'application/json, text/event-stream' } })
  const origin = new URL(mcpUrl).origin
  const rmUrl = resourceMetadataUrl(probe.headers.get('www-authenticate')) ?? `${origin}/.well-known/oauth-protected-resource`
  const rm = (await (await fetch(rmUrl)).json()) as { authorization_servers?: string[] }
  const issuer = rm.authorization_servers?.[0] ?? origin
  const issuerUrl = new URL(issuer)
  const candidates = [
    `${issuerUrl.origin}/.well-known/oauth-authorization-server${issuerUrl.pathname === '/' ? '' : issuerUrl.pathname}`,
    `${issuerUrl.origin}/.well-known/oauth-authorization-server`,
  ]
  for (const c of candidates) {
    const r = await fetch(c)
    if (r.ok) return (await r.json()) as AuthServerMetadata
  }
  throw new Error('Could not find the sign-in server for this connection.')
}

export async function registerClient(meta: AuthServerMetadata, p: { name: string; redirectUri: string; scope: string }): Promise<string> {
  if (!meta.registration_endpoint) throw new Error('This server does not allow apps to register.')
  const res = await fetch(meta.registration_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_name: p.name,
      redirect_uris: [p.redirectUri],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      scope: p.scope,
    }),
  })
  const json = (await res.json()) as { client_id?: string; error_description?: string }
  if (!res.ok || !json.client_id) throw new Error(json.error_description || 'App registration was refused.')
  return json.client_id
}

export async function exchangeCode(meta: AuthServerMetadata, p: {
  code: string; verifier: string; clientId: string; redirectUri: string; resource: string; encoding?: 'form' | 'json'
}): Promise<Tokens> {
  return toTokens(await postForm(meta.token_endpoint, {
    grant_type: 'authorization_code',
    code: p.code,
    code_verifier: p.verifier,
    client_id: p.clientId,
    redirect_uri: p.redirectUri,
    resource: p.resource,
  }, p.encoding))
}

export async function refreshTokens(meta: AuthServerMetadata, t: Tokens, clientId: string, resource: string, encoding: 'form' | 'json' = 'form'): Promise<Tokens> {
  if (!t.refresh_token) throw new Error('Session expired. Connect again.')
  const next = toTokens(await postForm(meta.token_endpoint, {
    grant_type: 'refresh_token', refresh_token: t.refresh_token, client_id: clientId, resource,
  }, encoding))
  return { ...next, refresh_token: next.refresh_token ?? t.refresh_token }
}
