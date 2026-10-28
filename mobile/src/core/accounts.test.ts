import { describe, expect, it } from 'vitest'
import { ACCOUNT_CONFIG, judgeWebSignIn } from './accounts'
import { PLATFORMS } from './platforms'

describe('accounts', () => {
  it('has a sign-in config for every platform, with Swiggy Instamart over MCP', () => {
    for (const p of PLATFORMS) expect(ACCOUNT_CONFIG[p.id].loginUrl).toMatch(/^https:\/\//)
    expect(ACCOUNT_CONFIG.instamart.method).toBe('mcp')
    expect(ACCOUNT_CONFIG.blinkit.method).toBe('web')
  })
  it('knows the session cookies for Blinkit and Zepto', () => {
    expect(judgeWebSignIn(ACCOUNT_CONFIG.blinkit, ['gr_1_deviceId', 'gr_1_accessToken'])).toEqual({ status: 'connected', verified: true })
    expect(judgeWebSignIn(ACCOUNT_CONFIG.zepto.webFallback!, ['session_id']).status).toBe('disconnected')
    expect(judgeWebSignIn(ACCOUNT_CONFIG.zepto.webFallback!, ['session_id', 'user_id']).status).toBe('connected')
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

describe('learning session cookies on the phone', () => {
  it('keeps only new, session-looking cookies', async () => {
    const { learnSessionCookies } = await import('./accounts')
    const before = ['T', 'vh', '_ga', 'session-id']
    const after = [...before, '_gid', 'at', 'rt', 'ud', 'SN', 'fonts-loaded']
    expect(learnSessionCookies(before, after)).toEqual(['at', 'rt', 'SN'])
  })
  it('uses learned cookies when the platform has no known signal', () => {
    const cfg = { sessionCookies: [] as string[] }
    expect(judgeWebSignIn(cfg, ['at'], ['at']).status).toBe('connected')
    expect(judgeWebSignIn(cfg, ['T'], ['at']).status).toBe('disconnected')
  })
  it('checks Zepto on its new domain and Amazon by its sign-in cookies', () => {
    expect(ACCOUNT_CONFIG.zepto.webFallback!.origins).toContain('https://www.zepto.com')
    expect(judgeWebSignIn(ACCOUNT_CONFIG.amazon_now, ['session-id', 'ubid-acbin']).status).toBe('disconnected')
    expect(judgeWebSignIn(ACCOUNT_CONFIG.amazon_now, ['session-id', 'at-acbin']).status).toBe('connected')
  })
})
