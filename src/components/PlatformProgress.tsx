import { Check, Clock, Loader2, Lock, TriangleAlert } from 'lucide-react'
import { PLATFORM, PLATFORMS } from '@/lib/platforms'
import type { AdapterStatus, Platform } from '@/lib/types'

const LABEL: Record<AdapterStatus['state'], (s: AdapterStatus) => string> = {
  searching: () => 'Searching…',
  done: (s) => (s.count ? `${s.count} matches` : 'No matches'),
  failed: () => 'Failed',
  timeout: () => 'Timed out',
  needs_login: () => 'Needs login · skipped',
  unavailable: () => 'Not live yet',
}

/** Per-platform rows shown while a search is in flight. */
export function PlatformProgress({ statuses }: { statuses: Partial<Record<Platform, AdapterStatus>> }) {
  return (
    <ul className="rise divide-y divide-line overflow-hidden rounded-card bg-surface">
      {PLATFORMS.map((p) => {
        const s = statuses[p.id] ?? { platform: p.id, state: 'searching' as const, count: 0 }
        return (
          <li key={p.id} className="flex items-center gap-3 px-4 py-3">
            <span className="size-2.5 rounded-full" style={{ background: PLATFORM[p.id].color }} />
            <span className="flex-1 text-[14px] font-semibold">{p.name}</span>
            <span className="text-[13px] text-muted">{LABEL[s.state](s)}</span>
            {s.state === 'searching' && <Loader2 className="size-4 animate-spin text-faint" />}
            {s.state === 'done' && <Check className="size-4 text-good" />}
            {(s.state === 'failed' || s.state === 'timeout') && <TriangleAlert className="size-4 text-accent" />}
            {s.state === 'needs_login' && <Lock className="size-4 text-faint" />}
            {s.state === 'unavailable' && <Clock className="size-4 text-faint" />}
          </li>
        )
      })}
    </ul>
  )
}

export function PlatformDots({ statuses }: { statuses: Partial<Record<Platform, AdapterStatus>> }) {
  return (
    <div className="flex gap-1">
      {PLATFORMS.map((p) => {
        const s = statuses[p.id]
        const ok = s?.state === 'done'
        return (
          <span
            key={p.id}
            title={`${p.name}${s ? ` · ${LABEL[s.state](s)}` : ''}`}
            className="size-2 rounded-full transition-opacity"
            style={{ background: p.color, opacity: ok ? 1 : 0.25 }}
          />
        )
      })}
    </div>
  )
}
