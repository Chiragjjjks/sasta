// Browser preview: there is no shared Android cookie store.
const SastaNative = {
  async legacyPreference(_key: string): Promise<string | null> { return null },
  async removeLegacyPreference(_key: string): Promise<void> {},
  async legacySwiggySecret(): Promise<string | null> { return null },
  async removeLegacySwiggySecret(): Promise<void> {},
  async cookieNames(_urls: string[]): Promise<string[]> { return [] },
  async clearSession(_urls: string[]): Promise<void> {},
  async flushCookies(): Promise<void> {},
}
export default SastaNative
