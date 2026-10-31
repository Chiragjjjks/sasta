import { existsSync, mkdtempSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ChromeHost, desktopUserAgent, wrapScript } from '../src/host/chrome'

describe('page script wrapper', () => {
  it('runs a reader body and crosses back as JSON, like the WebView', async () => {
    expect(JSON.parse(await (0, eval)(wrapScript('return { a: 1, b: undefined, when: new Date(0) }')))).toEqual({ ok: true, value: { a: 1, when: '1970-01-01T00:00:00.000Z' } })
    expect(JSON.parse(await (0, eval)(wrapScript('throw new Error("blocked:403")')))).toEqual({ ok: false, error: 'blocked:403' })
  })
  it('presents headless Chrome as ordinary Chrome', () => {
    const ua = desktopUserAgent('Mozilla/5.0 (Macintosh) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/141.0.7390.54 Safari/537.36')
    expect(ua.userAgent).not.toContain('Headless')
    expect(ua.userAgent).toContain('Chrome/141.0.7390.54')
    expect(ua.userAgentMetadata.brands[0]).toEqual({ brand: 'Google Chrome', version: '141' })
  })
})

const chromePath = process.env.SASTA_CHROME_PATH ?? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable'].find(existsSync)

// The real browser, against a local page: no shopping site is contacted.
describe.skipIf(!chromePath)('Chrome host', () => {
  it('loads a site once, runs readers in it, survives a redirect and resets', async () => {
    let hits = 0
    const server = createServer((req, res) => {
      if (req.url === '/hop') { res.writeHead(200, { 'content-type': 'text/html' }).end('<script>setTimeout(()=>location.href="/landed",50)</script>'); return }
      if (req.url === '/missing' || req.url === '/favicon.ico') { res.writeHead(404).end(); return }
      hits++
      res.writeHead(200, { 'content-type': 'text/html', 'set-cookie': 'sid=1; Path=/' }).end(`<title>${req.url}</title><p>ok</p>`)
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`
    const host = new ChromeHost({ profile: mkdtempSync(join(tmpdir(), 'sasta-chrome-')), executablePath: chromePath })
    try {
      expect(await host.pageRun({ origin, path: '/start', script: 'return document.title + ":" + navigator.userAgent.includes("Headless")' })).toEqual({ ok: true, value: '/start:false' })
      expect(await host.pageRun({ origin, path: '/other', script: 'return location.pathname' })).toEqual({ ok: true, value: '/start' })
      expect(hits).toBe(1)
      expect(await host.pageRun({ origin, script: 'await new Promise(r => setTimeout(r, 5000)); return 1', timeoutMs: 300 })).toEqual({ ok: false, error: 'Timed out' })
      await host.pageReset(origin)
      expect(await host.pageRun({ origin, path: '/hop', script: 'await new Promise(r => setTimeout(r, 400)); return location.pathname', timeoutMs: 8000 })).toEqual({ ok: true, value: '/landed' })
      await host.pageReset(origin)
      expect((await host.pageRun({ origin, path: '/missing', script: 'return 1' })).error).toBe('Shopping site returned HTTP 404')
      expect(await host.cookieNames([origin])).toContain('sid')
      await host.clearSession([origin])
      expect(await host.cookieNames([origin])).toEqual([])
    } finally {
      await host.close()
      server.close()
    }
  })
})
