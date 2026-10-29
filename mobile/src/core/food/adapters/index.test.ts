import { expect, it, vi } from 'vitest'
import { PlatformSession } from '@/native/platformSession'
import { canSearchFood, foodSources } from './index'

vi.mock('@/core/adapters', () => ({ IS_NATIVE: true }))

it('registers the web sources while Ownly and Swish remain not-live', async () => {
  expect(foodSources).toHaveLength(4)
  expect(canSearchFood('swiggy_food')).toBe(true)
  expect(canSearchFood('zomato')).toBe(true)
  for (const platform of ['ownly', 'swish'] as const) {
    expect(canSearchFood(platform)).toBe(false)
    await expect(foodSources.find((s) => s.platform === platform)!.search('biryani', new AbortController().signal)).rejects.toMatchObject({ name: 'NotLiveError' })
  }
  const zomato = foodSources.find((s) => s.platform === 'zomato')!
  await zomato.setLocation({ lat: 12.9915, lng: 77.5544, label: 'Rajajinagar', pincode: '560010' })
  const page = vi.spyOn(PlatformSession, 'pageRun').mockResolvedValue({ ok: true, value: { restaurants: { page_data: { sections: { SECTION_SEARCH_RESULT: [] } } }, menus: [] } })
  try {
    await expect(zomato.search('biryani', new AbortController().signal)).resolves.toEqual([])
    expect(page).toHaveBeenCalledWith(expect.objectContaining({ origin: 'https://www.zomato.com' }))
  } finally { page.mockRestore() }
})
