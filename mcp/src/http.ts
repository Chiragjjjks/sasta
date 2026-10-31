import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer as createHttpServer, type IncomingMessage } from 'node:http'
import { join } from 'node:path'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { log } from './host/chrome'
import { home, readJson, writeJson } from './host/paths'
import type { Sasta } from './sasta'
import { createServer, VERSION } from './tools'

/** One token per machine, kept with the other secrets (0600), unless SASTA_MCP_TOKEN overrides it. */
export function httpToken(): string {
  if (process.env.SASTA_MCP_TOKEN) return process.env.SASTA_MCP_TOKEN
  const file = join(home(), 'http-token.json')
  const saved = readJson<{ token?: string }>(file, {}).token
  if (saved) return saved
  const token = randomBytes(24).toString('base64url')
  writeJson(file, { token }, true)
  return token
}

export function authorized(req: IncomingMessage, token: string): boolean {
  const got = Buffer.from((req.headers.authorization ?? '').replace(/^Bearer\s+/i, ''))
  const want = Buffer.from(token)
  return got.length === want.length && timingSafeEqual(got, want)
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const c of req) { size += (c as Buffer).length; if (size > 1_000_000) throw new Error('Request too large'); chunks.push(c as Buffer) }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : undefined
}

export async function serveHttp(sasta: Sasta, opts: { port: number; host: string; token?: string }) {
  const { port, host } = opts
  const token = opts.token ?? httpToken()
  const http = createHttpServer(async (req, res) => {
    const path = new URL(req.url ?? '/', 'http://x').pathname
    if (path === '/health') { res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true, version: VERSION })); return }
    if (path !== '/mcp') { res.writeHead(404).end(); return }
    if (!authorized(req, token)) { res.writeHead(401, { 'www-authenticate': 'Bearer' }).end('Unauthorized'); return }
    try {
      // Stateless: a fresh protocol server per request, sharing one Sasta (one Chrome, one cache).
      const server = createServer(sasta)
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
      res.on('close', () => { void transport.close(); void server.close() })
      await server.connect(transport)
      await transport.handleRequest(req, res, req.method === 'POST' ? await readBody(req) : undefined)
    } catch (e) {
      if (!res.headersSent) res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32700, message: String((e as Error).message) }, id: null }))
    }
  })
  await new Promise<void>((resolve) => http.listen(port, host, resolve))
  if (host !== '127.0.0.1' && host !== 'localhost') log(`Listening on ${host}: anyone on this network with the token can search as you.`)
  const address = http.address()
  const bound = typeof address === 'object' && address ? address.port : port
  return { url: `http://${host}:${bound}/mcp`, close: () => new Promise<void>((r) => http.close(() => r())) }
}

