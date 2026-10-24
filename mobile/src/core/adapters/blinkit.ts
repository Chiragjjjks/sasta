import { PlatformSession } from '@/native/platformSession'
import { PLATFORM } from '@/core/platforms'
import type { Adapter, Location, Offer } from '@/core/types'

/**
 * Live Blinkit search. Runs inside a hidden WebView on blinkit.com because Cloudflare rejects
 * non-browser TLS fingerprints. Inside the page, requests carry Blinkit's own cookies and storage,
 * so a signed-in session (Connected apps) gives your own prices automatically.
 * Endpoints and headers: docs/platforms/blinkit.md. Fixture: fixtures/blinkit/lays.json.
 */

export const BLINKIT_ORIGIN = 'https://blinkit.com'

interface CartItem {
  product_id: number
  merchant_id?: number
  product_name?: string
  display_name?: string
  brand?: string
  price: number
  mrp?: number
  unit?: string
  inventory?: number
  unavailable_quantity?: number
  image_url?: string
}

/** Finds every product's `cart_item` in Blinkit's server-driven search response. */
export function extractCartItems(json: unknown): CartItem[] {
  const out: CartItem[] = []
  const seen = new Set<number>()
  const walk = (o: unknown) => {
    if (!o || typeof o !== 'object') return
    const rec = o as Record<string, unknown>
    const ci = rec.cart_item as CartItem | undefined
    if (ci && typeof ci.product_id === 'number' && typeof ci.price === 'number' && !seen.has(ci.product_id)) {
      seen.add(ci.product_id)
      out.push(ci)
    }
    for (const v of Object.values(rec)) walk(v)
  }
  walk(json)
  return out
}

export function parseBlinkitSearch(json: unknown, now = Date.now()): Offer[] {
  return extractCartItems(json).map((ci) => {
    const name = ci.display_name || ci.product_name || 'Unknown product'
    return {
      platform: 'blinkit',
      productId: String(ci.product_id),
      title: ci.unit ? `${name} ${ci.unit}` : name,
      brand: ci.brand,
      price: ci.price,
      mrp: ci.mrp,
      inStock: (ci.inventory ?? 1) > 0,
      imageUrl: ci.image_url,
      deepLink: `https://blinkit.com/prn/x/prid/${ci.product_id}`,
      fetchedAt: now,
      meta: { cartItem: ci },
    } satisfies Offer
  })
}

/** Script run inside blinkit.com. Reads Blinkit's own storage for the signed-in token, if any. */
export function searchScript(query: string, lat: number, lon: number): string {
  const q = JSON.stringify(query)
  return `
    const auth = (() => { try { return JSON.parse(localStorage.getItem('auth') || 'null') } catch { return null } })();
    const base = {
      'app_client': 'consumer_web', 'platform': 'desktop_web', 'content-type': 'application/json',
      'lat': ${JSON.stringify(String(lat))}, 'lon': ${JSON.stringify(String(lon))},
      'web_app_version': '1008010016', 'app_version': '52434332', 'rn_bundle_version': '1009003012',
      'device_id': localStorage.getItem('deviceId') || 'sasta-device',
      'session_uuid': sessionStorage.getItem('sessionId') || crypto.randomUUID(),
    };
    let authKey = localStorage.getItem('authKey');
    if (!authKey) {
      const r = await fetch('/v2/accounts/auth_key/', { headers: { ...base, req_key: 'c0e6868e-1180-400c-be51-f473479f1f0a' } });
      authKey = (await r.json()).auth_key;
    }
    const headers = { ...base, auth_key: authKey };
    if (auth && auth.accessToken) headers.access_token = auth.accessToken;
    const res = await fetch('/v1/layout/search?q=' + encodeURIComponent(${q}) + '&search_type=type_to_search', {
      method: 'POST', headers,
      body: JSON.stringify({ applied_filters: null, sort: '', postback_meta: {}, previous_search_query: '', vertical_cards_processed: 0 }),
    });
    if (res.status === 401 || res.status === 403) throw new Error('blocked:' + res.status);
    if (!res.ok) throw new Error('http:' + res.status);
    return await res.json();
  `
}

export function createBlinkitAdapter(): Adapter {
  let loc: Location | undefined
  return {
    platform: 'blinkit',
    async setLocation(next) { loc = next },
    async search(query, signal) {
      if (!loc?.lat || !loc?.lng) throw new Error(`${PLATFORM.blinkit.name} needs your exact location. Use "current location".`)
      const res = await PlatformSession.pageRun({ origin: BLINKIT_ORIGIN, script: searchScript(query, loc.lat, loc.lng), timeoutMs: 12000 })
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
      if (!res.ok) throw new Error(res.error || 'Blinkit search failed')
      return parseBlinkitSearch(res.value)
    },
  }
}

/** Script that prices a list of Blinkit cart items with /v5/carts (stateless: nothing is saved). */
export function quoteScript(cartItems: unknown[], lat: number, lon: number): string {
  return `
    const base = {
      'app_client': 'consumer_web', 'platform': 'desktop_web', 'content-type': 'application/json',
      'lat': ${JSON.stringify(String(lat))}, 'lon': ${JSON.stringify(String(lon))},
      'web_app_version': '1008010016', 'app_version': '52434332', 'rn_bundle_version': '1009003012',
      'device_id': localStorage.getItem('deviceId') || 'sasta-device',
      'session_uuid': sessionStorage.getItem('sessionId') || crypto.randomUUID(),
    };
    let authKey = localStorage.getItem('authKey');
    if (!authKey) {
      const r = await fetch('/v2/accounts/auth_key/', { headers: { ...base, req_key: 'c0e6868e-1180-400c-be51-f473479f1f0a' } });
      authKey = (await r.json()).auth_key;
    }
    const auth = (() => { try { return JSON.parse(localStorage.getItem('auth') || 'null') } catch { return null } })();
    const headers = { ...base, auth_key: authKey };
    if (auth && auth.accessToken) headers.access_token = auth.accessToken;
    const res = await fetch('/v5/carts', { method: 'POST', headers, body: JSON.stringify({ items: ${JSON.stringify(cartItems)}, promo_codes: [''] }) });
    if (!res.ok) throw new Error('http:' + res.status);
    const j = await res.json();
    return { cart_data: { bill_details: j.cart_data && j.cart_data.bill_details } };
  `
}

/** Learns Blinkit's current delivery and handling fees from a real bill for the given items. */
export async function fetchBlinkitBill(cartItems: unknown[], loc: Location): Promise<unknown> {
  if (!loc.lat || !loc.lng || !cartItems.length) throw new Error('Nothing to price')
  const res = await PlatformSession.pageRun({ origin: BLINKIT_ORIGIN, script: quoteScript(cartItems, loc.lat, loc.lng), timeoutMs: 12000 })
  if (!res.ok) throw new Error(res.error || 'Blinkit pricing failed')
  return res.value
}

export interface HandoffLine { cartItem: Record<string, unknown>; qty: number }

/**
 * Script that puts Sasta's Blinkit items into blinkit.com's own cart (kept in its localStorage)
 * and sets the delivery location, so the site opens on a ready cart and the user checks out
 * there with their own account, coupons and payment. Existing Blinkit cart items are kept.
 */
export function handoffScript(lines: HandoffLine[], loc: Location): string {
  const items = Object.fromEntries(lines.map(({ cartItem: c, qty }) => [String(c.product_id), {
    product: { product_id: c.product_id, price: c.price, image_url: c.image_url, name: c.display_name || c.product_name, unit: c.unit, mrp: c.mrp, group_id: c.group_id },
    quantity: qty,
  }]))
  return `
    const add = ${JSON.stringify(items)};
    const cart = (() => { try { return JSON.parse(localStorage.getItem('cart') || '{}') } catch { return {} } })();
    cart.items = Object.assign({}, cart.items || {}, add);
    const all = Object.values(cart.items);
    cart.count = all.reduce((s, i) => s + (i.quantity || 0), 0);
    cart.total = all.reduce((s, i) => s + (i.quantity || 0) * ((i.product && i.product.price) || 0), 0);
    cart.uniqueSkuInCart = all.length;
    cart.version = cart.version || 1;
    localStorage.setItem('cart', JSON.stringify(cart));
    ${locationScript(loc).replace('return true;', '')}
    return { count: cart.count, total: cart.total };
  `
}

export async function openBlinkitWithCart(lines: HandoffLine[], loc: Location): Promise<void> {
  if (!loc.lat || !loc.lng) throw new Error('Set your location with "current location" first.')
  const res = await PlatformSession.pageRun({ origin: BLINKIT_ORIGIN, script: handoffScript(lines, loc), timeoutMs: 12000 })
  if (!res.ok) throw new Error(res.error || 'Could not prepare the Blinkit cart')
  await PlatformSession.signIn({ url: `${BLINKIT_ORIGIN}/`, title: 'Blinkit · check out' })
}

/** Sets blinkit.com's own delivery location, which its login asks for before showing the OTP step. */
export function locationScript(loc: Location): string {
  return `
    const location = (() => { try { return JSON.parse(localStorage.getItem('location') || '{}') } catch { return {} } })();
    location.coords = Object.assign({}, location.coords || {}, { isDefault: false, lat: ${loc.lat}, lon: ${loc.lng}, locality: ${JSON.stringify(loc.label)} });
    localStorage.setItem('location', JSON.stringify(location));
    return true;
  `
}

/** Reads who is signed in from blinkit.com's own storage. Only a masked number leaves the page. */
export const WHO_AM_I_SCRIPT = `
  const auth = (() => { try { return JSON.parse(localStorage.getItem('auth') || 'null') } catch { return null } })();
  const phone = auth && (auth.phoneNumber || auth.phone || (auth.user && auth.user.phone)) ? String(auth.phoneNumber || auth.phone || auth.user.phone) : '';
  return { signedIn: !!(auth && auth.accessToken), phone: phone ? '•••• ' + phone.slice(-4) : '' };
`

export async function prepareBlinkitSignIn(loc: Location): Promise<void> {
  if (!loc.lat || !loc.lng) return
  await PlatformSession.pageRun({ origin: BLINKIT_ORIGIN, script: locationScript(loc), timeoutMs: 12000 })
}

export async function blinkitIdentity(): Promise<{ signedIn: boolean; phone: string } | null> {
  // The hidden page may hold storage from before sign-in; reload it so it reads the fresh session.
  await PlatformSession.pageReset({ origin: BLINKIT_ORIGIN })
  const res = await PlatformSession.pageRun({ origin: BLINKIT_ORIGIN, script: WHO_AM_I_SCRIPT, timeoutMs: 12000 })
  return res.ok ? (res.value as { signedIn: boolean; phone: string }) : null
}
