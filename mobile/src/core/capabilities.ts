import { canSearch } from './adapters'
import type { Account } from './accounts'
import type { AdapterStatus, Platform } from './types'

export function searchLabel(platform: Platform, account?: Account, current?: AdapterStatus): string {
  const tested = current ?? account?.lastTest?.search
  if (!canSearch(platform)) return account?.status === 'connected' ? 'Sign-in only' : 'Search not added'
  if (tested?.state === 'needs_location') return 'Set area'
  if (tested?.state === 'needs_login') return 'Sign in'
  if (tested?.state === 'blocked') return 'Blocked'
  if (tested?.state === 'unavailable') return 'Unavailable'
  if (tested?.state === 'failed' || tested?.state === 'timeout') return 'Retry search'
  if (tested?.state === 'searching') return 'Searching'
  if (tested?.state === 'done' && tested.count > 0) return current ? 'Live prices' : 'Search tested'
  if (tested?.state === 'done') return 'No matches'
  if (account?.status === 'connected') return 'Connected'
  return platform === 'blinkit' ? 'Search enabled' : platform === 'amazon_now' ? 'Check Now' : 'Set area'
}
