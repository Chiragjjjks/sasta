import { Preferences } from '@/native/kv'
import { McpAuthError, toolPayload, toolText, type McpClient } from '../mcp'
import { mcpClient } from '../mcp-connect'
import { NeedsLocationError, NeedsLoginError, ProviderUnavailableError, type Adapter, type Offer } from '../types'

const record = (v: unknown): Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {}

function toolError(raw: unknown): string | undefined {
  const envelope = record(raw), payload = toolPayload(raw)
  if (payload?.success === false) return String(record(payload.error).message || payload.message || 'Instamart could not search.')
  if (envelope.isError) return toolText(raw).split('\n')[0] || 'Instamart could not search.'
  return undefined
}

function etaMinutes(sla: unknown): number | undefined {
  const s = record(sla), value = Number(s.value)
  if (!Number.isFinite(value) || value <= 0) return undefined
  return /^min/i.test(String(s.unit ?? '')) ? value : /^h/i.test(String(s.unit ?? '')) ? value * 60 : undefined
}

/**
 * search_products as Swiggy returns it (verified 2026-10-28): structuredContent is `{ products, nextOffset }`.
 * The documented `{ success, data: { products } }` envelope is accepted too. Prices are rupees;
 * each variation is a separate offer.
 */
export function parseInstamartSearch(raw: unknown, now = Date.now()): Offer[] {
  const error = toolError(raw)
  if (error) {
    if (/address|location|serviceab/i.test(error)) throw new NeedsLocationError(`Instamart: ${error}. Choose a Swiggy delivery address in Account.`)
    throw new ProviderUnavailableError(`Instamart: ${error}`)
  }
  const payload = toolPayload(raw)
  if (!payload) throw new ProviderUnavailableError('Instamart returned an unreadable search response.')
  const data = payload.success === true ? record(payload.data) : payload
  if (!Array.isArray(data.products)) throw new ProviderUnavailableError('Instamart changed its product response. No prices were guessed.')
  const seen = new Set<string>()
  return data.products.flatMap(rawProduct => {
    const product = record(rawProduct)
    if (!Array.isArray(product.variations)) return []
    return product.variations.flatMap(rawVariant => {
      const v = record(rawVariant), pricing = record(v.price)
      const id = v.skuId, title = v.displayName || product.displayName, price = pricing.offerPrice
      if (typeof id !== 'string' || !id || seen.has(id) || typeof title !== 'string' || !title.trim() || typeof price !== 'number' || !Number.isFinite(price) || price <= 0) return []
      seen.add(id)
      const packLabel = typeof v.quantityDescription === 'string' ? v.quantityDescription : undefined
      return [{ platform: 'instamart' as const, productId: id, title: `${title}${packLabel ? ` ${packLabel}` : ''}`, packLabel,
        brand: typeof v.brandName === 'string' ? v.brandName : typeof product.brand === 'string' ? product.brand : undefined,
        price, mrp: typeof pricing.mrp === 'number' && Number.isFinite(pricing.mrp) && pricing.mrp >= price ? pricing.mrp : undefined,
        inStock: v.isInStockAndAvailable === true && product.inStock !== false && product.isAvail !== false,
        etaMinutes: etaMinutes(v.sla),
        imageUrl: typeof v.imageUrl === 'string' && v.imageUrl.startsWith('https://') ? v.imageUrl : undefined,
        // The contract does not expose a product URL. Open the provider's real search instead.
        deepLink: `https://www.swiggy.com/instamart/search?custom_back=true&query=${encodeURIComponent(title)}`, fetchedAt: now,
        meta: { spinId: v.spinId, promoted: product.isPromoted === true } }]
    })
  })
}

/* ---------------------------------------------------------------- delivery address */

export interface SwiggyAddress { id: string; tag: string; line: string }
export interface SwiggyAddressBook { addresses: SwiggyAddress[]; defaultId?: string }

/** get_addresses. Swiggy's addresses carry no coordinates, so the user (or Swiggy's own ranking) picks one. */
export function parseSwiggyAddresses(raw: unknown): SwiggyAddressBook {
  const error = toolError(raw)
  if (error) throw new ProviderUnavailableError(`Swiggy: ${error}`)
  const payload = toolPayload(raw)
  const data = payload?.success === true ? record(payload.data) : payload ?? {}
  if (!Array.isArray(data.addresses)) throw new ProviderUnavailableError('Swiggy changed its address response.')
  const addresses = data.addresses.map(record).flatMap(a => typeof a.id === 'string' && a.id
    ? [{ id: a.id, tag: String(a.addressTag || a.addressCategory || 'Address'), line: String(a.addressLine || '') }] : [])
  const def = record(data.resolution).defaultAddressId
  return { addresses, defaultId: typeof def === 'string' && addresses.some(a => a.id === def) ? def : undefined }
}

const ADDRESS_KEY = 'sasta.instamart.address'
export type SelectedAddress = SwiggyAddress & { auto: boolean }

export async function loadInstamartAddress(): Promise<SelectedAddress | null> {
  try { const { value } = await Preferences.get({ key: ADDRESS_KEY }); return value ? JSON.parse(value) : null } catch { return null }
}
export async function saveInstamartAddress(a: SelectedAddress | null) {
  if (a) await Preferences.set({ key: ADDRESS_KEY, value: JSON.stringify(a) })
  else await Preferences.remove({ key: ADDRESS_KEY })
}

export async function listSwiggyAddresses(client: McpClient = mcpClient('instamart'), signal?: AbortSignal): Promise<SwiggyAddressBook> {
  return parseSwiggyAddresses(await client.callTool('get_addresses', {}, signal))
}

/** The user's choice, else Swiggy's own default (shown in Account so it can be changed), else the only address. */
export async function resolveInstamartAddress(client: McpClient, signal?: AbortSignal, store = { load: loadInstamartAddress, save: saveInstamartAddress }): Promise<SelectedAddress> {
  const chosen = await store.load()
  if (chosen) return chosen
  const book = await listSwiggyAddresses(client, signal)
  const pick = book.addresses.find(a => a.id === book.defaultId) ?? (book.addresses.length === 1 ? book.addresses[0] : undefined)
  if (!pick) throw new NeedsLocationError(book.addresses.length
    ? 'Choose which Swiggy address to search Instamart at in Account.'
    : 'Add a delivery address in the Swiggy app, then search again.')
  const selected = { ...pick, auto: true }
  await store.save(selected)
  return selected
}

/* ---------------------------------------------------------------- adapter */

export function createInstamartAdapter(clientFactory = (signal?: AbortSignal) => mcpClient('instamart', signal), store = { load: loadInstamartAddress, save: saveInstamartAddress }): Adapter {
  return {
    platform: 'instamart', attempts: 1, serial: true,
    // Swiggy searches the chosen saved address, shown in Account, rather than Sasta's coordinates.
    async setLocation() {},
    async search(query, signal) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
      try {
        const client = clientFactory(signal)
        // Signed-in sessions must name a saved address: guest coordinates are refused ("addressId is required").
        let address = await resolveInstamartAddress(client, signal, store)
        let result = await client.callTool('search_products', { query, addressId: address.id }, signal)
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
        if (/address/i.test(toolError(result) ?? '') && !address.auto) {
          // The chosen address was deleted in Swiggy: fall back to Swiggy's default once.
          await store.save(null)
          address = await resolveInstamartAddress(client, signal, store)
          result = await client.callTool('search_products', { query, addressId: address.id }, signal)
        }
        return parseInstamartSearch(result).map(o => ({ ...o, meta: { ...o.meta, addressTag: address.tag } }))
      } catch (error) {
        if (error instanceof McpAuthError) throw new NeedsLoginError('instamart')
        throw error
      }
    },
  }
}
