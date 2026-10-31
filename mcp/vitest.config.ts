import path from 'node:path'
import { defineConfig } from 'vitest/config'

// Same seams as tsconfig.json and scripts/build.mjs: the shared core with desktop native modules.
export default defineConfig({
  // mobile/ files would otherwise be transformed with mobile/tsconfig.json, which extends expo's (not installed here).
  tsconfig: path.resolve(import.meta.dirname, 'tsconfig.json'),
  resolve: {
    alias: [
      { find: '@/native/platformSession', replacement: path.resolve(import.meta.dirname, 'src/host/platformSession.ts') },
      { find: '@/native/kv', replacement: path.resolve(import.meta.dirname, 'src/host/kv.ts') },
      { find: /^react-native$/, replacement: path.resolve(import.meta.dirname, 'src/host/react-native.ts') },
      { find: '@', replacement: path.resolve(import.meta.dirname, '../mobile/src') },
    ],
  },
  test: { environment: 'node', include: ['test/**/*.test.ts'], setupFiles: ['test/setup.ts'], testTimeout: 60000 },
})
