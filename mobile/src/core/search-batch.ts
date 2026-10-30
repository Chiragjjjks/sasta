import { groupOffers, relevance } from './normalize'
import type { SearchCallbacks } from './search'
import type { AdapterStatus, Offer, Platform, ProductGroup } from './types'

export const MAX_TERMS = 5
export type SourceRef = { batchId: string; queryId: string }
export type SectionState = 'queued' | 'searching' | 'done' | 'empty' | 'failed' | 'stopped'
export type BatchSection = {
  id: string; text: string; state: SectionState; attempt: number
  statuses: Partial<Record<Platform, AdapterStatus>>
  offers: Partial<Record<Platform, Offer[]>>
  groups: ProductGroup[]; elapsedMs: number | null
}
export type SearchBatch = { id: string; contextVersion: number; stale: boolean; sections: BatchSection[] }

export function parseTerms(text: string): { terms: string[]; rejected: string[] } {
  const seen = new Set<string>(), terms: string[] = [], rejected: string[] = []
  for (const part of text.split(/[,\n]/)) {
    const term = part.trim().replace(/\s+/g, ' '), key = term.toLowerCase()
    if (!term || seen.has(key)) continue
    seen.add(key)
    ;(terms.length < MAX_TERMS ? terms : rejected).push(term)
  }
  return { terms, rejected }
}

export function buildBatch(terms: string[], contextVersion: number, id: string): SearchBatch {
  return { id, contextVersion, stale: false, sections: terms.map((text, i) => ({
    id: `${id}-${i}`, text, state: 'queued', attempt: 0, statuses: {}, offers: {}, groups: [], elapsedMs: null,
  })) }
}

/** Called once an attempt has settled; a successful zero-match reply is still an answer. */
export function sectionState(statuses: BatchSection['statuses'], groups: ProductGroup[]): SectionState {
  return Object.values(statuses).some(s => s.state === 'done') ? (groups.length ? 'done' : 'empty') : 'failed'
}

export function rankGroups(groups: ProductGroup[], query: string): ProductGroup[] {
  return [...groups].sort((a, b) => Number(b.best.inStock) - Number(a.best.inStock)
    || relevance(b.best, query) - relevance(a.best, query) || a.best.price - b.best.price
    || (a.best.etaMinutes ?? 99) - (b.best.etaMinutes ?? 99))
}

export function batchSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    const done = () => { clearTimeout(timer); signal.removeEventListener('abort', done); resolve() }
    const timer = setTimeout(done, ms)
    signal.addEventListener('abort', done, { once: true })
    if (signal.aborted) done()
  })
}

/** Owns the queue independently of React render timing. Native callbacks may outlive an abort. */
export function createBatchScheduler(deps: {
  runSearch: (query: string, signal: AbortSignal, cb: SearchCallbacks) => Promise<void>
  sleep: (ms: number, signal: AbortSignal) => Promise<void>
  now: () => number
  contextVersion: () => number
  onChange: (batch: SearchBatch | null) => void
}) {
  let batch: SearchBatch | null = null
  let active: { id: string; ctrl: AbortController } | null = null
  let gap: AbortController | null = null
  let pumping = false, halted = false
  const publish = () => deps.onChange(batch)
  const patch = (id: string, change: Partial<BatchSection>) => {
    if (!batch) return
    batch = { ...batch, sections: batch.sections.map(s => s.id === id ? { ...s, ...change } : s) }
    publish()
  }
  const valid = (b: SearchBatch, s: BatchSection, ctrl: AbortController) => !ctrl.signal.aborted
    && batch?.id === b.id && !batch.stale && batch.contextVersion === deps.contextVersion()
    && batch.sections.some(q => q.id === s.id && q.attempt === s.attempt)
  async function pump() {
    if (pumping) return
    pumping = true
    try {
      while (batch && !batch.stale && !halted && batch.contextVersion === deps.contextVersion()) {
        const queued = batch.sections.find(s => s.state === 'queued')
        if (!queued) break
        const b = batch, ctrl = new AbortController()
        const section = { ...queued, state: 'searching' as const, attempt: queued.attempt + 1 }
        active = { id: section.id, ctrl }
        patch(section.id, section)
        const started = deps.now()
        let network = false
        const cb: SearchCallbacks = {
          onStatus: status => {
            if (!valid(b, section, ctrl)) return
            if (status.state === 'searching' || (status.ms !== undefined && status.ms > 0)) network = true
            const current = batch!.sections.find(s => s.id === section.id)!
            patch(section.id, { statuses: { ...current.statuses, [status.platform]: status } })
          },
          onOffers: (platform, offers) => {
            if (!valid(b, section, ctrl)) return
            const current = batch!.sections.find(s => s.id === section.id)!
            const next = { ...current.offers, [platform]: offers }
            patch(section.id, { offers: next, groups: rankGroups(groupOffers(Object.values(next).flat()), section.text) })
          },
        }
        // Do not wait for a native operation that ignores cancellation.
        let onAbort = () => {}
        const cancelled = new Promise<void>(resolve => { onAbort = resolve; ctrl.signal.addEventListener('abort', onAbort, { once: true }) })
        try { await Promise.race([Promise.resolve().then(() => ctrl.signal.aborted ? undefined : deps.runSearch(section.text, ctrl.signal, cb)), cancelled]) }
        catch { /* Provider errors normally arrive as statuses; unexpected failures settle the section too. */ }
        finally { ctrl.signal.removeEventListener('abort', onAbort) }
        if (valid(b, section, ctrl)) {
          const current = batch!.sections.find(s => s.id === section.id)!
          patch(section.id, { state: sectionState(current.statuses, current.groups), elapsedMs: deps.now() - started })
        }
        ctrl.abort()
        active = null
        if (network && !halted && batch?.id === b.id && !batch.stale) {
          gap = new AbortController()
          await deps.sleep(2000, gap.signal)
          gap = null
        }
      }
    } finally { pumping = false }
  }
  function stop() {
    halted = true
    active?.ctrl.abort(); gap?.abort()
    if (batch) {
      batch = { ...batch, sections: batch.sections.map(s => ['queued', 'searching'].includes(s.state) ? { ...s, state: 'stopped' } : s) }
      publish()
    }
  }
  return {
    start(next: SearchBatch) {
      stop(); batch = next; halted = false; publish()
      // An existing pump will pick up the replacement batch when its abort settles.
      void pump()
    },
    stop,
    clear() { stop(); batch = null; publish() },
    invalidate() { stop(); if (batch) { batch = { ...batch, stale: true }; publish() } },
    remove(id: string) {
      if (!batch) return
      if (active?.id === id) active.ctrl.abort()
      batch = { ...batch, sections: batch.sections.filter(s => s.id !== id) }; publish()
    },
    retry(id: string) {
      const section = batch?.sections.find(s => s.id === id)
      if (!section || batch!.stale || batch!.contextVersion !== deps.contextVersion()) return
      if (active?.id === id) active.ctrl.abort()
      patch(id, { state: 'queued', statuses: {}, offers: {}, groups: [], elapsedMs: null })
      halted = false
      void pump()
    },
  }
}
