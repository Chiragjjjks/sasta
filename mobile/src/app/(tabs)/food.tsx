import { router } from 'expo-router'
import { ArrowUpRight, ChevronRight, CircleAlert, Clock } from 'lucide-react-native'
import { useMemo, useState } from 'react'
import { ActivityIndicator, FlatList, Keyboard, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { IS_SAMPLE_DATA } from '@/core/adapters'
import { canSearchFood } from '@/core/food/adapters'
import { namesDish, namesRestaurant, orderable, quoteOrder } from '@/core/food/match'
import type { DishGroup, FoodOutlet, FoodPlatform, FoodStatus, RestaurantMatch } from '@/core/food/types'
import { FOOD_PLATFORM, FOOD_PLATFORMS } from '@/core/platforms'
import { plural, rupee } from '@/core/utils'
import { useFood } from '@/state/food'
import { useStore } from '@/state/store'
import { confirm } from '@/ui/confirm'
import { DishCard } from '@/ui/DishCard'
import { FoodSlots, type FoodRow } from '@/ui/FoodSlots'
import { Badge, Button, Card, Chip, Eyebrow, Headline, Segmented, T, tap } from '@/ui/kit'
import { OrderBar } from '@/ui/OrderBar'
import { PlatformMark } from '@/ui/PlatformMark'
import { SearchHeader } from '@/ui/SearchHeader'
import { useTheme } from '@/ui/theme'
import { VegMark } from '@/ui/VegMark'

type Sort = 'cheapest' | 'gap' | 'fastest'
type Diet = 'all' | 'veg' | 'nonveg' | 'multi'

const example = (platform: FoodPlatform, price: number, etaMinutes: number, deliveryFee: number | undefined, rating: number): FoodRow =>
  ({ platform, price, outlet: { platform, id: 'example', name: 'Meghana Foods', open: true, deepLink: '', etaMinutes, deliveryFee, rating } satisfies FoodOutlet })
const EXAMPLE = [example('zomato', 349, 35, 35, 4.4), example('swiggy_food', 389, 28, undefined, 4.5)]

const SORTS: { value: Sort; label: string }[] = [{ value: 'cheapest', label: 'Cheapest' }, { value: 'gap', label: 'Biggest gap' }, { value: 'fastest', label: 'Fastest' }]

function problemText(s: FoodStatus): string {
  if (s.state === 'needs_login') return 'needs you to sign in.'
  if (s.state === 'timeout') return 'took too long.'
  if (s.state === 'failed') return `couldn't search${s.error ? ` (${s.error})` : ''}.`
  return s.error ?? 'is unavailable right now.'
}

export default function FoodScreen() {
  const t = useTheme()
  const f = useFood()
  const { location } = useStore()
  const [view, setView] = useState<{ query: string; sort: Sort; diet: Diet }>({ query: '', sort: 'cheapest', diet: 'all' })
  const sort = view.query === f.submitted ? view.sort : 'cheapest'
  const diet = view.query === f.submitted ? view.diet : 'all'

  const statuses = FOOD_PLATFORMS.map((p) => f.statuses[p.id]).filter(Boolean) as FoodStatus[]
  const searching = !!f.submitted && (statuses.length < FOOD_PLATFORMS.length || statuses.some((x) => x.state === 'searching'))
  const live = FOOD_PLATFORMS.filter((p) => canSearchFood(p.id))
  const appOnly = FOOD_PLATFORMS.filter((p) => !canSearchFood(p.id))
  const problems = statuses.filter((x) => ['failed', 'timeout', 'needs_login', 'needs_location', 'blocked'].includes(x.state) || (x.state === 'unavailable' && x.error))
  const answered = FOOD_PLATFORMS.filter((p) => (f.dishes[p.id]?.length ?? 0) > 0)

  const visible = useMemo(() => {
    const q = f.submitted
    const keep = (g: DishGroup) => diet === 'all' || (diet === 'veg' ? g.veg === true : diet === 'nonveg' ? g.veg === false : g.offers.length > 1)
    const ok = (g: DishGroup) => (orderable(g.best) ? 0 : 1)
    const named = (g: DishGroup) => (namesDish(g.best, q) ? 0 : 1)
    const eta = (g: DishGroup) => g.best.outlet.etaMinutes ?? 99
    const by: Record<Sort, (a: DishGroup, b: DishGroup) => number> = {
      cheapest: (a, b) => ok(a) - ok(b) || named(a) - named(b) || a.best.price - b.best.price || eta(a) - eta(b),
      gap: (a, b) => ok(a) - ok(b) || b.saving - a.saving || a.best.price - b.best.price,
      fastest: (a, b) => ok(a) - ok(b) || eta(a) - eta(b) || a.best.price - b.best.price,
    }
    return f.groups.filter(keep).sort(by[sort])
  }, [f.groups, f.submitted, diet, sort])
  const hero = searching ? undefined
    : f.groups.filter((g) => g.saving >= 10 && orderable(g.best)).sort((a, b) => b.saving - a.saving || a.best.price - b.best.price)[0]
  // "meghana" names a restaurant; "biryani" names dishes, even though Behrouz Biryani matches it too.
  const dishQuery = f.groups.filter((g) => namesDish(g.best, f.submitted)).length * 2 > f.groups.length
  const places = dishQuery ? [] : f.restaurants.filter((r) => namesRestaurant(r.name, f.submitted)).slice(0, 2)

  const orderPlace = f.order ? f.restaurant(f.order.restaurantKey) : undefined
  const orderQuote = orderPlace && f.order ? quoteOrder(orderPlace, f.order.qty).find((q) => !q.missing.length && q.outlet.open) : undefined
  const orderDishes = f.order ? Object.keys(f.order.qty).length : 0

  const submit = (q: string) => { Keyboard.dismiss(); f.search(q) }
  const openPlace = (key: string) => router.push({ pathname: '/restaurant/[key]', params: { key } })
  const add = (g: DishGroup) => {
    const go = () => f.setOrderQty(g.restaurantKey, g.key, 1)
    if (!f.order || f.order.restaurantKey === g.restaurantKey) return go()
    confirm('Start a new order?', `Your ${orderPlace?.name ?? 'other'} order (${plural(orderDishes, 'dish', 'dishes')}) will be cleared.`, 'Start new', 'Keep', go)
  }

  const header = (
    <SearchHeader value={f.query} onChange={f.setQuery} onSubmit={submit} onClear={f.clear}
      placeholder="Dish or restaurant" recents={f.recents} showRecents={!f.submitted} />
  )
  const orderBar = f.order && orderPlace
    ? <OrderBar restaurant={orderPlace.name} dishes={orderDishes} quote={orderQuote} onPress={() => openPlace(orderPlace.key)} />
    : null

  if (!f.submitted) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={['top']}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: orderBar ? 90 : 24 }}>
          {header}
          <View style={{ paddingHorizontal: 16, paddingTop: 22 }}>
            <Eyebrow live label={`${IS_SAMPLE_DATA ? FOOD_PLATFORMS.length : live.length} food apps · delivering to ${location.pincode}`} />
            <Headline lead="Same biryani," rest="different prices." style={{ marginTop: 12 }} />
            <T kind="small" style={{ marginTop: 10, fontSize: 14.5, lineHeight: 21 }}>
              Type a dish or a restaurant. Sasta checks every food app at once and shows where the same plate is cheapest.
            </T>
            <Card style={{ marginTop: 20, padding: 12, gap: 6 }}>
              <View style={styles.exampleHead}>
                <Eyebrow label="Example · Meghana Foods" style={{ flex: 1 }} />
                <Badge label="Save ₹40" tone="good" />
              </View>
              <View style={styles.exampleDish}>
                <VegMark veg={false} />
                <T kind="h3">Chicken Dum Biryani</T>
              </View>
              <FoodSlots rows={EXAMPLE} chosen="zomato" />
            </Card>
            <Eyebrow label="Food apps Sasta checks" style={{ marginTop: 26 }} />
            <View style={styles.appGrid}>
              {FOOD_PLATFORMS.map((p) => {
                const ready = IS_SAMPLE_DATA || canSearchFood(p.id)
                const body = (
                  <>
                    <PlatformMark platform={p.id} size={20} />
                    <T kind="smallStrong" style={{ flex: 1 }} numberOfLines={1}>{p.short}</T>
                    <T kind="caption" numberOfLines={1}>{IS_SAMPLE_DATA ? 'Sample' : ready ? 'Ready' : 'App only'}</T>
                    {!ready && <ArrowUpRight size={14} color={t.muted} />}
                  </>
                )
                return ready
                  ? <View key={p.id} style={[styles.appTile, { backgroundColor: t.surface }]} accessibilityLabel={`${p.name}: ready`}>{body}</View>
                  : <Pressable key={p.id} onPress={() => f.openApp(p.searchUrl(''))} style={[styles.appTile, { backgroundColor: t.surface }]} accessibilityRole="link" accessibilityLabel={`${p.name}: app only. Open ${p.name}`}>{body}</Pressable>
              })}
            </View>
            <T kind="caption" style={{ textAlign: 'center', marginTop: 18 }}>
              {IS_SAMPLE_DATA ? 'Browser preview · sample prices' : 'Menu prices from each app · Sasta never orders or pays'}
            </T>
          </View>
        </ScrollView>
        {orderBar}
      </SafeAreaView>
    )
  }

  const listHeader = (
    <View>
      {header}
      <View style={{ paddingHorizontal: 16, gap: 12 }}>
        <View style={styles.statusRow}>
          {searching ? <ActivityIndicator size="small" color={t.muted} /> : null}
          <T kind="small" style={{ flex: 1 }}>
            {searching
              ? `Searching ${plural(live.length, 'app')}…`
              : `${plural(f.groups.length, 'dish', 'dishes')} from ${plural(answered.length, 'app')}${f.elapsed !== null ? ` · ${(f.elapsed / 1000).toFixed(1)} s` : ''}`}
          </T>
          <View style={{ flexDirection: 'row', gap: 4 }} accessibilityLabel={`${answered.length} of ${FOOD_PLATFORMS.length} apps have results`}>
            {FOOD_PLATFORMS.map((p) => (
              <PlatformMark key={p.id} platform={p.id} size={18} style={{ opacity: answered.includes(p) ? 1 : 0.25 }} />
            ))}
          </View>
        </View>

        {problems.length > 0 && !searching && (
          <Card style={{ padding: 14, gap: 10 }}>
            {problems.map((p) => (
              <View key={p.platform} style={styles.problem}>
                <CircleAlert size={16} color={t.accentText} style={{ marginTop: 1 }} />
                <T kind="small" style={{ flex: 1, color: t.ink }}>
                  <Text style={{ fontFamily: t.fonts.bodyBold }}>{FOOD_PLATFORM[p.platform].name}: </Text>{problemText(p)}
                </T>
                {p.state === 'needs_location' && <Button small variant="secondary" label="Set location" onPress={() => router.push('/location')} />}
                {p.state === 'needs_login' && <Button small variant="secondary" label="Connect" onPress={() => router.navigate('/account')} />}
                {p.state === 'blocked' && <Button small variant="secondary" label="Open" onPress={() => f.openApp(FOOD_PLATFORM[p.platform].searchUrl(f.submitted))} />}
                {(p.state === 'timeout' || p.state === 'failed') && <Button small variant="secondary" label="Retry" onPress={() => f.search(f.submitted, { force: true })} />}
              </View>
            ))}
          </Card>
        )}

        {places.map((r) => <PlaceCard key={r.key} r={r} onOpen={() => openPlace(r.key)} />)}

        {hero && hero.key !== visible[0]?.key && !places.some((r) => r.key === hero.restaurantKey) && <GapHero g={hero} onPress={() => openPlace(hero.restaurantKey)} />}

        {!searching && f.groups.length > 1 && (
          <>
            <Segmented stretch value={sort} options={SORTS} onChange={(v) => setView({ query: f.submitted, sort: v, diet })} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow} style={{ marginHorizontal: -16 }}>
              {([['all', 'All'], ['veg', 'Veg'], ['nonveg', 'Non-veg'], ['multi', 'On 2+ apps']] as const).map(([v, label]) => (
                <Chip key={v} label={label} active={diet === v} leading={v === 'veg' ? <VegMark veg /> : v === 'nonveg' ? <VegMark veg={false} /> : undefined}
                  onPress={() => setView({ query: f.submitted, sort, diet: diet === v && v !== 'all' ? 'all' : v })} />
              ))}
            </ScrollView>
          </>
        )}

        {visible.length > 0 && <Eyebrow label={`${sort === 'gap' ? 'Same dish, cheaper elsewhere' : sort === 'fastest' ? 'Fastest first' : 'Cheapest first'} · ${plural(visible.length, 'dish', 'dishes')}`} style={{ marginTop: 4, marginBottom: 10 }} />}
      </View>
    </View>
  )

  const footer = !searching && appOnly.length > 0 && !IS_SAMPLE_DATA ? (
    <View style={[styles.appOnly, { borderColor: t.line }]}>
      <T kind="small">{appOnly.map((p) => p.name).join(' and ')} {appOnly.length === 1 ? 'is' : 'are'} app-only, so Sasta can’t read prices there yet.</T>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {appOnly.map((p) => (
          <Pressable key={p.id} onPress={() => { tap(); f.openApp(p.searchUrl(f.submitted)) }} style={[styles.openPill, { backgroundColor: t.chip }]} accessibilityRole="link">
            <PlatformMark platform={p.id} size={16} />
            <T kind="smallStrong">Open {p.short}</T>
            <ArrowUpRight size={14} color={t.ink} />
          </Pressable>
        ))}
      </View>
    </View>
  ) : undefined

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={['top']}>
      <FlatList
        data={visible}
        keyExtractor={(g) => g.key}
        ListHeaderComponent={listHeader}
        ListFooterComponent={footer}
        renderItem={({ item }) => (
          <View style={{ paddingHorizontal: 16 }}>
            <DishCard group={item} qty={f.order?.restaurantKey === item.restaurantKey ? f.order.qty[item.key] ?? 0 : 0} multiApp={answered.length > 1}
              onOpen={(g) => openPlace(g.restaurantKey)} onAdd={add} onQty={(g, q) => f.setOrderQty(g.restaurantKey, g.key, q)} />
          </View>
        )}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListEmptyComponent={
          searching ? (
            <View style={styles.empty}>
              <ActivityIndicator color={t.muted} />
              <T kind="small">Checking {live.map((p) => p.name).join(', ')}…</T>
            </View>
          ) : (
            <View style={styles.empty}>
              <Clock size={28} color={t.faint} />
              <T kind="bodyStrong">{problems.length ? 'No dishes this time' : 'No dishes found'}</T>
              <T kind="small" style={{ textAlign: 'center' }}>{problems.length ? 'See above for what went wrong.' : 'Try a dish like biryani, or a restaurant name.'}</T>
            </View>
          )
        }
        contentContainerStyle={{ paddingBottom: orderBar ? 90 : 24 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        initialNumToRender={8}
        windowSize={7}
        removeClippedSubviews
      />
      {orderBar}
    </SafeAreaView>
  )
}

/** The biggest same-dish saving in the results, as a dark card that opens the restaurant. */
function GapHero({ g, onPress }: { g: DishGroup; onPress: () => void }) {
  const t = useTheme()
  const priciest = [...g.offers].filter(orderable).sort((a, b) => b.price - a.price)[0]
  return (
    <Pressable onPress={onPress} style={[styles.hero, { backgroundColor: t.hero }]} accessibilityRole="button">
      <PlatformMark platform={g.best.platform} size={44} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.heroMuted, fontFamily: t.fonts.mono, fontSize: 11, letterSpacing: 1.3 }}>BIGGEST GAP RIGHT NOW</Text>
        <Text style={{ color: t.heroText, fontFamily: t.fonts.displayBold, fontSize: 17, marginTop: 3 }} numberOfLines={2}>{g.dish}, {g.restaurant}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
          <Text style={{ color: t.accent, fontFamily: t.fonts.display, fontSize: 26 }}>{rupee(g.best.price)}</Text>
          <Text style={{ color: t.heroMuted, fontFamily: t.fonts.body, fontSize: 12.5 }}>
            on {FOOD_PLATFORM[g.best.platform].name} · {rupee(g.saving)} less than {FOOD_PLATFORM[priciest.platform].short}
          </Text>
        </View>
      </View>
    </Pressable>
  )
}

/** The query names a restaurant: lead with it, and say which app is cheapest across its shared dishes. */
function PlaceCard({ r, onOpen }: { r: RestaurantMatch; onOpen: () => void }) {
  const t = useTheme()
  const apps = FOOD_PLATFORMS.filter((p) => r.outlets[p.id])
  const shared = r.dishes.filter((g) => g.offers.filter(orderable).length > 1)
  const wins = new Map<FoodPlatform, number>()
  for (const g of shared) wins.set(g.best.platform, (wins.get(g.best.platform) ?? 0) + 1)
  const [top, n] = [...wins].sort((a, b) => b[1] - a[1])[0] ?? []
  return (
    <Pressable onPress={() => { tap(); onOpen() }} style={[styles.place, { backgroundColor: t.surface }]} accessibilityRole="button" accessibilityLabel={`${r.name}: compare the menu on every app`}>
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <Text style={{ color: t.ink, fontFamily: t.fonts.displayBold, fontSize: 16 }} numberOfLines={1}>{r.name}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {apps.map((p) => <PlatformMark key={p.id} platform={p.id} size={16} />)}
          <T kind="caption" style={{ marginLeft: 4 }} numberOfLines={1}>{r.area ? `${r.area} · ` : ''}on {plural(apps.length, 'app')}</T>
        </View>
        <T kind="small" style={{ color: top ? t.good : t.muted, fontFamily: t.fonts.bodySemi }} numberOfLines={1}>
          {top ? `Cheapest on ${FOOD_PLATFORM[top].short} for ${n} of ${plural(shared.length, 'shared dish', 'shared dishes')}` : `${plural(r.dishes.length, 'dish', 'dishes')} found`}
        </T>
      </View>
      <View style={[styles.placeBtn, { backgroundColor: t.chip }]}>
        <T kind="smallStrong">Menu</T>
        <ChevronRight size={15} color={t.ink} />
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  appGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  appTile: { width: '48.5%', flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, height: 48, borderRadius: 16 },
  exampleHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 },
  exampleDish: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4, paddingBottom: 2 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  problem: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 22, padding: 16 },
  chipRow: { gap: 8, paddingHorizontal: 16 },
  place: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 20, padding: 14 },
  placeBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 36, borderRadius: 18, paddingLeft: 12, paddingRight: 8 },
  appOnly: { marginHorizontal: 16, marginTop: 16, padding: 14, borderRadius: 18, borderWidth: 1, gap: 10 },
  openPill: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, borderRadius: 17, paddingHorizontal: 12 },
  empty: { padding: 40, alignItems: 'center', gap: 8 },
})
