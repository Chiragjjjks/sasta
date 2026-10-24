import 'react-native-url-polyfill/auto'
import * as Crypto from 'expo-crypto'

/**
 * Web APIs the shared core code uses that React Native lacks:
 * full URL/URLSearchParams (polyfilled above) and crypto.getRandomValues / crypto.subtle.digest
 * for Swiggy's PKCE sign-in.
 */
const g = globalThis as unknown as { crypto?: Record<string, unknown> }
const crypto = g.crypto ?? {}
// Browsers expose crypto through a read-only getter; assigning it crashes before startup.
if (!g.crypto) Object.defineProperty(g, 'crypto', { value: crypto, configurable: true })
if (!crypto.getRandomValues) {
  crypto.getRandomValues = <T extends ArrayBufferView>(array: T) => Crypto.getRandomValues(array as unknown as Uint8Array) as unknown as T
}
if (!crypto.subtle) {
  crypto.subtle = {
    digest: async (_algorithm: string, data: BufferSource) => {
      const view = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array((data as ArrayBufferView).buffer, (data as ArrayBufferView).byteOffset, (data as ArrayBufferView).byteLength)
      // Copy into a plain ArrayBuffer-backed array, which expo-crypto expects.
      return Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, new Uint8Array(view) as Uint8Array<ArrayBuffer>)
    },
  }
}
if (!crypto.randomUUID) crypto.randomUUID = () => Crypto.randomUUID()
