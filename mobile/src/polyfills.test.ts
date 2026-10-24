import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('react-native-url-polyfill/auto', () => ({}))
vi.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA256' },
  digest: async (_algorithm: string, data: Uint8Array) => new Uint8Array(createHash('sha256').update(data).digest()).buffer,
  getRandomValues: (data: Uint8Array) => data.fill(7),
  randomUUID: () => 'test-uuid',
}))
const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto')!
afterEach(() => { Object.defineProperty(globalThis, 'crypto', original); vi.resetModules() })

describe('crypto bootstrap', () => {
  it('preserves a browser crypto object with a read-only getter', async () => {
    const browserCrypto = { getRandomValues: vi.fn(), subtle: {}, randomUUID: vi.fn() }
    Object.defineProperty(globalThis, 'crypto', { get: () => browserCrypto, configurable: true })
    await import('./polyfills')
    expect(globalThis.crypto).toBe(browserCrypto)
  })

  it('hashes only the specified bytes when installing the native digest polyfill', async () => {
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true })
    await import('./polyfills')
    const bytes = new Uint8Array([99, 1, 2, 3, 99])
    const hash = await crypto.subtle.digest('SHA-256', bytes.subarray(1, 4))
    expect(Buffer.from(hash).toString('hex')).toBe(createHash('sha256').update(new Uint8Array([1, 2, 3])).digest('hex'))
  })
})
