import { router, useFocusEffect } from 'expo-router'
import { ArrowUpRight, RefreshCw, ShoppingBag } from 'lucide-react-native'
import { useCallback, useState } from 'react'
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { IS_NATIVE } from '@/core/adapters'
import { chosenOffer, singleAppOptions, summarize } from '@/core/cart'
import { billsFor, cheapestAfterFees, grandTotal } from '@/core/fees'
import { PLATFORM } from '@/core/platforms'
import type { Platform } from '@/core/types'
import { formatSize, plural, rupee } from '@/core/utils'
import { useStore } from '@/state/store'
import { Badge, Button, Card, Chip, Divider, Stepper, T, tap } from '@/ui/kit'
import { PackIcon } from '@/ui/PackIcon'
import { useTheme } from '@/ui/theme'

function ago(ts: number) {
  const m = Math.round((Date.now() - ts) / 60000)
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`
}

export default function CartScreen() {
  const t = useTheme()
  const s = useStore()
  const items = s.cart
  const [changing, setChanging] = useState<string | null>(null)
  const [checkingOut, setCheckingOut] = useState(false)

  useFocusEffect(useCallback(() => { s.learnFees() }, [s.learnFees])) // eslint-disable-line react-hooks/exhaustive-deps

  if (!items.length) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={['top']}>
        <View style={styles.empty}>
          <ShoppingBag size={40} color={t.faint} />
          <T kind="h2">Your cart is empty</T>
          <T kind="small" style={{ textAlign: 'center' }}>Tap Add on any product, or pick products from one of your lists.</T>
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
  const billFor = (p: Platform) => bills.find((b) => b.platform === p)
  const anyFees = bills.some((b) => b.known)
  const withFees = grandTotal(bills)
  const afterFees = anyFees ? cheapestAfterFees(items, s.fees) : null
  const mixAssign = Object.fromEntries(cheapest.lines.flatMap((l) => (l.offer ? [[l.item.key, l.offer.platform]] : []))) as Record<string, Platform>
  const mixWithFees = grandTotal(billsFor(items, mixAssign, s.fees))
  const showAfterFees = !!afterFees && afterFees.total < mixWithFees
  const pins = new Set(items.map((i) => i.pinned))
  const onAfterFees = !!afterFees && items.some((i) => i.pinned) && items.every((i) => current[i.key] === afterFees.assign[i.key])
  const mode: 'cheapest' | Platform | 'custom' = pins.size === 1 && pins.has(undefined) ? 'cheapest' : pins.size === 1 ? [...pins][0]! : 'custom'
  const total = anyFees ? withFees : summary.total
  const best = anyFees ? Math.min(mixWithFees, afterFees?.total ?? Infinity) : cheapest.total
  const oldest = Math.min(...items.map((i) => i.updatedAt))

  const byPlatform = new Map<Platform, typeof summary.lines>()
  for (const l of summary.lines) if (l.offer) byPlatform.set(l.offer.platform, [...(byPlatform.get(l.offer.platform) ?? []), l])

  const checkout = async (p: Platform) => {
    setCheckingOut(true)
    try { await s.checkout(p) } catch (e) { s.showToast((e as Error).message) } finally { setCheckingOut(false) }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 32 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
          <View style={{ flex: 1 }}>
            <T kind="title" style={{ fontSize: 26 }}>Your cart</T>
            <T kind="small">{plural(summary.itemCount, 'item')} · prices from {ago(oldest)}</T>
          </View>
          <Button small variant="secondary" label={s.refreshing ? 'Checking…' : 'Refresh'} loading={s.refreshing} icon={!s.refreshing ? <RefreshCw size={14} color={t.ink} /> : undefined} onPress={s.refreshPrices} />
        </View>

        <Card>
          {showAfterFees && afterFees && (
            <Choice active={onAfterFees} onPress={() => s.pinMap(afterFees.assign)} title="Cheapest after fees" subtitle="Fewer deliveries, less in fees" price={afterFees.total} badge="Best total" />
          )}
          <Choice
            active={mode === 'cheapest' && !onAfterFees}
            onPress={() => s.pinAllTo(undefined)}
            title="Cheapest cart"
            subtitle={`Each item from its cheapest app · ${plural(cheapest.platforms.length, 'app')}`}
            price={anyFees ? mixWithFees : cheapest.total}
            badge={showAfterFees ? undefined : 'Best price'}
            divider={showAfterFees}
          />
          {options.slice(0, 4).map((o) => {
            const oneApp = anyFees && !o.missing.length ? grandTotal(billsFor(items, Object.fromEntries(items.map((i) => [i.key, o.platform])), s.fees)) : o.total
            return (
              <Choice
                key={o.platform}
                divider
                active={mode === o.platform}
                onPress={() => s.pinAllTo(o.platform)}
                dot={PLATFORM[o.platform].color}
                title={`All on ${PLATFORM[o.platform].name}`}
                subtitle={o.missing.length ? `Has ${o.covered} of ${items.length} · rest from cheapest` : 'One delivery'}
                price={o.missing.length ? undefined : oneApp}
                delta={o.missing.length ? undefined : oneApp - best}
              />
            )
          })}
        </Card>

        {[...byPlatform].map(([platform, lines]) => {
          const bill = billFor(platform)
          return (
            <Card key={platform}>
              <View style={styles.groupHead}>
                <View style={[styles.dot, { backgroundColor: PLATFORM[platform].color }]} />
                <T kind="bodyStrong" style={{ flex: 1 }}>{PLATFORM[platform].name}</T>
                <T kind="bodyStrong">{rupee(bill?.total ?? lines.reduce((a, l) => a + l.lineTotal, 0))}</T>
              </View>
              {bill?.known && (
                <T kind="small" style={{ paddingHorizontal: 14, paddingBottom: 8 }}>
                  Items {rupee(bill.itemsTotal)} · {bill.delivery ? `delivery ${rupee(bill.delivery)}` : 'free delivery'}
                  {bill.handling ? ` · handling ${rupee(bill.handling)}` : ''}{bill.other ? ` · small cart ${rupee(bill.other)}` : ''}
                </T>
              )}
              {IS_NATIVE && platform === 'blinkit' && (
                <View style={{ paddingHorizontal: 14, paddingBottom: 10 }}>
                  <Button small label="Open in Blinkit with these items" loading={checkingOut} icon={<ArrowUpRight size={14} color={t.bg} />} onPress={() => checkout(platform)} />
                  <T kind="caption" style={{ textAlign: 'center', marginTop: 4 }}>Check out there with your account, coupons and payment.</T>
                </View>
              )}
              {lines.map(({ item, offer, lineTotal }) => {
                const inStock = item.offers.filter((o) => o.inStock).sort((a, b) => a.price - b.price)
                return (
                  <View key={item.key}>
                    <Divider />
                    <View style={styles.line}>
                      <PackIcon variantKey={item.variantKey} imageUrl={offer?.imageUrl} size={30} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <T kind="bodyStrong" numberOfLines={2}>{item.variant}</T>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
                          <T kind="small">{formatSize(item.sizeGrams)}</T>
                          {inStock.length > 1 && (
                            <Pressable onPress={() => { tap(); setChanging(changing === item.key ? null : item.key) }} hitSlop={6}>
                              <Text style={{ color: t.ink, fontFamily: t.fonts.bodyBold, fontSize: 12, textDecorationLine: 'underline' }}>Change app</Text>
                            </Pressable>
                          )}
                          {offer && (
                            <Pressable onPress={() => Linking.openURL(offer.deepLink).catch(() => {})} hitSlop={6} accessibilityLabel={`Open in ${PLATFORM[platform].name}`}>
                              <ArrowUpRight size={15} color={t.faint} />
                            </Pressable>
                          )}
                        </View>
                      </View>
                      <Stepper qty={item.qty} onChange={(q) => s.setCartQty(item.key, q)} />
                      <T kind="bodyStrong" style={{ minWidth: 44, textAlign: 'right' }}>{rupee(lineTotal)}</T>
                    </View>
                    {changing === item.key && (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 14, paddingBottom: 12 }}>
                        <Chip label="Cheapest" active={!item.pinned} onPress={() => { s.pinItem(item.key, undefined); setChanging(null) }} />
                        {inStock.map((o) => (
                          <Chip key={o.platform} label={`${PLATFORM[o.platform].short} ${rupee(o.price)}`} dot={PLATFORM[o.platform].color} active={chosenOffer(item)?.platform === o.platform && !!item.pinned}
                            onPress={() => { s.pinItem(item.key, o.platform); setChanging(null) }} />
                        ))}
                      </ScrollView>
                    )}
                  </View>
                )
              })}
            </Card>
          )
        })}

        {summary.unavailable.length > 0 && (
          <Card style={{ padding: 14, gap: 6, opacity: 0.7 }}>
            <T kind="smallStrong">Out of stock everywhere</T>
            {summary.unavailable.map((i) => (
              <View key={i.key} style={{ flexDirection: 'row', alignItems: 'center' }}>
                <T kind="small" style={{ flex: 1 }}>{i.variant} {formatSize(i.sizeGrams)}</T>
                <Button small variant="ghost" label="Remove" onPress={() => s.setCartQty(i.key, 0)} />
              </View>
            ))}
          </Card>
        )}

        <Card style={{ padding: 16, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
            <T kind="bodyStrong" style={{ flex: 1 }}>Total · {plural(summary.itemCount, 'item')}</T>
            <Text style={{ color: t.ink, fontFamily: t.fonts.display, fontSize: 26 }}>{rupee(total)}</Text>
          </View>
          {summary.savingsVsMrp > 0 && (
            <View style={{ flexDirection: 'row' }}>
              <T kind="smallStrong" style={{ color: t.good, flex: 1 }}>You save {rupee(summary.savingsVsMrp)} vs MRP</T>
              <T kind="small" style={{ textDecorationLine: 'line-through' }}>{rupee(summary.mrpTotal)}</T>
            </View>
          )}
          {total > best + 0.001 ? (
            <Button style={{ marginTop: 8 }} variant="secondary" label={`Switch to ${anyFees && afterFees && afterFees.total <= mixWithFees ? 'cheapest after fees' : 'cheapest cart'} · save ${rupee(total - best)}`}
              onPress={() => (anyFees && afterFees && afterFees.total <= mixWithFees ? s.pinMap(afterFees.assign) : s.pinAllTo(undefined))} />
          ) : (
            <T kind="smallStrong" style={{ color: t.good, marginTop: 2 }}>This is the cheapest cart across all apps</T>
          )}
          <T kind="caption" style={{ marginTop: 6 }}>
            {anyFees
              ? `Includes delivery and handling for ${bills.filter((b) => b.known).map((b) => PLATFORM[b.platform].short).join(', ')}, read from a real bill.`
              : 'Delivery fees and handling charges are not included yet.'}
          </T>
          {items.some((i) => i.offers.some((o) => o.sample)) && <T kind="caption" style={{ color: t.accent }}>Some prices here are sample data. Tap Refresh.</T>}
        </Card>

        <Button variant="ghost" label="Clear cart" onPress={() => Alert.alert('Clear your cart?', undefined, [{ text: 'Cancel', style: 'cancel' }, { text: 'Clear', style: 'destructive', onPress: s.clearCart }])} />
      </ScrollView>
    </SafeAreaView>
  )
}

function Choice({ active, onPress, title, subtitle, price, delta, badge, dot, divider }: {
  active: boolean; onPress: () => void; title: string; subtitle: string; price?: number; delta?: number; badge?: string; dot?: string; divider?: boolean
}) {
  const t = useTheme()
  return (
    <View>
      {divider && <Divider />}
      <Pressable onPress={() => { tap(); onPress() }} style={styles.choice} accessibilityRole="radio" accessibilityState={{ selected: active }}>
        <View style={[styles.radio, { borderColor: active ? t.ink : t.line }]}>{active && <View style={[styles.radioDot, { backgroundColor: t.ink }]} />}</View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {dot && <View style={[styles.dot, { backgroundColor: dot }]} />}
            <T kind="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>{title}</T>
            {badge && <Badge label={badge} tone="good" />}
          </View>
          <T kind="small" numberOfLines={1}>{subtitle}</T>
        </View>
        {price !== undefined && (
          <View style={{ alignItems: 'flex-end' }}>
            <T kind="bodyStrong">{rupee(price)}</T>
            {!!delta && delta > 0 && <T kind="caption">+{rupee(delta)}</T>}
          </View>
        )}
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 32 },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 9, height: 9, borderRadius: 5 },
})
