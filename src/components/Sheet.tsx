import type { ReactNode } from 'react'
import { Drawer } from 'vaul'

/** Bottom sheet in the shadcn/ui Drawer style (vaul under the hood). */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  return (
    <Drawer.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Drawer.Content
          aria-describedby={undefined}
          className="pb-safe fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[88%] max-w-lg flex-col rounded-t-[26px] bg-bg outline-none"
        >
          <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-line" />
          <Drawer.Title className="sr-only">{title}</Drawer.Title>
          <div className="overflow-y-auto px-4 pb-5 pt-3">{children}</div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
