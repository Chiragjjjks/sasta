import type { ConnectionTest } from './accounts'
import { runSearch } from './search'
import type { Adapter, AdapterStatus, Location, Offer, Platform } from './types'

export interface SearchProbe { query: string; status: AdapterStatus; offers: Offer[] }
export async function probeSearch(platform: Platform, adapter: Adapter | undefined, query: string, location: Location): Promise<SearchProbe> {
  let status: AdapterStatus = { platform, state: 'unavailable', count: 0, error: 'Search has not been added for this app.' }
  let offers: Offer[] = []
  if (adapter) await runSearch([adapter], query, location, new AbortController().signal, {
    onStatus: s => { status = s }, onOffers: (_p, rows) => { offers = rows },
  }, { force: true })
  return { query, status, offers }
}
export function connectionReport(session: ConnectionTest, probe: SearchProbe) {
  const { status, query } = probe
  const sessionLabel = session.ok ? 'Login verified' : 'Login not verified'
  const ok = status.state === 'done' && status.count > 0
  const detail = status.state === 'done'
    ? `${sessionLabel} · ${status.count} matching ${status.count === 1 ? 'product' : 'products'} for “${query}”`
    : `${sessionLabel} · ${status.error || (status.state === 'needs_login' ? 'sign in again to search' : status.state === 'timeout' ? 'search timed out' : 'search could not complete')}`
  return { ok, detail, sessionOk: session.ok, search: { ...status, query }, at: Date.now() }
}
