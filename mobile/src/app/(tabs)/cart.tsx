import { router, useFocusEffect } from 'expo-router'
import { ArrowUpRight, ChevronDown, RefreshCw, ShoppingBag } from 'lucide-react-native'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, AppState, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { IS_NATIVE } from '@/core/adapters'
import { singleAppOptions, summarize, type CartLine } from '@/core/cart'
import { billsFor, cheapestAfterFees, grandTotal } from '@/core/fees'
import { itemPack, itemTitle } from '@/core/lists'
import { compareOffers } from '@/core/normalize'
import { PLATFORM } from '@/core/platforms'
import type { Platform } from '@/core/types'
import { plural, rupee } from '@/core/utils'
import { useStore } from '@/state/store'
import { Button, Card, Stepper, T, tap } from '@/ui/kit'
import { OfferSlots } from '@/ui/OfferSlots'
import { PackIcon } from '@/ui/PackIcon'
import { PlanHero, type HeroChoice } from '@/ui/PlanHero'
import { PlatformMark } from '@/ui/PlatformMark'
import { useTheme } from '@/ui/theme'

/** Opening the cart re-checks prices when the last check is older than this. */
const STALE_MS = 5 * 60 * 1000

function ago(ts: number) {
  const m = Math.round((Date.now() - ts) / 60000)
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`
}

export default function CartScreen() {
  const t = useTheme()
  const s = useStore()
  const items = s.cart
  const [open, setOpen] = useState<string | null>(null)
  const [checkingOut, setCheckingOut] = useState(false)
  const { refreshPrices, learnFees } = s

  // The cart keeps itself current: on open, when the app comes back to the foreground, and when the location changes.
  const cartRef = useRef(items)
  useEffect(() => { cartRef.current = items }, [items])
  const autoCheck = useCallback(() => {
    const c = cartRef.current
    if (c.length && Date.now() - Math.min(...c.map((i) => i.updatedAt)) > STALE_MS) refreshPrices({ force: false })
  }, [refreshPrices])
  useFocusEffect(useCallback(() => {
    learnFees()
    autoCheck()
    const sub = AppState.addEventListener('change', (state) => { if (state === 'active') autoCheck() })
    return () => sub.remove()
  }, [learnFees, autoCheck]))
  const where = `${s.location.pincode}|${s.location.lat}|${s.location.lng}`
  const lastWhere = useRef(where)
  useEffect(() => {
    if (lastWhere.current === where) return
    lastWhere.current = where
    if (cartRef.current.length) refreshPrices({ force: true })
  }, [where, refreshPrices])

  if (!items.length) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={['top']}>
        <View style={styles.empty}>
          <ShoppingBag size={40} color={t.faint} />
          <T kind="h2">Your cart is empty</T>
          <T kind="small" style={{ textAlign: 'center' }}>Search a product and tap Add, or add a whole list. Sasta then shows the cheapest way to buy everything.</T>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
            <Button small label="Search" onPress={() => router.navigate('/')} />
            <Button small variant="secondary" label="Your lists" onPress={() => router.navigate('/lists')} />
          </View>
        </View>
      </SafeAreaView>
    )
  }

  const summary = summarize(items)
  const cheapest = summarize(items.map((i) => ({ ...i, pinned: undefined })))
  const options = singleAppOptions(items)
  const current = Object.fromEntries(summary.lines.flatMap((l) => (l.offer ? [[l.item.key, l.offer.platform]] : []))) as Record<string, Platform>
  const bills = billsFor(items, current, s.fees)
  const anyFees = bills.some((b) => b.known)
  const afterFees = anyFees ? cheapestAfterFees(items, s.fees) : null
  const mixAssign = Object.fromEntries(cheapest.lines.flatMap((l) => (l.offer ? [[l.item.key, l.offer.platform]] : []))) as Record<string, Platform>
  const mixWithFees = grandTotal(billsFor(items, mixAssign, s.fees))
  const showAfterFees = !!afterFees && afterFees.total < mixWithFees
  const pins = new Set(items.map((i) => i.pinned))
  const onAfterFees = !!afterFees && items.some((i) => i.pinned) && items.every((i) => current[i.key] === afterFees.assign[i.key])
  const mode: 'cheapest' | Platform | 'custom' = pins.size === 1 && pins.has(undefined) ? 'cheapest' : pins.size === 1 ? [...pins][0]! : 'custom'
  const total = anyFees ? grandTotal(bills) : summary.total
  const best = anyFees ? Math.min(mixWithFees, afterFees?.total ?? Infinity) : cheapest.total
  const pricedAt = Math.min(...items.flatMap((i) => i.offers.length ? i.offers.map((o) => o.fetchedAt) : [i.updatedAt]))
  const changed = Object.keys(s.cartChanges).filter((k) => items.some((i) => i.key === k)).length

  const byPlatform = new Map<Platform, CartLine[]>()
  for (const l of summary.lines) if (l.offer) byPlatform.set(l.offer.platform, [...(byPlatform.get(l.offer.platform) ?? []), l])
  const groups = [...byPlatform].map(([platform, lines]) => {
    const bill = bills.find((b) => b.platform === platform)
    return { platform, lines, bill, total: bill?.total ?? lines.reduce((a, l) => a + l.lineTotal, 0) }
  })

  const choices: HeroChoice[] = [
    { key: 'mix', label: 'Cheapest mix', on: mode === 'cheapest' && !onAfterFees, onPress: () => s.pinAllTo(undefined) },
    ...(showAfterFees && afterFees ? [{ key: 'fees', label: `Fewer deliveries ${rupee(afterFees.total)}`, on: onAfterFees, onPress: () => s.pinMap(afterFees.assign) }] : []),
    ...options.slice(0, 4).map((o) => {
      const oneApp = anyFees && !o.missing.length ? grandTotal(billsFor(items, Object.fromEntries(items.map((i) => [i.key, o.platform])), s.fees)) : o.total
      return {
        key: o.platform, platform: o.platform, on: mode === o.platform, onPress: () => s.pinAllTo(o.platform),
        label: `Only ${PLATFORM[o.platform].short} ${rupee(oneApp)}${o.missing.length ? ` · ${o.covered} of ${items.length}` : ''}`,
      }
    }),
  ]

  const openUrl = (url: string, p: Platform) => Linking.openURL(url).catch(() => s.showToast(`Could not open ${PLATFORM[p].name}`))
  const checkout = async (p: Platform) => {
    setCheckingOut(true)
    try { await s.checkout(p) } catch (e) { s.showToast((e as Error).message) } finally { setCheckingOut(false) }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}>
        <T kind="title" style={{ fontSize: 26 }}>Your cart</T>
        <View style={styles.status}>
          {s.refreshing ? <ActivityIndicator size="small" color={t.muted} /> : <View style={[styles.liveDot, { backgroundColor: t.good }]} />}
          <T kind="small" style={{ flex: 1 }}>
            {s.refreshing ? `Checking ${plural(items.length, 'item')} on every app…` : `${plural(summary.itemCount, 'item')} · prices from ${ago(pricedAt)}`}
          </T>
          {!s.refreshing && (
            <Pressable onPress={() => s.refreshPrices()} hitSlop={10} style={styles.refresh} accessibilityLabel="Check prices again">
              <RefreshCw size={13} color={t.ink} /><T kind="smallStrong">Refresh</T>
            </Pressable>
          )}
        </View>

        <View style={{ opacity: s.refreshing ? 0.6 : 1 }}>
          <PlanHero
            label={mode === 'cheapest' && !onAfterFees ? `Cheapest way to buy all ${items.length}` : `Your cart · ${plural(items.length, 'product')}`}
            total={summary.lines.some((l) => l.offer) ? total : undefined}
            sub={`from ${plural(groups.length, 'app')} · ${anyFees ? 'with delivery fees' : 'before fees'}`}
            groups={groups}
            saving={total > best + 0.001 ? undefined : summary.savingsVsMrp > 0 ? `You save ${rupee(summary.savingsVsMrp)} vs MRP` : undefined}
            choices={choices}
          />
        </View>
        {total > best + 0.001 && (
          <Pressable onPress={() => (showAfterFees && afterFees ? s.pinMap(afterFees.assign) : s.pinAllTo(undefined))} style={[styles.banner, { backgroundColor: t.goodBg }]} accessibilityRole="button">
            <T kind="smallStrong" style={{ color: t.good, flex: 1 }}>Switch to the cheapest way and save {rupee(total - best)}</T>
            <T kind="smallStrong" style={{ color: t.good }}>Switch</T>
          </Pressable>
        )}

        {changed > 0 && !s.refreshing && (
          <View style={[styles.banner, { backgroundColor: t.warnBg }]}>
            <T kind="smallStrong" style={{ color: t.accentText, flex: 1 }}>{changed === 1 ? '1 price changed' : `${changed} prices changed`} since the last check</T>
            <Pressable onPress={() => { tap(); s.dismissCartChanges() }} hitSlop={10}><T kind="smallStrong" style={{ color: t.accentText }}>Got it</T></Pressable>
          </View>
        )}

        {groups.map(({ platform, lines, bill, total: groupTotal }) => {
          const eta = Math.max(0, ...lines.map((l) => l.offer?.etaMinutes ?? 0))
          return (
            <Card key={platform} style={[styles.app, { borderLeftColor: PLATFORM[platform].mark.bg }]}>
              <View style={styles.appHead}>
                <PlatformMark platform={platform} size={32} />
                <View style={{ flex: 1 }}>
                  <T kind="h3">From {PLATFORM[platform].name}</T>
                  <T kind="small">
                    {plural(lines.reduce((a, l) => a + l.item.qty, 0), 'item')}{eta ? ` · ${eta} min` : ''}
                    {bill?.known ? ` · ${bill.delivery ? `delivery ${rupee(bill.delivery)}` : 'free delivery'}${bill.handling ? ` · handling ${rupee(bill.handling)}` : ''}${bill.other ? ` · small cart ${rupee(bill.other)}` : ''}` : ''}
                  </T>
                </View>
                <Text style={{ color: t.ink, fontFamily: t.fonts.display, fontSize: 19 }}>{rupee(groupTotal)}</Text>
              </View>
              {lines.map((l) => (
                <CartRow key={l.item.key} line={l} change={s.cartChanges[l.item.key]} expanded={open === l.item.key}
                  onExpand={() => { tap(); setOpen(open === l.item.key ? null : l.item.key) }}
                  onQty={(q) => s.setCartQty(l.item.key, q)}
                  onPin={(p) => { s.pinItem(l.item.key, p); setOpen(null) }}
                  onOpen={(url) => openUrl(url, platform)} />
              ))}
              {IS_NATIVE && platform === 'blinkit' && (
                <View style={{ paddingHorizontal: 14, paddingBottom: 12 }}>
                  <Button small label="Open in Blinkit with these items" loading={checkingOut} icon={<ArrowUpRight size={14} color={t.bg} />} onPress={() => checkout(platform)} />
                </View>
              )}
            </Card>
          )
        })}

        {summary.unavailable.length > 0 && (
          <Card style={[styles.app, { borderLeftColor: t.line }]}>
            <View style={styles.appHead}>
              <View style={{ flex: 1 }}>
                <T kind="h3" style={{ color: t.muted }}>Out of stock everywhere</T>
                <T kind="small">No app has these right now</T>
              </View>
            </View>
            {summary.unavailable.map((i) => (
              <View key={i.key} style={[styles.unavailable, { borderTopColor: t.line }]}>
                <T kind="body" style={{ flex: 1, color: t.muted }} numberOfLines={1}>{itemTitle(i)} {itemPack(i)}</T>
                <Button small variant="ghost" label="Remove" onPress={() => s.setCartQty(i.key, 0)} />
              </View>
            ))}
          </Card>
        )}

        <T kind="caption" style={{ textAlign: 'center', marginTop: 4 }}>
          {anyFees
            ? `Includes delivery and handling for ${bills.filter((b) => b.known).map((b) => PLATFORM[b.platform].short).join(', ')}, read from a real bill. `
            : 'Delivery and handling fees are not included yet. '}
          Order and pay in each app; Sasta never places orders.
        </T>
        {items.some((i) => i.offers.some((o) => o.sample)) && <T kind="caption" style={{ color: t.accentText, textAlign: 'center' }}>Some prices here are sample data. Tap Refresh.</T>}
        <Button variant="ghost" label="Clear cart" onPress={() => Alert.alert('Clear your cart?', undefined, [{ text: 'Cancel', style: 'cancel' }, { text: 'Clear', style: 'destructive', onPress: s.clearCart }])} />
      </ScrollView>
    </SafeAreaView>
  )
}

/** One product in an app's order: quantity, price, what changed, and the other apps one tap away. */
function CartRow({ line, change, expanded, onExpand, onQty, onPin, onOpen }: {
  line: CartLine; change?: number; expanded: boolean
  onExpand: () => void; onQty: (q: number) => void; onPin: (p: Platform | undefined) => void; onOpen: (url: string) => void
}) {
  const t = useTheme()
  const { item, offer, lineTotal } = line
  if (!offer) return null
  const inStock = item.offers.filter((o) => o.inStock).sort(compareOffers)
  const cheapest = inStock[0]
  const others = inStock.filter((o) => o.platform !== offer.platform)
  // A picked app that ran out: the item moved to the cheapest app that still has it.
  const movedFrom = item.pinned && item.pinned !== offer.platform ? item.pinned : undefined
  const cheaper = !!item.pinned && !movedFrom && cheapest && cheapest.price < offer.price ? cheapest : undefined
  const diff = (p: number) => (p === offer.price ? 'same' : p > offer.price ? `+${rupee(p - offer.price)}` : `−${rupee(offer.price - p)}`)
  return (
    <View style={[styles.row, { borderTopColor: t.line }]}>
      <View style={styles.rowMain}>
        <PackIcon variantKey={item.variantKey} imageUrl={offer.imageUrl} size={30} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <T kind="bodyStrong" numberOfLines={2}>{itemTitle(item)}</T>
          <T kind="small" numberOfLines={1}>{itemPack(item)}{item.qty > 1 ? ` · ${rupee(offer.price)} each` : ''}</T>
          {!!change && (
            <T kind="smallStrong" style={{ color: change < 0 ? t.good : t.bad }}>
              {change < 0 ? `↓ ${rupee(-change)}` : `↑ ${rupee(change)}`} since last check
            </T>
          )}
          {movedFrom && <T kind="smallStrong" style={{ color: t.accentText }}>Out of stock on {PLATFORM[movedFrom].short}, so moved here</T>}
        </View>
        <Stepper qty={item.qty} onChange={onQty} />
        <T kind="bodyStrong" style={{ minWidth: 44, textAlign: 'right' }}>{rupee(lineTotal)}</T>
      </View>
      <View style={styles.rowFoot}>
        {cheaper ? (
          <Pressable onPress={() => { tap(); onPin(undefined) }} hitSlop={8} style={{ flex: 1 }} accessibilityRole="button">
            <T kind="smallStrong" style={{ color: t.good }}>{PLATFORM[cheaper.platform].short} is {rupee((offer.price - cheaper.price) * item.qty)} cheaper · Switch</T>
          </Pressable>
        ) : others.length ? (
          <Pressable onPress={onExpand} hitSlop={8} style={styles.also} accessibilityRole="button" accessibilityState={{ expanded }}
            accessibilityLabel={`Change app. Also on ${others.map((o) => PLATFORM[o.platform].name).join(', ')}`}>
            <T kind="small" numberOfLines={1} style={{ flexShrink: 1 }}>
              Also {others.slice(0, 2).map((o) => `${PLATFORM[o.platform].short} ${diff(o.price)}`).join(' · ')}{others.length > 2 ? ` · +${others.length - 2}` : ''}
            </T>
            <ChevronDown size={14} color={t.muted} style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }} />
          </Pressable>
        ) : (
          <T kind="small" style={{ flex: 1 }}>Only {PLATFORM[offer.platform].short} has this</T>
        )}
        <Pressable onPress={() => onOpen(offer.deepLink)} hitSlop={10} accessibilityLabel={`Open in ${PLATFORM[offer.platform].name}`}>
          <ArrowUpRight size={16} color={t.muted} />
        </Pressable>
      </View>
      {expanded && (
        <View style={{ paddingTop: 4 }}>
          <OfferSlots offers={inStock} qty={item.qty} chosen={offer.platform} pinned={item.pinned} onPick={onPin} />
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 32 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 22, marginTop: -6 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  refresh: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12 },
  app: { borderLeftWidth: 5 },
  appHead: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, paddingBottom: 10 },
  row: { borderTopWidth: StyleSheet.hairlineWidth, marginHorizontal: 12, paddingVertical: 10, gap: 6 },
  rowMain: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowFoot: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 40 },
  also: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  unavailable: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth },
})
