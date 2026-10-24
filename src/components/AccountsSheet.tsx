import { CheckCircle2, Loader2, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { ACCOUNT_CONFIG, type Account } from '@/lib/accounts'
import { PLATFORM, PLATFORMS } from '@/lib/platforms'
import type { Platform } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Sheet } from './Sheet'

interface Props {
  open: boolean
  accounts: Partial<Record<Platform, Account>>
  onClose: () => void
  onConnect: (p: Platform, opts?: { website?: boolean }) => Promise<Account>
  onDisconnect: (p: Platform) => Promise<void>
  canConnect: (p: Platform) => boolean
}

export function AccountsSheet({ open, accounts, onClose, onConnect, onDisconnect, canConnect }: Props) {
  const [busy, setBusy] = useState<Platform | null>(null)
  const [error, setError] = useState<{ p: Platform; msg: string } | null>(null)

  const [allRunning, setAllRunning] = useState(false)

  async function run(p: Platform, fn: (p: Platform) => Promise<unknown>) {
    setBusy(p); setError(null)
    try { await fn(p) } catch (e) { setError({ p, msg: (e as Error).message || 'Something went wrong' }) } finally { setBusy(null) }
  }

  /** Walks through every app that is not connected yet. Cancelling a sign-in stops the walk. */
  async function connectAll() {
    setAllRunning(true); setError(null)
    try {
      for (const { id } of PLATFORMS) {
        if (accounts[id]?.status === 'connected' || !canConnect(id)) continue
        setBusy(id)
        try {
          const acc = await onConnect(id)
          if (acc.status !== 'connected') break
        } catch (e) {
          setError({ p: id, msg: (e as Error).message || 'Something went wrong' })
        }
      }
    } finally { setBusy(null); setAllRunning(false) }
  }

  const connected = PLATFORMS.filter((p) => accounts[p.id]?.status === 'connected').length

  return (
    <Sheet open={open} onClose={onClose} title="Connected apps">
      <h3 className="flex items-center gap-2 font-display text-[20px] font-bold">Connected apps <span className="rounded-md bg-accent/15 px-1.5 py-0.5 font-sans text-[10.5px] font-extrabold uppercase tracking-wide text-accent">Beta</span></h3>
      <p className="mt-1 text-[13px] leading-relaxed text-muted">
        Sign in once on each app's own page to see your member prices and real delivery fees. {connected} of {PLATFORMS.length} connected.
      </p>

      {connected < PLATFORMS.length && (
        <button
          onClick={connectAll}
          disabled={allRunning || busy !== null}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-ink py-3.5 text-[14.5px] font-semibold text-bg disabled:opacity-60"
        >
          {allRunning && <Loader2 className="size-4 animate-spin" />}
          {allRunning ? 'Connecting one by one…' : connected ? `Connect the other ${PLATFORMS.length - connected}` : 'Connect all apps'}
        </button>
      )}
      {allRunning && <p className="mt-1.5 text-center text-[11.5px] text-muted">Each app opens its own sign-in page. Cancel one to stop.</p>}

      <ul className="mt-4 divide-y divide-line overflow-hidden rounded-card bg-surface">
        {PLATFORMS.map(({ id }) => {
          const cfg = ACCOUNT_CONFIG[id]
          const acc = accounts[id]
          const status = acc?.status ?? 'disconnected'
          const isBusy = busy === id
          const available = canConnect(id)
          return (
            <li key={id} className="px-4 py-3.5">
              <div className="flex items-center gap-3">
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: PLATFORM[id].color }} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[14.5px] font-semibold">
                    {PLATFORM[id].name}
                    {cfg.method === 'mcp' && (
                      <span className="rounded-md bg-good-bg px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-good">Official</span>
                    )}
                  </div>
                  <div className="text-[12px] text-muted">
                    {status === 'connected'
                      ? acc?.label ? `Connected as ${acc.label}`
                        : acc?.verified === false ? `${cfg.account} account · signed in, not verified yet`
                        : acc?.learnedCookies ? `${cfg.account} account · connected (checked on this phone)`
                        : `${cfg.account} account · connected${acc?.via === 'web' && cfg.method === 'mcp' ? ' via website' : ''}`
                      : status === 'expired' ? 'Session expired · sign in again' : `${cfg.account} account`}
                  </div>
                </div>
                {status === 'connected' ? (
                  <button
                    disabled={isBusy}
                    onClick={() => run(id, onDisconnect)}
                    className="flex items-center gap-1.5 rounded-xl bg-chip px-3 py-2 text-[12.5px] font-semibold text-muted"
                  >
                    {isBusy ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5 text-good" />}
                    Disconnect
                  </button>
                ) : (
                  <button
                    disabled={isBusy || !available}
                    onClick={() => run(id, onConnect)}
                    className={cn('flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12.5px] font-semibold', available ? 'bg-ink text-bg' : 'bg-chip text-faint')}
                  >
                    {isBusy && <Loader2 className="size-3.5 animate-spin" />}
                    {available ? (status === 'expired' ? 'Reconnect' : 'Connect') : 'Soon'}
                  </button>
                )}
              </div>
              {cfg.note && status !== 'connected' && <p className="mt-1.5 pl-5.5 text-[11.5px] text-faint">{cfg.note}</p>}
              {cfg.webFallback && status !== 'connected' && available && (
                <button disabled={isBusy} onClick={() => run(id, (p) => onConnect(p, { website: true }))} className="mt-1 pl-5.5 text-[12px] font-semibold text-ink underline underline-offset-2">
                  Or sign in on Swiggy's website
                </button>
              )}
              {acc?.tools && acc.tools.length > 0 && (
                <p className="mt-1.5 pl-5.5 text-[11.5px] text-muted">Swiggy offers {acc.tools.length} actions: {acc.tools.join(', ')}</p>
              )}
              {error?.p === id && <p className="mt-1.5 pl-5.5 text-[12px] text-accent">{error.msg}</p>}
            </li>
          )
        })}
      </ul>

      <div className="mt-4 flex gap-3 rounded-card bg-surface p-4 text-[12.5px] leading-relaxed text-muted">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-good" />
        <p>
          You type your number and OTP on each app's own page, never in Sasta. Sessions stay on this phone and are never sent to any server.
          Disconnect wipes them. Prices and fees from connected apps arrive with live search.
        </p>
      </div>
    </Sheet>
  )
}
