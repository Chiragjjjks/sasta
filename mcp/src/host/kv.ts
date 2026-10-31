import { join } from 'node:path'
import { home, readJson, writeJson } from './paths'

/** Desktop stand-in for mobile/src/native/kv.ts: non-secret preferences in ~/.sasta/mcp/prefs.json. */
const file = () => join(home(), 'prefs.json')

export const Preferences = {
  async get({ key }: { key: string }): Promise<{ value: string | null }> {
    return { value: readJson<Record<string, string>>(file(), {})[key] ?? null }
  },
  async set({ key, value }: { key: string; value: string }): Promise<void> {
    writeJson(file(), { ...readJson<Record<string, string>>(file(), {}), [key]: value })
  },
  async remove({ key }: { key: string }): Promise<void> {
    const all = readJson<Record<string, string>>(file(), {})
    delete all[key]
    writeJson(file(), all)
  },
}
