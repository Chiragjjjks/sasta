import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/** Everything the server keeps lives here, outside the repo: ~/.sasta/mcp unless SASTA_MCP_HOME says otherwise. */
export const home = () => process.env.SASTA_MCP_HOME || join(homedir(), '.sasta', 'mcp')
export const profileDir = () => join(home(), 'chrome-profile')

export function readJson<T>(file: string, fallback: T): T {
  try { return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) as T : fallback } catch { return fallback }
}

/** Atomic write; `secret` files are readable by this user only. */
export function writeJson(file: string, value: unknown, secret = false) {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(value, null, 2), { mode: secret ? 0o600 : 0o644 })
  renameSync(tmp, file)
  if (secret) chmodSync(file, 0o600)
}
