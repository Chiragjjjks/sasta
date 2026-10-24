import { defineConfig } from 'vitest/config'
import { fileURLToPath, URL } from 'node:url'

// The archived Capacitor implementation has its own tests; mobile/ has its own config.
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { include: ['src/**/*.test.ts'] },
})
