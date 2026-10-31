import { mkdirSync } from 'node:fs'
import { chromium, type BrowserContext, type Page } from 'playwright-core'
import { profileDir } from './paths'

export interface PageResult { ok: boolean; value?: unknown; error?: string }
export interface SignInOptions {
  url: string; title?: string; interceptPrefix?: string
  doneCookies?: string[]; doneOrigins?: string[]; doneScript?: string; hint?: string; doneLabel?: string
}
export interface SignInResult { kind: 'done' | 'redirect' | 'cancelled'; redirectUrl?: string }

/** stdout belongs to the MCP stdio transport; everything human-readable goes to stderr. */
export const log = (msg: string) => process.stderr.write(`[sasta-mcp] ${msg}\n`)

/**
 * Same wrapper the phone's hidden WebView uses (SessionHosts.tsx): the reader body runs as an async
 * function and the result crosses back as JSON, so undefined fields and Dates behave identically.
 */
export const wrapScript = (script: string) =>
  `(async()=>{try{const v=await (async()=>{${script}})();return JSON.stringify({ok:true,value:v})}catch(e){return JSON.stringify({ok:false,error:String((e&&e.message)||e)})}})()`

/** Headless Chrome announces itself; present the same browser a person would use. */
export function desktopUserAgent(ua: string) {
  const version = ua.match(/(?:Headless)?Chrome\/([\d.]+)/)?.[1] ?? '140.0.0.0'
  const major = version.split('.')[0]
  return {
    userAgent: ua.replace('HeadlessChrome/', 'Chrome/'),
    userAgentMetadata: {
      brands: [{ brand: 'Google Chrome', version: major }, { brand: 'Chromium', version: major }, { brand: 'Not=A?Brand', version: '24' }],
      fullVersion: version, platform: process.platform === 'darwin' ? 'macOS' : process.platform === 'win32' ? 'Windows' : 'Linux',
      platformVersion: '', architecture: process.arch === 'arm64' ? 'arm' : 'x86', model: '', mobile: false,
    },
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

type Mode = 'headless' | 'headed'

/**
 * The desktop stand-in for the phone's hidden WebViews: one real Chrome with a persistent profile
 * (cookies survive restarts), one tab per shopping site. Sign-in switches to a visible window.
 */
export class ChromeHost {
  private ctx?: BrowserContext
  private mode?: Mode
  private starting?: Promise<BrowserContext>
  private pages = new Map<string, Promise<Page>>()
  private ua?: ReturnType<typeof desktopUserAgent>
  private signIns = 0

  constructor(private opts: { profile?: string; headed?: boolean; executablePath?: string } = {}) {}

  private wantHeaded() { return this.opts.headed ?? process.env.SASTA_MCP_HEADED === '1' }

  /** A visible window can do headless work too; a headless one is restarted for a sign-in. */
  async context(mode: Mode = 'headless'): Promise<BrowserContext> {
    const want: Mode = this.wantHeaded() ? 'headed' : mode
    if (this.starting) await this.starting.catch(() => {})
    if (this.ctx && (this.mode === want || this.mode === 'headed')) return this.ctx
    if (this.ctx) await this.close()
    this.starting = this.launch(want)
    try { return await this.starting } finally { this.starting = undefined }
  }

  private async launch(mode: Mode) {
    const dir = this.opts.profile ?? profileDir()
    mkdirSync(dir, { recursive: true, mode: 0o700 })
    const executablePath = this.opts.executablePath ?? process.env.SASTA_CHROME_PATH
    let ctx: BrowserContext
    try {
      ctx = await chromium.launchPersistentContext(dir, {
        ...(executablePath ? { executablePath } : { channel: 'chrome' }),
        headless: mode === 'headless',
        args: ['--disable-blink-features=AutomationControlled', '--no-first-run', '--no-default-browser-check'],
        ignoreDefaultArgs: ['--enable-automation'],
        viewport: mode === 'headless' ? { width: 1280, height: 900 } : null,
        locale: 'en-IN', timezoneId: 'Asia/Kolkata',
      })
    } catch (e) {
      const msg = String((e as Error).message || e)
      if (/ProcessSingleton|profile.*in use|SingletonLock/i.test(msg)) throw new Error(`Another Sasta MCP server is using ${dir}. Run one server (use --http to share it) or set SASTA_MCP_HOME.`)
      if (/executable|not found|install/i.test(msg)) throw new Error('Google Chrome was not found. Install Chrome, or set SASTA_CHROME_PATH to a Chrome or Chromium binary.')
      throw e
    }
    if (mode === 'headless' && !this.ua) {
      const probe = ctx.pages()[0] ?? await ctx.newPage()
      this.ua = desktopUserAgent(await probe.evaluate(() => navigator.userAgent))
    }
    for (const p of ctx.pages()) await p.close().catch(() => {})
    ctx.on('close', () => { if (this.ctx === ctx) { this.ctx = undefined; this.mode = undefined; this.pages.clear() } })
    this.ctx = ctx
    this.mode = mode
    return ctx
  }

  private async newPage(ctx: BrowserContext) {
    const page = await ctx.newPage()
    if (this.mode === 'headless' && this.ua) {
      const cdp = await ctx.newCDPSession(page)
      await cdp.send('Emulation.setUserAgentOverride', { userAgent: this.ua.userAgent, userAgentMetadata: this.ua.userAgentMetadata, acceptLanguage: 'en-IN,en;q=0.9' })
    }
    return page
  }

  /** The site's tab, loaded at `path` the first time (the phone loads `origin + path` once per page). */
  private page(origin: string, path: string, timeoutMs: number): Promise<Page> {
    const open = this.pages.get(origin)
    if (open) return open
    const loading = (async () => {
      const ctx = await this.context()
      const page = await this.newPage(ctx)
      page.on('close', () => { if (this.pages.get(origin) === loading) this.pages.delete(origin) })
      // Like the WebView's onHttpError: an error status on the page itself fails the run (an empty error body makes goto throw).
      let status: number | undefined
      page.on('response', (r) => { if (r.request().isNavigationRequest() && r.frame() === page.mainFrame()) status = r.status() })
      const failed = () => status !== undefined && status >= 400 ? new Error(`Shopping site returned HTTP ${status}`) : undefined
      const res = await page.goto(origin + path, { waitUntil: 'load', timeout: timeoutMs }).catch((e) => { throw failed() ?? e })
      if (res && res.status() >= 400) throw new Error(`Shopping site returned HTTP ${res.status()}`)
      return page
    })()
    this.pages.set(origin, loading)
    loading.catch(() => { if (this.pages.get(origin) === loading) { this.pages.delete(origin); void loading.then((p) => p.close(), () => {}) } })
    return loading
  }

  async pageRun({ origin, script, timeoutMs = 12000, path = '/robots.txt' }: { origin: string; script: string; timeoutMs?: number; path?: string }): Promise<PageResult> {
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<PageResult>((resolve) => { timer = setTimeout(() => resolve({ ok: false, error: 'Timed out' }), timeoutMs) })
    const run = (async (): Promise<PageResult> => {
      try {
        const page = await this.page(origin, path, timeoutMs)
        // A site that redirects while loading (e.g. to pick an area) gets the reader on the page it settles on.
        for (let attempt = 0; ; attempt++) {
          try {
            return JSON.parse(await page.evaluate(wrapScript(script)) as string) as PageResult
          } catch (e) {
            if (attempt >= 2 || !/Execution context was destroyed|navigation/i.test(String((e as Error)?.message))) throw e
            await sleep(300)
            await page.waitForLoadState('load', { timeout: timeoutMs }).catch(() => {})
          }
        }
      } catch (e) {
        const msg = String((e as Error)?.message || e)
        if (/Timeout .*exceeded/i.test(msg)) return { ok: false, error: 'Timed out' }
        // The reader navigated or the tab died: same as the WebView never answering.
        if (/Execution context was destroyed|Target .*closed|navigation/i.test(msg)) return { ok: false, error: 'Page reset' }
        return { ok: false, error: msg.split('\n')[0] }
      }
    })()
    try { return await Promise.race([run, timeout]) } finally { clearTimeout(timer) }
  }

  async pageReset(origin: string) {
    const open = this.pages.get(origin)
    this.pages.delete(origin)
    if (open) await open.then((p) => p.close(), () => {})
  }

  /** The platform's own sign-in page in a visible Chrome window. Sasta never sees the OTP. */
  async signIn(opts: SignInOptions, timeoutMs = 10 * 60 * 1000): Promise<SignInResult> {
    this.signIns++
    const ctx = await this.context('headed')
    const page = await ctx.newPage()
    let settle!: (r: SignInResult) => void
    const done = new Promise<SignInResult>((r) => { settle = r })
    const prefix = opts.interceptPrefix
    const intercept = (url: URL) => !!prefix && url.href.startsWith(prefix)
    const onRedirect = async (route: import('playwright-core').Route) => {
      settle({ kind: 'redirect', redirectUrl: route.request().url() })
      await route.abort().catch(() => {})
    }
    if (prefix) await ctx.route(intercept, onRedirect)
    page.on('close', () => settle({ kind: 'cancelled' }))
    log(`${opts.title ?? 'Sign in'}: finish in the Chrome window that just opened.${opts.hint ? ` ${opts.hint}` : ''}`)
    let stop = false
    const watch = (async () => {
      while (!stop) {
        await sleep(1500)
        if (stop) return
        try {
          if (opts.doneCookies?.length) {
            const names = new Set((await ctx.cookies(opts.doneOrigins ?? [opts.url])).map((c) => c.name))
            if (opts.doneCookies.some((n) => names.has(n))) return settle({ kind: 'done' })
          }
          if (opts.doneScript && await page.evaluate(`(function(){try{return !!(${opts.doneScript})}catch(e){return false}})()`)) return settle({ kind: 'done' })
        } catch { /* page navigating */ }
      }
    })()
    const timer = setTimeout(() => settle({ kind: 'cancelled' }), timeoutMs)
    try {
      await page.goto(opts.url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch((e) => {
        if (!prefix || !String(e).includes('ERR_FAILED')) log(`Could not open ${opts.url}: ${String(e.message || e).split('\n')[0]}`)
      })
      return await done
    } finally {
      stop = true
      clearTimeout(timer)
      await watch
      if (prefix) await ctx.unroute(intercept, onRedirect).catch(() => {})
      await page.close().catch(() => {})
      // Back to an invisible browser once nobody is signing in.
      if (--this.signIns === 0 && !this.wantHeaded()) await this.close()
    }
  }

  /** The site in a visible window for the user to choose a delivery area or sign in; resolves when they close it. */
  async openForUser(url: string, timeoutMs = 15 * 60 * 1000): Promise<void> {
    await this.signIn({ url, title: `Opened ${new URL(url).hostname}`, hint: 'Choose the delivery area (and sign in if you like), then close the tab.' }, timeoutMs)
  }

  async cookieNames(urls: string[]): Promise<string[]> {
    const ctx = await this.context()
    return [...new Set((await ctx.cookies(urls)).map((c) => c.name))]
  }

  /** Removes the site's cookies and storage, like signing out on the phone. */
  async clearSession(urls: string[]) {
    const ctx = await this.context()
    for (const c of await ctx.cookies(urls)) await ctx.clearCookies({ name: c.name, domain: c.domain, path: c.path })
    const origins = [...new Set(urls.map((u) => new URL(u).origin))]
    for (const origin of origins) await this.pageReset(origin)
    const page = await ctx.newPage()
    try {
      const cdp = await ctx.newCDPSession(page)
      for (const origin of origins) await cdp.send('Storage.clearDataForOrigin', { origin, storageTypes: 'all' }).catch(() => {})
    } finally { await page.close().catch(() => {}) }
  }

  async close() {
    const ctx = this.ctx
    this.ctx = undefined
    this.mode = undefined
    this.pages.clear()
    if (ctx) await ctx.close().catch(() => {})
  }
}

export const chrome = new ChromeHost()
