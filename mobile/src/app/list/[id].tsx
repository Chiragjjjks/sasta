import { router, Stack, useLocalSearchParams } from 'expo-router'
import { ArrowUpRight, Check, ChevronDown, MoreHorizontal, RefreshCw, Search, Share2, Trash2 } from 'lucide-react-native'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ActivityIndicator, Alert, FlatList, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { chosenListOffer, itemPack, itemTitle, listPlan, priceDrop, rankedOffers, sameAsLastTime, singleAppTotals, type ListItem, type ListPlan } from '@/core/lists'
import { PLATFORM } from '@/core/platforms'
import type { Platform } from '@/core/types'
import { plural, rupee } from '@/core/utils'
import { useStore } from '@/state/store'
import { Badge, Button, Card, Chip, Segmented, Stepper, T, tap } from '@/ui/kit'
import { PackIcon } from '@/ui/PackIcon'
import { PlatformMark } from '@/ui/PlatformMark'
import { useTheme } from '@/ui/theme'

const EMOJIS = ['🛒', '🏢', '🎉', '🏠', '🍿', '🥛', '🧴', '👶', '🐶', '🛍️']
/** Rows shown under an item before "more apps". */
const SLOTS = 4

function ago(ts: number) {
  const m = Math.round((Date.now() - ts) / 60000)
  if (m < 60) return m < 1 ? 'just now' : `${m} min ago`
  const h = Math.round(m / 60)
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} days ago`
}

export default function ListDetail() {
  const t = useTheme()
  const { id } = useLocalSearchParams<{ id: string }>()
  const s = useStore()
  const list = s.lists.find((l) => l.id === id)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [view, setView] = useState<'item' | 'app'>('item')
  const [editing, setEditing] = useState(false)
  const [menu, setMenu] = useState<string | null>(null)
  const [more, setMore] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState(list?.name ?? '')
  const [emoji, setEmoji] = useState(list?.emoji ?? '🛍️')

  // Opening a list checks every item on every app. Searches from the last 10 minutes come from the cache.
  const { refreshList } = s
  useEffect(() => { if (id) refreshList(id) }, [id, refreshList])

  const last = useMemo(() => new Set(list ? sameAsLastTime(list) : []), [list])
  const scope = useMemo(() => (list ? (picked.size ? list.items.filter((i) => picked.has(i.key)) : list.items) : []), [list, picked])
  const plan = useMemo(() => listPlan(scope), [scope])
  const singles = useMemo(() => singleAppTotals(scope), [scope])

  if (!list) return <View style={{ flex: 1, padding: 24 }}><T kind="bodyStrong">This list was deleted.</T></View>

  const check = s.listChecks[list.id]
  const toggle = (k: string) => { tap(); setPicked((p) => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n }) }
  const others = s.lists.filter((l) => l.id !== list.id)
  const lastSeen = list.items.length ? Math.min(...list.items.map((i) => i.lastSeenAt)) : list.updatedAt
  const inStock = list.items.filter((i) => chosenListOffer(i)).length
  const buyKeys = scope.filter((i) => chosenListOffer(i)).map((i) => i.key)

  const add = async () => {
    setBusy(true)
    try {
      const n = await s.addListToCart(list.id, buyKeys)
      setPicked(new Set())
      if (n) router.navigate('/cart')
    } finally { setBusy(false) }
  }
  const searchAgain = (i: ListItem) => { s.setQuery(i.query); s.search(i.query, { force: true }); router.navigate('/') }

  const confirmDelete = () => Alert.alert(`Delete ${list.name}?`, 'The products stay in your cart if you added them.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => { s.deleteList(list.id); router.back() } },
  ])

  const header = (
    <View style={{ gap: 12, marginBottom: 2 }}>
      <View style={styles.status}>
        {check?.running ? <ActivityIndicator size="small" color={t.muted} /> : <View style={[styles.liveDot, { backgroundColor: inStock ? t.good : t.faint }]} />}
        <T kind="small" style={{ flex: 1 }}>
          {check?.running
            ? `Checking ${plural(list.items.length, 'item')} on every app…`
            : list.items.length ? `Prices from ${ago(lastSeen)} · ${inStock} of ${list.items.length} in stock` : 'Empty list'}
        </T>
        {!check?.running && list.items.length > 0 && (
          <Pressable onPress={() => s.refreshList(list.id, { force: true })} hitSlop={8} style={styles.refresh} accessibilityLabel="Check prices again">
            <RefreshCw size={13} color={t.ink} /><T kind="smallStrong">Refresh</T>
          </Pressable>
        )}
      </View>

      {editing && (
        <Card style={{ padding: 14, gap: 12 }}>
          <TextInput value={name} onChangeText={setName} style={[styles.input, { backgroundColor: t.chip, color: t.ink, fontFamily: t.fonts.bodyBold }]} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {EMOJIS.map((e) => (
              <Pressable key={e} onPress={() => setEmoji(e)} style={[styles.emojiBtn, { backgroundColor: e === emoji ? t.ink : t.chip }]}>
                <Text style={{ fontSize: 18 }}>{e}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button flex small label="Save" onPress={() => { s.renameList(list.id, name, emoji); setEditing(false) }} />
            <Button small variant="secondary" label="Share" icon={<Share2 size={14} color={t.ink} />} onPress={() => s.shareList(list.id, picked.size ? [...picked] : list.items.map((i) => i.key))} />
            <Button small variant="secondary" label="Delete" icon={<Trash2 size={14} color={t.ink} />} onPress={confirmDelete} />
          </View>
        </Card>
      )}

      {list.items.length > 0 && (
        <PlanCard plan={plan} singles={singles} scopeLabel={picked.size ? `these ${picked.size}` : `all ${list.items.length}`}
          onPick={(p) => s.pinListTo(list.id, p)} />
      )}

      {list.items.length > 0 && (
        <>
          <Segmented stretch value={view} onChange={setView} options={[{ value: 'item', label: 'By item' }, { value: 'app', label: 'By app' }]} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }} style={{ marginHorizontal: -16 }}>
            <Chip label="Same as last time" onPress={last.size ? () => setPicked(new Set(last)) : undefined} style={{ opacity: last.size ? 1 : 0.4 }} />
            <Chip label={picked.size ? `${picked.size} picked · clear` : 'Pick some'} active={picked.size > 0}
              onPress={() => setPicked(picked.size ? new Set() : new Set(list.items.map((i) => i.key)))} />
          </ScrollView>
        </>
      )}
    </View>
  )

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={['bottom']}>
      <Stack.Screen options={{
        title: `${list.emoji} ${list.name}`,
        headerRight: () => (
          <Pressable onPress={() => setEditing((e) => !e)} hitSlop={10} accessibilityLabel="List options">
            <MoreHorizontal size={22} color={t.ink} />
          </Pressable>
        ),
      }} />
      {view === 'item' || !list.items.length ? (
        <FlatList
          data={list.items}
          keyExtractor={(i) => i.key}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 110 }}
          refreshing={false}
          onRefresh={() => s.refreshList(list.id, { force: true })}
          ListHeaderComponent={header}
          ListEmptyComponent={<T kind="small" style={{ textAlign: 'center', paddingVertical: 40 }}>This list is empty. Tap the bookmark on any product to save it here.</T>}
          renderItem={({ item: i }) => (
            <ItemCard item={i} picked={picked.has(i.key)} lastTime={last.has(i.key)} showAll={more.has(i.key)}
              onToggle={() => toggle(i.key)} onQty={(q) => s.setListQty(list.id, i.key, q)}
              onPin={(p) => { tap(); s.pinListItem(list.id, i.key, p) }}
              onMore={() => setMore((m) => new Set(m).add(i.key))}
              onMenu={() => setMenu(menu === i.key ? null : i.key)} onSearch={() => searchAgain(i)}
              menu={menu === i.key && (
                <View style={styles.menu}>
                  {others.map((l) => (
                    <View key={l.id} style={{ flexDirection: 'row', gap: 6 }}>
                      <Chip label={`Move to ${l.emoji} ${l.name}`} onPress={() => { s.moveListItem(list.id, l.id, i.key, false); setMenu(null) }} />
                      <Chip label="Copy" onPress={() => { s.moveListItem(list.id, l.id, i.key, true); setMenu(null) }} />
                    </View>
                  ))}
                  <Chip label="Remove from list" onPress={() => { s.removeFromList(list.id, i.key); setMenu(null) }} />
                </View>
              )} />
          )}
        />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 110 }}>
          {header}
          {plan.groups.map((g) => <AppOrder key={g.platform} group={g} onOpen={(url, p) => Linking.openURL(url).catch(() => s.showToast(`Could not open ${PLATFORM[p].name}`))} />)}
          {plan.missing.length > 0 && (
            <Card style={[styles.app, { borderLeftColor: t.line }]}>
              <View style={styles.appHead}>
                <View style={{ flex: 1 }}><T kind="h3" style={{ color: t.muted }}>Not available anywhere</T><T kind="small">Search again later, or try another pack</T></View>
              </View>
              {plan.missing.map((i) => (
                <Pressable key={i.key} onPress={() => searchAgain(i)} style={[styles.line, { borderTopColor: t.line }]}>
                  <T kind="body" style={{ flex: 1, color: t.muted }} numberOfLines={1}>{itemTitle(i)} {itemPack(i)}</T>
                  <Search size={14} color={t.muted} />
                </Pressable>
              ))}
            </Card>
          )}
        </ScrollView>
      )}
      {buyKeys.length > 0 && (
        <View style={styles.cta}>
          <Button label={busy ? 'Checking prices…' : `Add ${picked.size ? buyKeys.length : `all ${buyKeys.length}`} to cart · ${rupee(plan.total)}`} loading={busy} onPress={add} />
        </View>
      )}
    </SafeAreaView>
  )
}

/** The answer first: total, how it splits across apps, and one-app alternatives. */
function PlanCard({ plan, singles, scopeLabel, onPick }: { plan: ListPlan; singles: ReturnType<typeof singleAppTotals>; scopeLabel: string; onPick: (p: Platform | undefined) => void }) {
  const t = useTheme()
  const only = plan.pinned && plan.groups.length === 1 ? plan.groups[0].platform : undefined
  const fullCover = singles.filter((x) => x.covered === plan.available && plan.available > 0)
  const beat = !plan.pinned && plan.groups.length > 1 && fullCover.length ? fullCover[0] : undefined
  return (
    <View style={[styles.hero, { backgroundColor: t.hero }]}>
      <Text style={[styles.heroK, { fontFamily: t.fonts.bodySemi }]}>{plan.pinned ? `Your plan for ${scopeLabel}` : `Cheapest way to buy ${scopeLabel}`}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <Text style={{ color: t.heroText, fontFamily: t.fonts.display, fontSize: 32, letterSpacing: -0.6 }}>{plan.available ? rupee(plan.total) : '—'}</Text>
        <Text style={{ color: t.heroMuted, fontFamily: t.fonts.bodySemi, fontSize: 12.5 }}>
          {plan.available ? `from ${plural(plan.groups.length, 'app')} · before fees` : 'no app has these right now'}
          {plan.missing.length ? ` · ${plan.missing.length} not found` : ''}
        </Text>
      </View>
      {plan.groups.length > 0 && (
        <View style={styles.bar}>
          {plan.groups.map((g) => <View key={g.platform} style={{ flex: g.total, backgroundColor: PLATFORM[g.platform].mark.bg }} />)}
        </View>
      )}
      <View style={styles.legend}>
        {plan.groups.map((g) => (
          <View key={g.platform} style={styles.legendItem}>
            <PlatformMark platform={g.platform} size={18} />
            <Text style={{ color: t.heroText, fontFamily: t.fonts.bodySemi, fontSize: 12.5 }}>{PLATFORM[g.platform].short} {rupee(g.total)}</Text>
          </View>
        ))}
      </View>
      {beat && beat.total > plan.total && (
        <Text style={{ color: '#9fe3bb', fontFamily: t.fonts.bodySemi, fontSize: 12.5, marginTop: 8 }}>
          {rupee(beat.total - plan.total)} less than buying everything on {PLATFORM[beat.platform].short}
        </Text>
      )}
      {singles.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }} style={{ marginTop: 10 }}>
          <HeroPill on={!plan.pinned} label="Cheapest mix" onPress={() => onPick(undefined)} />
          {singles.slice(0, 4).map((x) => (
            <HeroPill key={x.platform} on={only === x.platform} platform={x.platform}
              label={`Only ${PLATFORM[x.platform].short} ${rupee(x.total)}${x.covered < plan.available ? ` · ${x.covered} of ${plan.available}` : ''}`}
              onPress={() => onPick(x.platform)} />
          ))}
        </ScrollView>
      )}
    </View>
  )
}

function HeroPill({ on, label, platform, onPress }: { on: boolean; label: string; platform?: Platform; onPress: () => void }) {
  const t = useTheme()
  return (
    <Pressable onPress={() => { tap(); onPress() }} accessibilityRole="button" accessibilityState={{ selected: on }}
      style={[styles.pill, { backgroundColor: on ? '#fff' : 'transparent', borderColor: on ? '#fff' : '#ffffff40' }]}>
      {on && !platform && <Check size={12} color={t.hero} />}
      {platform && <PlatformMark platform={platform} size={16} />}
      <Text style={{ color: on ? t.hero : t.heroText, fontFamily: t.fonts.bodySemi, fontSize: 12 }}>{label}</Text>
    </Pressable>
  )
}

/** One product and every app that has it, cheapest first. Tap an app to buy this item there. */
function ItemCard({ item: i, picked, lastTime, showAll, onToggle, onQty, onPin, onMore, onMenu, onSearch, menu }: {
  item: ListItem; picked: boolean; lastTime: boolean; showAll: boolean
  onToggle: () => void; onQty: (q: number) => void; onPin: (p: Platform | undefined) => void; onMore: () => void
  onMenu: () => void; onSearch: () => void; menu: ReactNode
}) {
  const t = useTheme()
  const { inStock, outOfStock } = rankedOffers(i)
  const chosen = chosenListOffer(i)
  const cheapestTotal = inStock[0] ? inStock[0].price * i.qty : 0
  const drop = priceDrop(i)
  // Always show the app this item is bought from, even past the first rows.
  const rows = showAll ? inStock : inStock.filter((o, n) => n < SLOTS || o.platform === chosen?.platform)
  return (
    <Card style={{ opacity: chosen ? 1 : 0.75 }}>
      <View style={styles.itemHead}>
        <Pressable onPress={onToggle} hitSlop={8} accessibilityRole="checkbox" accessibilityState={{ checked: picked }}
          style={[styles.check, { borderColor: picked ? t.ink : t.line, backgroundColor: picked ? t.ink : 'transparent' }]}>
          {picked && <Check size={14} color={t.bg} />}
        </Pressable>
        <PackIcon variantKey={i.variantKey} imageUrl={chosen?.imageUrl ?? inStock[0]?.imageUrl} size={32} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <T kind="bodyStrong" numberOfLines={2}>{itemTitle(i)}</T>
          <T kind="small" numberOfLines={1}>
            {itemPack(i)}{lastTime ? ' · last time' : ''}
            {drop > 0 ? <Text style={{ color: t.good }}> · {rupee(drop)} cheaper</Text> : null}
          </T>
        </View>
        {chosen ? <Stepper qty={i.qty} min={1} onChange={onQty} /> : <Badge label="Not found" tone="warn" />}
        <Pressable hitSlop={8} onPress={onMenu} accessibilityLabel="Item options"><MoreHorizontal size={18} color={t.faint} /></Pressable>
      </View>
      {menu}
      {inStock.length > 0 ? (
        <View style={[styles.slots, { borderTopColor: t.line }]}>
          {rows.map((o, rank) => {
            const isChosen = chosen?.platform === o.platform
            const yours = isChosen && !!i.pinned && rank > 0
            const total = o.price * i.qty
            return (
              <Pressable key={o.platform} onPress={() => onPin(rank === 0 || (yours && i.pinned === o.platform) ? undefined : o.platform)}
                accessibilityRole="radio" accessibilityState={{ selected: isChosen }}
                accessibilityLabel={`${PLATFORM[o.platform].name} ${rupee(total)}${rank === 0 ? ', cheapest' : ''}`}
                style={[styles.slot, isChosen && { backgroundColor: rank === 0 ? t.goodBg : t.chip }]}>
                <Text style={[styles.rank, { color: t.muted, fontFamily: t.fonts.bodyBold }]}>{rank + 1}</Text>
                <PlatformMark platform={o.platform} size={22} />
                <Text style={{ flex: 1, color: t.ink, fontFamily: t.fonts.bodySemi, fontSize: 13.5 }} numberOfLines={1}>
                  {PLATFORM[o.platform].short}
                  <Text style={{ color: t.muted, fontFamily: t.fonts.body, fontSize: 12 }}>
                    {[i.qty > 1 ? `${rupee(o.price)} each` : '', o.etaMinutes ? `${o.etaMinutes} min` : ''].filter(Boolean).map((x) => `  ${x}`).join(' ·')}
                  </Text>
                </Text>
                {rank === 0 && <Badge label="Cheapest" tone="good" />}
                {yours && <Badge label="Your pick" tone="muted" />}
                {rank > 0 && <Text style={{ color: t.muted, fontFamily: t.fonts.bodySemi, fontSize: 12, minWidth: 38, textAlign: 'right' }}>{total > cheapestTotal ? `+${rupee(total - cheapestTotal)}` : 'same'}</Text>}
                <Text style={{ color: rank === 0 ? t.good : t.ink, fontFamily: t.fonts.bodyBold, fontSize: 14, minWidth: 46, textAlign: 'right' }}>{rupee(total)}</Text>
              </Pressable>
            )
          })}
          {inStock.length > rows.length && (
            <Pressable onPress={onMore} style={styles.moreBtn}>
              <ChevronDown size={14} color={t.muted} /><T kind="smallStrong" style={{ color: t.muted }}>{plural(inStock.length - rows.length, 'more app')}</T>
            </Pressable>
          )}
          {outOfStock.length > 0 && <T kind="caption" style={{ paddingLeft: 28, paddingTop: 4 }}>Out of stock on {outOfStock.map((p) => PLATFORM[p].short).join(', ')}</T>}
        </View>
      ) : (
        <Pressable onPress={onSearch} style={[styles.slots, styles.notFound, { borderTopColor: t.line }]}>
          <T kind="small" style={{ flex: 1 }}>No app has this pack right now{outOfStock.length ? ` (out of stock on ${outOfStock.map((p) => PLATFORM[p].short).join(', ')})` : ''}.</T>
          <Search size={14} color={t.ink} /><T kind="smallStrong">Search</T>
        </Pressable>
      )}
    </Card>
  )
}

/** What to order on one app: its items, their total and a link to each product there. */
function AppOrder({ group: g, onOpen }: { group: ListPlan['groups'][number]; onOpen: (url: string, p: Platform) => void }) {
  const t = useTheme()
  return (
    <Card style={[styles.app, { borderLeftColor: PLATFORM[g.platform].mark.bg }]}>
      <View style={styles.appHead}>
        <PlatformMark platform={g.platform} size={32} />
        <View style={{ flex: 1 }}>
          <T kind="h3">From {PLATFORM[g.platform].name}</T>
          <T kind="small">{plural(g.lines.length, 'item')}{g.etaMinutes ? ` · ${g.etaMinutes} min` : ''}</T>
        </View>
        <Text style={{ color: t.ink, fontFamily: t.fonts.display, fontSize: 19 }}>{rupee(g.total)}</Text>
      </View>
      {g.lines.map(({ item, offer, total }) => (
        <Pressable key={item.key} onPress={() => onOpen(offer.deepLink, g.platform)} style={[styles.line, { borderTopColor: t.line }]}
          accessibilityLabel={`Open ${itemTitle(item)} on ${PLATFORM[g.platform].name}`}>
          <T kind="body" style={{ flex: 1 }} numberOfLines={1}>{itemTitle(item)} <Text style={{ color: t.muted }}>{itemPack(item)} × {item.qty}</Text></T>
          <T kind="bodyStrong">{rupee(total)}</T>
          <ArrowUpRight size={15} color={t.muted} />
        </Pressable>
      ))}
    </Card>
  )
}

const styles = StyleSheet.create({
  status: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 22 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  refresh: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  input: { height: 46, borderRadius: 12, paddingHorizontal: 12, fontSize: 15 },
  emojiBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  hero: { borderRadius: 20, padding: 16 },
  heroK: { color: '#ffffffb3', fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase' },
  bar: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', gap: 2, marginTop: 12, marginBottom: 10 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, rowGap: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 15, paddingHorizontal: 10, height: 30 },
  itemHead: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, paddingBottom: 10 },
  check: { width: 22, height: 22, borderRadius: 7, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  slots: { borderTopWidth: StyleSheet.hairlineWidth, marginHorizontal: 12, paddingVertical: 6, paddingBottom: 10 },
  slot: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 6, paddingVertical: 7, borderRadius: 11 },
  rank: { width: 12, fontSize: 11, textAlign: 'right' },
  moreBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 28, paddingTop: 6 },
  notFound: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 12 },
  menu: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 12, paddingBottom: 10 },
  app: { borderLeftWidth: 5 },
  appHead: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, paddingBottom: 10 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 11, borderTopWidth: StyleSheet.hairlineWidth },
  cta: { position: 'absolute', left: 16, right: 16, bottom: 16 },
})
