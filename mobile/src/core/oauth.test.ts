import { describe, expect, it } from 'vitest'
import { pickResponse, parseSse } from './mcp'
import { authorizeUrl, createPkce, needsRefresh, parseRedirect, resourceMetadataUrl, toTokens } from './oauth'

const meta = { issuer: 'https://mcp.swiggy.com/auth', authorization_endpoint: 'https://mcp.swiggy.com/auth/authorize', token_endpoint: 'https://mcp.swiggy.com/auth/token' }

describe('oauth', () => {
  it('makes an S256 PKCE pair', async () => {
    const { verifier, challenge } = await createPkce()
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/)
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))
    expect(challenge).toBe(Buffer.from(digest).toString('base64url'))
  })
  it("reads Swiggy's resource metadata pointer", () => {
    expect(resourceMetadataUrl('Bearer realm="mcp", resource_metadata="https://mcp.swiggy.com/.well-known/oauth-protected-resource"'))
      .toBe('https://mcp.swiggy.com/.well-known/oauth-protected-resource')
  })
  it('builds the authorize URL with PKCE and resource', () => {
    const u = new URL(authorizeUrl(meta, { clientId: 'c', redirectUri: 'http://localhost/cb', challenge: 'ch', state: 's', scope: 'mcp:tools', resource: 'https://mcp.swiggy.com/instamart' }))
    expect(u.searchParams.get('code_challenge_method')).toBe('S256')
    expect(u.searchParams.get('resource')).toBe('https://mcp.swiggy.com/instamart')
    expect(u.searchParams.get('response_type')).toBe('code')
  })
  it('accepts the code only when state matches', () => {
    expect(parseRedirect('http://localhost/cb?code=abc&state=s1', 's1')).toBe('abc')
    expect(() => parseRedirect('http://localhost/cb?code=abc&state=evil', 's1')).toThrow()
    expect(() => parseRedirect('http://localhost/cb?error=access_denied&state=s1', 's1')).toThrow(/access_denied/)
  })
  it('computes expiry and refresh window', () => {
    const t = toTokens({ access_token: 'a', refresh_token: 'r', expires_in: 3600 }, 0)
    expect(t.expires_at).toBe(3_600_000)
    expect(needsRefresh(t, 3_600_000 - 30_000)).toBe(true)
    expect(needsRefresh(t, 0)).toBe(false)
  })
})

describe('mcp', () => {
  it('parses SSE responses and picks the matching id', () => {
    const body = 'event: message\ndata: {"jsonrpc":"2.0","id":2,"result":{"tools":[{"name":"search_products"}]}}\n\n: ping\n\n'
    expect(pickResponse(parseSse(body), 2)).toEqual({ tools: [{ name: 'search_products' }] })
  })
  it('surfaces JSON-RPC errors', () => {
    expect(() => pickResponse([{ jsonrpc: '2.0', id: 1, error: { code: -32601, message: 'Method not found' } }], 1)).toThrow('Method not found')
  })
})
