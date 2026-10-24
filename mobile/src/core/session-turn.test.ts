import { expect, it, vi } from 'vitest'
import { withSessionTurn } from './session-turn'

it('prevents login checks from resetting an active search while allowing other providers', async () => {
  let release!: () => void
  const search = withSessionTurn('zepto', () => new Promise<void>(r => { release = r }))
  const login = vi.fn(async () => true)
  const check = withSessionTurn('zepto', login)
  await withSessionTurn('bigbasket', async () => {})
  expect(login).not.toHaveBeenCalled()
  release(); await search
  expect(await check).toBe(true)
})
it('cancels queued work without resetting the active page or blocking subsequent work', async () => {
  let release!: () => void
  const active = withSessionTurn('zepto', () => new Promise<void>(r => { release = r }))
  const ctrl = new AbortController(), work = vi.fn(async () => {})
  const waiting = withSessionTurn('zepto', work, ctrl.signal)
  ctrl.abort()
  await expect(waiting).rejects.toMatchObject({ name: 'AbortError' })
  release(); await active
  await withSessionTurn('zepto', async () => {})
  expect(work).not.toHaveBeenCalled()
})
