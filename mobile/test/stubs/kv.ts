const mem = new Map<string, string>()
export const Preferences = {
  async get({ key }: { key: string }) { return { value: mem.get(key) ?? null } },
  async set({ key, value }: { key: string; value: string }) { mem.set(key, value) },
  async remove({ key }: { key: string }) { mem.delete(key) },
}
