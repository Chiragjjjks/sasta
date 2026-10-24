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
  private sessionId?: string
  private nextId = 1
  private initialized = false

  constructor(private url: string, private getToken: () => Promise<string>, private signal?: AbortSignal) {}

  private async send(method: string, params?: unknown, notify = false): Promise<unknown> {
    if (this.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const id = notify ? undefined : this.nextId++
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': MCP_PROTOCOL_VERSION,
      Authorization: `Bearer ${await this.getToken()}`,
    }
    if (this.sessionId) headers['Mcp-Session-Id'] = this.sessionId
    const res = await fetch(this.url, { method: 'POST', headers, signal: this.signal, body: JSON.stringify({ jsonrpc: '2.0', id, method, params }) })
    if (res.status === 401 || res.status === 403) throw new McpAuthError()
    const sid = res.headers.get('mcp-session-id')
    if (sid) this.sessionId = sid
    if (!res.ok) throw new Error(`Server error ${res.status}`)
    if (notify) return undefined
    const text = await res.text()
    const messages = (res.headers.get('content-type') ?? '').includes('text/event-stream') ? parseSse(text) : [JSON.parse(text)]
    return pickResponse(messages, id!)
  }

  async initialize(): Promise<void> {
    if (this.initialized) return
    await this.send('initialize', {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'sasta-android', version: '0.3.2' },
    })
    await this.send('notifications/initialized', undefined, true)
    this.initialized = true
  }

  async listTools(): Promise<McpTool[]> {
    await this.initialize()
    const r = (await this.send('tools/list', {})) as { tools?: McpTool[] }
    return r.tools ?? []
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    await this.initialize()
    return this.send('tools/call', { name, arguments: args })
  }
}
