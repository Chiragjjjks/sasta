// Node test stand-in for the React Native session layer.
export const PlatformSession = {
  async signIn() { return { kind: 'cancelled' as const } },
  async cookieNames() { return { names: [] as string[] } },
  async clearSession() {},
  async secureSet() {},
  async secureGet() { return { value: null } },
  async secureRemove() {},
  async pageRun() { return { ok: false, error: 'not in tests' } },
  async pageReset() {},
}
