import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: [
      { find: '@/native/platformSession', replacement: path.resolve(import.meta.dirname, 'test/stubs/platformSession.ts') },
      { find: '@/native/kv', replacement: path.resolve(import.meta.dirname, 'test/stubs/kv.ts') },
      { find: /^react-native$/, replacement: path.resolve(import.meta.dirname, 'test/stubs/react-native.ts') },
      { find: '@', replacement: path.resolve(import.meta.dirname, 'src') },
    ],
  },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
