import { describe, expect, it } from 'vitest'
import { ACCOUNT_CONFIG, judgeWebSignIn } from './accounts'
import { PLATFORMS } from './platforms'

describe('accounts', () => {
  it('has a sign-in config for every platform, with Swiggy Instamart over MCP', () => {
    for (const p of PLATFORMS) expect(ACCOUNT_CONFIG[p.id].loginUrl).toMatch(/^https:\/\//)
    expect(ACCOUNT_CONFIG.instamart.method).toBe('mcp')
    expect(ACCOUNT_CONFIG.blinkit.method).toBe('web')
  })
  it('marks a cookie sign-in unverified until session cookie names are known', () => {
    expect(judgeWebSignIn({ ...ACCOUNT_CONFIG.blinkit, sessionCookies: [] }, ['x'])).toEqual({ status: 'connected', verified: false })
  })
  it('verifies a cookie sign-in from known session cookies', () => {
    const cfg = { ...ACCOUNT_CONFIG.blinkit, sessionCookies: ['example_session'] }
    expect(judgeWebSignIn(cfg, ['foo', 'example_session'])).toEqual({ status: 'connected', verified: true })
    expect(judgeWebSignIn(cfg, ['foo']).status).toBe('disconnected')
  })
})
