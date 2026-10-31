// Bundles the server and the shared mobile/src/core into one file. Only the native seams are swapped
// for desktop versions (same aliases as tsconfig.json and vitest.config.ts).
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const here = fileURLToPath(new URL('..', import.meta.url))
const alias = {
  '@/native/platformSession': resolve(here, 'src/host/platformSession.ts'),
  '@/native/kv': resolve(here, 'src/host/kv.ts'),
  'react-native': resolve(here, 'src/host/react-native.ts'),
}

await build({
  entryPoints: [resolve(here, 'src/index.ts')],
  outfile: resolve(here, 'dist/sasta-mcp.mjs'),
  bundle: true, platform: 'node', format: 'esm', target: 'node22', sourcemap: true,
  banner: { js: '#!/usr/bin/env node\nimport { createRequire as __cr } from "node:module"; const require = __cr(import.meta.url);' },
  // Real dependencies stay in node_modules; everything from mobile/ is inlined.
  external: ['playwright-core', '@modelcontextprotocol/sdk', 'zod'],
  plugins: [{
    name: 'sasta-alias',
    setup(b) {
      b.onResolve({ filter: /^(@\/native\/(platformSession|kv)|react-native)$/ }, (a) => ({ path: alias[a.path] }))
      b.onResolve({ filter: /^@\// }, (a) => b.resolve('./' + a.path.slice(2), { resolveDir: resolve(here, '../mobile/src'), kind: a.kind }))
      b.onResolve({ filter: /^expo|^@react-native|^react$/ }, (a) => ({ path: a.path, namespace: 'native-only' }))
      b.onLoad({ filter: /.*/, namespace: 'native-only' }, (a) => ({ contents: `throw new Error(${JSON.stringify(a.path + ' is not available in the MCP server')})`, loader: 'js' }))
    },
  }],
  logLevel: 'info',
})
