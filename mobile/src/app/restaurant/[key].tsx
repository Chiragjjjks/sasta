import { router, Stack, useLocalSearchParams } from 'expo-router'
import { Plus } from 'lucide-react-native'
import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { namesDish, orderable, quoteOrder, usualWinner } from '@/core/food/match'
import type { DishGroup, FoodPlatform, RestaurantMatch } from '@/core/food/types'
import { FOOD_PLATFORM, FOOD_PLATFORMS } from '@/core/platforms'
import { plural, rupee } from '@/core/utils'
import { useFood } from '@/state/food'
import { useStore } from '@/state/store'
import { confirm } from '@/ui/confirm'
import { FoodSlots, type FoodRow } from '@/ui/FoodSlots'
import { Button, Card, Chip, Eyebrow, Stepper, T, tap } from '@/ui/kit'
import { PlanHero } from '@/ui/PlanHero'
import { PlatformMark } from '@/ui/PlatformMark'
import { useTheme } from '@/ui/theme'
import { VegMark } from '@/ui/VegMark'

type Diet = 'all' | 'veg' | 'nonveg'

/**
 * One restaurant on every app: what your order costs on each (items plus the fee the app shows),
 * and its menu with each app's price side by side. Opening the app is the only action; Sasta never orders.
 */
export default function RestaurantScreen() {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const { key } = useLocalSearchParams<{ key: string }>()
  const f = useFood()
  const { showToast } = useStore()
  const [pinned, setPinned] = useState<FoodPlatform>()
  const [diet, setDiet] = useState<Diet>('all')
  const r = f.restaurant(key)
  const check = f.menuChecks[key]
  const { loadMenu } = f

  useEffect(() => { void loadMenu(key) }, [key, loadMenu])

  const qty = useMemo(() => (f.order?.restaurantKey === key ? f.order.qty : {}), [f.order, key])
  const dishes = useMemo(() => {
    if (!r) return []
    const named = (g: DishGroup) => (namesDish(g.best, f.submitted) ? 0 : 1)
    return r.dishes
      .filter((g) => diet === 'all' || (diet === 'veg' ? g.veg === true : g.veg === false))
      .sort((a, b) => named(a) - named(b) || Number(!!b.best.bestseller) - Number(!!a.best.bestseller) || b.saving - a.saving || a.dish.localeCompare(b.dish))
  }, [r, diet, f.submitted])

  if (!r) {
    return (
      <View style={[styles.missing, { backgroundColor: t.bg }]}>
        <Stack.Screen options={{ title: '' }} />
        <T kind="h3">This restaurant isn’t in your latest search</T>
        <T kind="small" style={{ textAlign: 'center' }}>Search for it again in Food to compare its menu.</T>
        <Button small label="Back to Food" onPress={() => router.back()} />
      </View>
    )
  }

  const apps = FOOD_PLATFORMS.filter((p) => r.outlets[p.id])
  const picks = Object.keys(qty).length
  const count = Object.values(qty).reduce((s, n) => s + n, 0)
  const quotes = quoteOrder(r, qty)
  const complete = quotes.filter((q) => q.outlet.open && !q.missing.length)
  const chosen = complete.find((q) => q.platform === pinned) ?? complete[0]
  const cheapest = complete[0]
  const priciest = complete[complete.length - 1]
  const nameOf = (k: string) => r.dishes.find((g) => g.key === k)?.dish ?? 'a dish'
  const rows: FoodRow[] = quotes.map((q) => ({
    platform: q.platform, price: q.total, outlet: q.outlet, plus: q.deliveryFee === undefined,
    reason: !q.outlet.open ? 'Closed now' : !picks ? undefined : q.missing.length ? `Doesn't list ${nameOf(q.missing[0])}${q.missing.length > 1 ? ` and ${q.missing.length - 1} more` : ''}` : undefined,
  }))

  const setQty = (g: DishGroup, n: number) => {
    const go = () => f.setOrderQty(r.key, g.key, n)
    if (!f.order || f.order.restaurantKey === r.key) return go()
    const other = f.restaurant(f.order.restaurantKey)?.name ?? 'other'
    confirm('Start a new order?', `Your ${other} order (${plural(Object.keys(f.order.qty).length, 'dish', 'dishes')}) will be cleared.`, 'Start new', 'Keep', go)
  }

  const openChosen = () => {
    if (!chosen) return
    const lines = Object.entries(qty).map(([k, n]) => `${n} × ${nameOf(k)}`).join(', ')
    showToast(`Opening ${FOOD_PLATFORM[chosen.platform].name}. Add: ${lines}`)
    f.openApp(chosen.outlet.deepLink)
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen options={{ title: r.name }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 14, paddingBottom: 140 + insets.bottom }}>
        <T kind="small">{r.area ? `${r.area} · ` : ''}on {apps.length} of {FOOD_PLATFORMS.length} apps</T>

        {picks ? (
          <PlanHero
            label={complete.length < 2 ? 'Your order' : priciest.total > cheapest.total ? 'Cheapest for your order' : 'Same total on every app'}
            total={cheapest?.total}
            sub={cheapest ? `on ${FOOD_PLATFORM[cheapest.platform].name} · ${plural(count, 'item')}${cheapest.deliveryFee === undefined ? ' + fees' : ''}` : 'No app has all of these'}
            groups={[]}
            saving={complete.length > 1 && priciest.total > cheapest.total ? `${rupee(priciest.total - cheapest.total)} less than ${FOOD_PLATFORM[priciest.platform].short}` : undefined}
          />
        ) : <Verdict r={r} />}

        <Card style={{ padding: 8 }}>
          <FoodSlots rows={rows} priced={picks > 0} showOffer chosen={chosen?.platform} pinned={pinned} onPick={picks ? setPinned : undefined} />
        </Card>

        <View style={styles.menuHead}>
          <Eyebrow label="Menu · same dish on every app" style={{ flex: 1 }} />
          {check?.running && <ActivityIndicator size="small" color={t.muted} />}
        </View>
        {!!check?.failed.length && (
          <View style={styles.failed}>
            <T kind="small" style={{ flex: 1 }}>Couldn’t read the menu on {check.failed.map((p) => FOOD_PLATFORM[p].short).join(' and ')}.</T>
            <Button small variant="secondary" label="Retry" onPress={() => loadMenu(key, { force: true })} />
          </View>
        )}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {([['all', 'All'], ['veg', 'Veg'], ['nonveg', 'Non-veg']] as const).map(([v, label]) => (
            <Chip key={v} label={label} active={diet === v} leading={v === 'veg' ? <VegMark veg /> : v === 'nonveg' ? <VegMark veg={false} /> : undefined}
              onPress={() => setDiet(diet === v && v !== 'all' ? 'all' : v)} />
          ))}
        </View>
        <Card>
          {dishes.map((g, n) => <MenuRow key={g.key} g={g} r={r} apps={apps} qty={qty[g.key] ?? 0} onQty={(q) => setQty(g, q)} first={n === 0} />)}
          {!dishes.length && <T kind="small" style={{ padding: 16 }}>No {diet === 'veg' ? 'veg ' : diet === 'nonveg' ? 'non-veg ' : ''}dishes found here.</T>}
        </Card>
      </ScrollView>

      <View style={[styles.bottom, { backgroundColor: t.bg, borderTopColor: t.line, paddingBottom: Math.max(insets.bottom, 12) }]}>
        {chosen && picks > 0 && (
          <T kind="caption" style={{ textAlign: 'center' }}>
            Sasta never orders. Add {count === 1 ? 'this dish' : `these ${count} items`} in {FOOD_PLATFORM[chosen.platform].short}; taxes and offers apply there.
          </T>
        )}
        <Button
          label={chosen && picks ? `Open in ${FOOD_PLATFORM[chosen.platform].short} · ${rupee(chosen.total)}${chosen.deliveryFee === undefined ? '+' : ''}` : picks ? 'No app has all of these' : 'Pick a dish to compare'}
          icon={chosen && picks ? <PlatformMark platform={chosen.platform} size={20} /> : undefined}
          disabled={!chosen || !picks}
          onPress={openChosen}
        />
      </View>
    </View>
  )
}

/** Before anything is picked: which app wins most of the dishes listed on more than one app. */
function Verdict({ r }: { r: RestaurantMatch }) {
  const t = useTheme()
  const { platform: top, wins, differ, same } = usualWinner(r)
  const most = Math.max(0, ...r.dishes.map((g) => g.saving))
  const title = top ? `${FOOD_PLATFORM[top].name}, for ${wins} of ${plural(differ + same, 'dish', 'dishes')}`
    : same ? 'Same menu price on every app' : `${plural(r.dishes.length, 'dish', 'dishes')} to compare`
  const note = top ? `Up to ${rupee(most)} less on one dish. ` : same ? 'Fees, offers and delivery time still differ. ' : ''
  return (
    <View style={[styles.verdict, { backgroundColor: t.hero }]}>
      {top && <PlatformMark platform={top} size={40} />}
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.heroMuted, fontFamily: t.fonts.mono, fontSize: 11, letterSpacing: 1.3 }}>{top ? 'CHEAPER HERE, MOSTLY' : same ? `${plural(same, 'DISH', 'DISHES')} ON MORE THAN ONE APP` : 'ONE APP ONLY'}</Text>
        <Text style={{ color: t.heroText, fontFamily: t.fonts.displayBold, fontSize: 18, marginTop: 3 }}>{title}</Text>
        <Text style={{ color: t.heroMuted, fontFamily: t.fonts.body, fontSize: 12.5, marginTop: 3 }}>{note}Add dishes to price your order on every app.</Text>
      </View>
    </View>
  )
}

/** One dish: its quantity in your order, then a price cell per app, the cheapest in green. */
function MenuRow({ g, r, apps, qty, onQty, first }: { g: DishGroup; r: RestaurantMatch; apps: typeof FOOD_PLATFORMS; qty: number; onQty: (q: number) => void; first: boolean }) {
  const t = useTheme()
  const cheapest = g.offers.filter(orderable)[0]?.price
  const can = !!cheapest
  return (
    <View style={[styles.row, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.line }]}>
      <View style={styles.rowHead}>
        <View style={{ marginTop: 3 }}><VegMark veg={g.veg} /></View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <T kind="bodyStrong" numberOfLines={2}>{g.dish}</T>
          {(!!g.portion || !!g.best.bestseller) && (
            <Text style={{ color: t.muted, fontFamily: t.fonts.body, fontSize: 12, marginTop: 1 }}>
              {g.portion ?? ''}{g.portion && g.best.bestseller ? ' · ' : ''}
              {g.best.bestseller ? <Text style={{ color: t.accentText, fontFamily: t.fonts.bodySemi }}>Bestseller</Text> : null}
            </Text>
          )}
        </View>
        {can && (qty > 0 ? <Stepper qty={qty} onChange={onQty} /> : (
          <Pressable onPress={() => { tap(); onQty(1) }} hitSlop={6} style={[styles.add, { borderColor: t.lineStrong }]} accessibilityRole="button" accessibilityLabel={`Add ${g.dish}`}>
            <Plus size={14} color={t.ink} /><T kind="smallStrong">Add</T>
          </Pressable>
        ))}
      </View>
      <View style={styles.cells}>
        {apps.map((p) => {
          const d = g.offers.find((o) => o.platform === p.id)
          const ok = !!d && orderable(d)
          // Green only when another app charges more; equal prices stay neutral.
          const best = ok && d.price === cheapest && g.saving > 0
          const note = !d ? 'Not listed' : !r.outlets[p.id]?.open ? 'Closed' : !d.available ? 'Sold out' : ''
          return (
            <View key={p.id} style={[styles.cell, { backgroundColor: best ? t.goodBg : t.chip }]}
              accessibilityLabel={`${p.name}: ${ok ? rupee(d.price) : note}${best ? ', cheapest' : ''}`}>
              <PlatformMark platform={p.id} size={14} style={!ok ? { opacity: 0.5 } : undefined} />
              {ok ? (
                <Text style={{ color: best ? t.good : t.ink, fontFamily: t.fonts.bodyBold, fontSize: 13, fontVariant: ['tabular-nums'] }}>
                  {rupee(d.price)}
                  {d.price > cheapest! ? <Text style={{ color: t.muted, fontFamily: t.fonts.mono, fontSize: 10.5 }}>{` +${d.price - cheapest!}`}</Text> : null}
                </Text>
              ) : <Text style={{ color: t.muted, fontFamily: t.fonts.body, fontSize: 12 }}>{note}</Text>}
            </View>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  verdict: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 20, padding: 16 },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 32 },
  menuHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  failed: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  row: { padding: 14, gap: 10 },
  rowHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  add: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 34, borderRadius: 17, borderWidth: 1, paddingHorizontal: 12 },
  cells: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingLeft: 24 },
  cell: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 30, borderRadius: 9, paddingHorizontal: 8 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 10, gap: 8, borderTopWidth: StyleSheet.hairlineWidth },
})
