import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { chrome, log } from './host/chrome'
import { home } from './host/paths'
import { httpToken, serveHttp } from './http'
import { Sasta } from './sasta'
import { createServer, VERSION } from './tools'

const HELP = `sasta-mcp ${VERSION}: Sasta's price comparison as an MCP server

Usage:
  sasta-mcp                      stdio server (Claude Desktop, Claude Code, Codex)
  sasta-mcp http [--port 8723] [--host 127.0.0.1]
                                 Streamable HTTP at http://HOST:PORT/mcp, bearer token required
  sasta-mcp token                print the HTTP bearer token
  sasta-mcp connect <app>        sign in to blinkit|zepto|instamart|bigbasket|flipkart_minutes|amazon_now
  sasta-mcp open <app>           open the app's site to choose its delivery area
  sasta-mcp search <product>     one-off grocery search, JSON on stdout
  sasta-mcp food <dish>          one-off food search, JSON on stdout
  sasta-mcp location [pincode [lat lng [label]]]

Data lives in ${home()} (Chrome profile, location, tokens). SASTA_MCP_HEADED=1 shows the browser.`

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(name)
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !all[i - 1]?.startsWith('--'))
  const sasta = new Sasta()
  const shutdown = async () => { await chrome.close(); process.exit(0) }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  switch (cmd) {
    case undefined: case 'stdio': {
      const server = createServer(sasta)
      await server.connect(new StdioServerTransport())
      process.stdin.on('close', shutdown)
      log(`stdio server ready (${VERSION})`)
      return
    }
    case 'http': {
      const { url } = await serveHttp(sasta, { port: Number(arg('--port', process.env.SASTA_MCP_PORT ?? '8723')), host: arg('--host', '127.0.0.1') })
      log(`HTTP MCP at ${url}  (Authorization: Bearer <token>; run "sasta-mcp token" to see it)`)
      return
    }
    case 'token': console.log(httpToken()); return
    case 'connect': {
      const acc = await sasta.connect(rest[0] as never)
      console.log(JSON.stringify(acc, null, 2))
      break
    }
    case 'open': console.log(JSON.stringify(await sasta.openApp(rest[0] as never))); break
    case 'search': {
      const only = arg('--platforms', '').split(',').filter(Boolean) as never[]
      console.log(JSON.stringify(await sasta.searchProducts(rest.join(' '), { fresh: true, platforms: only.length ? only : undefined }), null, 2))
      break
    }
    case 'food': console.log(JSON.stringify(await sasta.searchFood(rest.join(' '), { fresh: true }), null, 2)); break
    case 'location': {
      const [pincode, lat, lng, ...label] = rest
      const loc = pincode ? await sasta.setLocation({ pincode, lat: lat ? +lat : undefined, lng: lng ? +lng : undefined, label: label.join(' ') || undefined }) : await sasta.location()
      console.log(JSON.stringify(loc, null, 2))
      return
    }
    case 'help': case '-h': default: console.log(HELP); return
  }
  await chrome.close()
}

main().catch(async (e) => { log(String((e as Error)?.stack || e)); await chrome.close(); process.exit(1) })
