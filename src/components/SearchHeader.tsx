import { Bookmark, MapPin, Search, UserRound, X } from 'lucide-react'
import { useRef } from 'react'
import type { Location } from '@/lib/types'

interface Props {
  query: string
  onQuery: (q: string) => void
  onSubmit: (q: string) => void
  location: Location
  onLocation: () => void
  recents: string[]
  connectedCount: number
  onAccounts: () => void
  onLists: () => void
}

export function SearchHeader({ query, onQuery, onSubmit, location, onLocation, recents, connectedCount, onAccounts, onLists }: Props) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <header className="pt-safe sticky top-0 z-20 bg-bg px-4 pb-3">
      <div className="flex items-center justify-between pt-3">
        <span className="font-display text-[26px] font-extrabold tracking-[-0.04em]">
          sasta<span className="text-accent">.</span>
        </span>
        <div className="flex min-w-0 items-center gap-2">
        <button
          onClick={onLists}
          aria-label="Your lists"
          className="grid size-9 shrink-0 place-items-center rounded-full bg-surface text-muted shadow-[0_1px_2px_rgba(20,21,42,.06)] active:scale-95"
        >
          <Bookmark className="size-4" />
        </button>
        <button
          onClick={onAccounts}
          aria-label={`Connected apps, ${connectedCount} connected`}
          className="relative grid size-9 shrink-0 place-items-center rounded-full bg-surface text-muted shadow-[0_1px_2px_rgba(20,21,42,.06)] active:scale-95"
        >
          <UserRound className="size-4" />
          {connectedCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid size-4 place-items-center rounded-full bg-good text-[9.5px] font-bold text-white">{connectedCount}</span>
          )}
        </button>
        <button
          onClick={onLocation}
          className="flex min-w-0 items-center gap-1.5 rounded-full bg-surface px-3 py-2 text-[13px] font-medium text-muted shadow-[0_1px_2px_rgba(20,21,42,.06)] active:scale-[.97]"
        >
          <MapPin className="size-3.5 shrink-0" />
          <span className="truncate">{location.label} · {location.pincode}</span>
        </button>
        </div>
      </div>

      <form
        role="search"
        className="mt-3 flex items-center gap-2 rounded-2xl bg-surface py-1.5 pl-4 pr-1.5 shadow-[0_2px_8px_rgba(20,21,42,.06)]"
        onSubmit={(e) => { e.preventDefault(); input.current?.blur(); onSubmit(query) }}
      >
        <Search className="size-[18px] shrink-0 text-muted" />
        <input
          ref={input}
          type="search"
          inputMode="search"
          enterKeyHint="search"
          aria-label="Search any product"
          placeholder="Search any product"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          className="min-w-0 flex-1 bg-transparent py-2 text-[16px] font-medium outline-none placeholder:text-faint [&::-webkit-search-cancel-button]:hidden"
        />
        {query && (
          <button type="button" aria-label="Clear" onClick={() => { onQuery(''); input.current?.focus() }} className="p-1 text-faint">
            <X className="size-4" />
          </button>
        )}
        <button type="submit" className="rounded-xl bg-ink px-4 py-2.5 text-[14px] font-semibold text-bg active:scale-[.97]">
          Compare
        </button>
      </form>

      {recents.length > 0 && (
        <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
          {recents.map((r) => (
            <button
              key={r}
              onClick={() => { onQuery(r); onSubmit(r) }}
              className="shrink-0 rounded-full border border-line px-3 py-1.5 text-[13px] text-muted active:bg-chip"
            >
              {r}
            </button>
          ))}
        </div>
      )}
    </header>
  )
}
