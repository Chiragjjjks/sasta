/**
 * Minimal MCP client over Streamable HTTP: initialize, tools/list, tools/call.
 * Responses may be plain JSON or a server-sent event stream; both are handled.
 */

export class McpAuthError extends Error {
  constructor() { super('Not signed in, or the session expired.'); this.name = 'McpAuthError' }
}

export interface McpTool { name: string; description?: string; inputSchema?: unknown }

interface JsonRpcResponse { jsonrpc: '2.0'; id?: number | string; result?: unknown; error?: { code: number; message: string } }

export const MCP_PROTOCOL_VERSION = '2025-06-18'

/** Extracts JSON-RPC messages from an SSE body (`data:` lines, events separated by a blank line). */
export function parseSse(body: string): JsonRpcResponse[] {
  const out: JsonRpcResponse[] = []
  for (const event of body.split(/\r?\n\r?\n/)) {
    const data = event.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trimStart()).join('\n')
    if (!data) continue
    try { out.push(JSON.parse(data)) } catch { /* ignore keep-alives and partial frames */ }
  }
  return out
}

export function pickResponse(messages: JsonRpcResponse[], id: number): unknown {
  const msg = messages.find((m) => m.id === id)
  if (!msg) throw new Error('The server did not answer this request.')
  if (msg.error?.code === -32001) throw new McpAuthError()
  if (msg.error) throw new Error(msg.error.message)
  return msg.result
}

export class McpClient {
  private session?: string
  private nextId = 1
  private initialized = false

  constructor(private url: string, private getToken: () => Promise<string>, private signal?: AbortSignal) {}

  /** Server session. Zepto links the delivery location to it, so a new session needs the location again. */
  get sessionId() { return this.session }

  private async send(method: string, params?: unknown, notify = false, signal = this.signal): Promise<unknown> {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const id = notify ? undefined : this.nextId++
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': MCP_PROTOCOL_VERSION,
      Authorization: `Bearer ${await this.getToken()}`,
    }
    if (this.session) headers['Mcp-Session-Id'] = this.session
    const res = await fetch(this.url, { method: 'POST', headers, signal, body: JSON.stringify({ jsonrpc: '2.0', id, method, params }) })
    if (res.status === 401 || res.status === 403 || res.status === 419) throw new McpAuthError()
    if (res.status === 404 && this.session && method !== 'initialize') throw new McpSessionExpired()
    const sid = res.headers.get('mcp-session-id')
    if (sid) this.session = sid
    if (!res.ok) throw new Error(`Server error ${res.status}`)
    if (notify) return undefined
    const text = await res.text()
    const messages = (res.headers.get('content-type') ?? '').includes('text/event-stream') ? parseSse(text) : [JSON.parse(text)]
    return pickResponse(messages, id!)
  }

  async initialize(signal?: AbortSignal): Promise<void> {
    if (this.initialized) return
    this.session = undefined
    await this.send('initialize', {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'sasta-android', version: '0.6.0' },
    }, false, signal)
    await this.send('notifications/initialized', undefined, true, signal)
    this.initialized = true
  }

  /** Runs a request, starting a new server session once if the old one expired. */
  private async request(method: string, params: unknown, signal?: AbortSignal): Promise<unknown> {
    await this.initialize(signal)
    try { return await this.send(method, params, false, signal) }
    catch (e) {
      if (!(e instanceof McpSessionExpired)) throw e
      this.initialized = false
      await this.initialize(signal)
      return this.send(method, params, false, signal)
    }
  }

  async listTools(signal?: AbortSignal): Promise<McpTool[]> {
    const r = (await this.request('tools/list', {}, signal)) as { tools?: McpTool[] }
    return r.tools ?? []
  }

  async callTool(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
    return this.request('tools/call', { name, arguments: args }, signal ?? this.signal)
  }
}

class McpSessionExpired extends Error {
  constructor() { super('The server session expired.'); this.name = 'McpSessionExpired' }
}

const record = (v: unknown): Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {}

/** A tool result's text blocks, joined. */
export function toolText(raw: unknown): string {
  const content = record(raw).content
  return Array.isArray(content) ? content.map(record).filter(c => c.type === 'text' && typeof c.text === 'string').map(c => c.text as string).join('\n') : ''
}

/** A tool result's structured payload, or the first text block that is JSON. */
export function toolPayload(raw: unknown): Record<string, unknown> | undefined {
  const r = record(raw)
  if (r.structuredContent && typeof r.structuredContent === 'object') return record(r.structuredContent)
  const content = Array.isArray(r.content) ? r.content.map(record) : []
  for (const c of content) {
    if (c.type !== 'text' || typeof c.text !== 'string' || !/^\s*[{[]/.test(c.text)) continue
    try { return record(JSON.parse(c.text)) } catch { /* plain text */ }
  }
  return undefined
}
