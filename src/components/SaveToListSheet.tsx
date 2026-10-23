import { Check, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { STARTER_LISTS, type ShoppingList } from '@/lib/lists'
import type { ProductGroup } from '@/lib/types'
import { cn, formatSize } from '@/lib/utils'
import { Sheet } from './Sheet'

interface Props {
  group: ProductGroup | null
  lists: ShoppingList[]
  onClose: () => void
  onToggle: (listId: string, saved: boolean) => void
  onCreate: (name: string, emoji: string) => void
}

export function SaveToListSheet({ group, lists, onClose, onToggle, onCreate }: Props) {
  const [name, setName] = useState('')
  const [adding, setAdding] = useState(false)
  useEffect(() => { if (group) { setName(''); setAdding(lists.length === 0) } }, [group, lists.length])

  const starters = STARTER_LISTS.filter((s) => !lists.some((l) => l.name.toLowerCase() === s.name.toLowerCase()))

  return (
    <Sheet open={!!group} onClose={onClose} title="Save to list">
      {group && (
        <>
          <h3 className="font-display text-[19px] font-bold">Save to list</h3>
          <p className="text-[13px] text-muted">{group.variant}{group.sizeGrams ? ` · ${formatSize(group.sizeGrams)}` : ''}</p>

          {lists.length > 0 && (
            <ul className="mt-4 divide-y divide-line overflow-hidden rounded-card bg-surface">
              {lists.map((l) => {
                const saved = l.items.some((i) => i.key === group.key)
                return (
                  <li key={l.id}>
                    <button onClick={() => onToggle(l.id, saved)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                      <span className="grid size-9 place-items-center rounded-xl bg-chip text-[18px]">{l.emoji}</span>
                      <span className="flex-1">
                        <span className="block text-[14.5px] font-semibold">{l.name}</span>
                        <span className="block text-[12px] text-muted">{l.items.length} {l.items.length === 1 ? 'product' : 'products'}</span>
                      </span>
                      <span className={cn('grid size-6 place-items-center rounded-lg border-2', saved ? 'border-ink bg-ink text-bg' : 'border-line')}>
                        {saved && <Check className="size-3.5" />}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          {adding ? (
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => { e.preventDefault(); if (name.trim()) { onCreate(name.trim(), '🛍️'); setName(''); setAdding(false) } }}
            >
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="List name, e.g. Office snacks"
                className="min-w-0 flex-1 rounded-xl bg-surface px-4 py-3 text-[15px] font-medium outline-none ring-ink/10 focus:ring-2"
              />
              <button disabled={!name.trim()} className="rounded-xl bg-ink px-4 text-[14px] font-semibold text-bg disabled:opacity-40">Create</button>
            </form>
          ) : (
            <button onClick={() => setAdding(true)} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-dashed border-line py-3 text-[13.5px] font-semibold text-muted">
              <Plus className="size-4" /> New list
            </button>
          )}

          {starters.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {starters.map((s) => (
                <button key={s.name} onClick={() => onCreate(s.name, s.emoji)} className="rounded-full bg-surface px-3 py-1.5 text-[12.5px] font-semibold">
                  {s.emoji} {s.name}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </Sheet>
  )
}
