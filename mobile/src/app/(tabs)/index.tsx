import { router } from 'expo-router'
import { CircleAlert, Clock, MapPin, Search as SearchIcon, X } from 'lucide-react-native'
import { useMemo, useRef, useState, type ComponentRef } from 'react'
import { ActivityIndicator, FlatList, Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { IS_SAMPLE_DATA } from '@/core/adapters'
import { searchLabel } from '@/core/capabilities'
import { relevance, variantFromQuery } from '@/core/normalize'
import { PLATFORM, PLATFORMS } from '@/core/platforms'
import type { AdapterStatus, ProductGroup } from '@/core/types'
import { formatSize, plural, rupee } from '@/core/utils'
import { useStore } from '@/state/store'
import { Button, Card, Chip, Eyebrow, Headline, T, tap } from '@/ui/kit'
import { flavorColor, PackIcon } from '@/ui/PackIcon'
import { ProductCard } from '@/ui/ProductCard'
import { useTheme } from '@/ui/theme'
import { PlatformMark } from '@/ui/PlatformMark'

const HOW = [
  ['Search once', 'One product, like “lays” or “amul butter”.'],
  ['Compare every app', 'Price, delivery time and stock, cheapest first.'],
  ['Order in the app', 'The cart splits by app. You pay in each one.'],
] as const

export default function SearchScreen() {
  const t = useTheme()
  const s = useStore()
  const input = useRef<ComponentRef<typeof TextInput>>(null)
  const [filters, setFilters] = useState<{ query: string; variant: string | null; size: number | null }>({ query: '', variant: null, size: null })
  const variant = filters.query === s.submitted ? filters.variant : variantFromQuery(s.submitted) ?? null
  const size = filters.query === s.submitted ? filters.size : null
  const setVariant = (value: string | null) => setFilters({ query: s.submitted, variant: value, size: null })
  const setSize = (value: number | null) => setFilters({ query: s.submitted, variant, size: value })

  const statuses = PLATFORMS.map((p) => s.statuses[p.id]).filter(Boolean) as AdapterStatus[]
  const searching = !!s.submitted && (statuses.length < PLATFORMS.length || statuses.some((x) => x.state === 'searching'))
  const active = PLATFORMS.filter((p) => s.statuses[p.id]?.state !== 'unavailable')
  const problems = statuses.filter((x) => ['failed','timeout','needs_login','needs_location','blocked'].includes(x.state) || (x.state === 'unavailable' && x.error))
  const appsWithResults = PLATFORMS.filter((p) => (s.offers[p.id]?.length ?? 0) > 0).length

  const variantOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const g of s.groups) if (!g.variantKey.startsWith('raw:')) seen.set(g.variantKey, g.variant.replace(/^American Style |^Spanish /, ''))
    return [...seen].map(([key, label]) => ({ key, label }))
  }, [s.groups])
  const byVariant = useMemo(() => s.groups.filter((g) => !variant || g.variantKey === variant || g.variantKey.startsWith(`${variant}:`)), [s.groups, variant])
  const sizes = useMemo(() => [...new Set(byVariant.map((g) => g.sizeGrams).filter((x): x is number => !!x))].sort((a, b) => a - b), [byVariant])
  const activeSize = size !== null && sizes.includes(size) ? size : null
  const visible = useMemo(() => {
    const list = byVariant.filter((g) => activeSize === null || g.sizeGrams === activeSize)
    return [...list].sort((a, b) => {
      if (a.best.inStock !== b.best.inStock) return a.best.inStock ? -1 : 1
      return relevance(b.best, s.submitted) - relevance(a.best, s.submitted) || a.best.price - b.best.price || (a.best.etaMinutes ?? 99) - (b.best.etaMinutes ?? 99)
    })
  }, [byVariant, activeSize, s.submitted])
  const bestValue = useMemo(() => byVariant.filter((g) => g.best.inStock && g.pricePer100g).sort((a, b) => a.pricePer100g! - b.pricePer100g!)[0], [byVariant])
  const cartQty = useMemo(() => new Map(s.cart.map((i) => [i.key, i.qty])), [s.cart])

  const submit = (q: string) => { Keyboard.dismiss(); s.search(q) }
  const open = (g: ProductGroup) => router.push({ pathname: '/product/[key]', params: { key: g.key } })
  const save = (g: ProductGroup) => router.push({ pathname: '/save/[key]', params: { key: g.key } })
  const setQty = (g: ProductGroup, q: number) => s.setCartQty(g.key, q)

  const header = (
    <View style={styles.headerWrap}>
      <View style={styles.topRow}>
        <Text style={[styles.logo, { color: t.ink, fontFamily: t.fonts.display }]}>sasta<Text style={{ color: t.accent }}>.</Text></Text>
        <Pressable onPress={() => router.push('/location')} style={[styles.locPill, { backgroundColor: t.surface }]} accessibilityLabel={`Delivery location ${s.location.label} ${s.location.pincode}`}>
          <MapPin size={14} color={t.muted} />
          <Text style={{ color: t.muted, fontFamily: t.fonts.body, fontSize: 13, flexShrink: 1 }} numberOfLines={1}>
            {s.location.label} · {s.location.pincode}
          </Text>
        </Pressable>
      </View>
      <View style={[styles.searchBar, { backgroundColor: t.surface }]}>
        <SearchIcon size={18} color={t.muted} />
        <TextInput
          ref={input}
          value={s.query}
          onChangeText={s.setQuery}
          onSubmitEditing={() => submit(s.query)}
          placeholder="Search any product"
          placeholderTextColor={t.faint}
          returnKeyType="search"
          autoCorrect={false}
          style={[styles.input, { color: t.ink, fontFamily: t.fonts.body }]}
          accessibilityLabel="Search any product"
        />
        {!!s.query && (
          <Pressable hitSlop={10} onPress={() => { s.clearSearch(); input.current?.focus() }} accessibilityLabel="Clear search">
            <X size={18} color={t.faint} />
          </Pressable>
        )}
        <Pressable onPress={() => submit(s.query)} style={[styles.compare, { backgroundColor: t.ink }]} accessibilityLabel="Compare prices">
          <Text style={{ color: t.bg, fontFamily: t.fonts.bodyBold, fontSize: 14 }}>Compare</Text>
        </Pressable>
      </View>
      {s.recents.length > 0 && !s.submitted && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recents} keyboardShouldPersistTaps="handled">
          {s.recents.map((r) => (
            <Pressable key={r} onPress={() => { tap(); submit(r) }} style={[styles.recent, { borderColor: t.line }]}>
              <Text style={{ color: t.muted, fontFamily: t.fonts.body, fontSize: 13 }} numberOfLines={1}>{r}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  )

  if (!s.submitted) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={['top']}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 24 }}>
          {header}
          <View style={{ paddingHorizontal: 16, paddingTop: 22 }}>
            <Eyebrow live label={`${PLATFORMS.length} apps · delivering to ${s.location.pincode}`} />
            <Headline lead="Where is it" rest="cheapest?" style={{ marginTop: 12 }} />
            <T kind="small" style={{ marginTop: 10, fontSize: 14.5, lineHeight: 21 }}>
              Type any product. Sasta checks every app at once and shows the cheapest first.
            </T>
            <Card style={{ marginTop: 20 }}>
              {HOW.map(([title, detail], n) => (
                <View key={title} style={[styles.how, n > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.line }]}>
                  <Text style={{ color: n === 0 ? t.accentText : t.muted, fontFamily: t.fonts.monoBold, fontSize: 12, width: 22 }}>{String(n + 1).padStart(2, '0')}</Text>
                  <View style={{ flex: 1 }}>
                    <T kind="bodyStrong">{title}</T>
                    <T kind="small" style={{ marginTop: 1 }}>{detail}</T>
                  </View>
                </View>
              ))}
            </Card>
            <Eyebrow label="Apps Sasta checks" style={{ marginTop: 26 }} />
            <View style={styles.appGrid}>
              {PLATFORMS.map((p) => {
                return (
                  <Pressable key={p.id} onPress={() => router.navigate('/account')} style={[styles.appTile, { backgroundColor: t.surface }]} accessibilityLabel={`${p.name}: ${searchLabel(p.id,s.accounts[p.id],s.statuses[p.id])}`}>
                    <PlatformMark platform={p.id} size={20} />
                    <T kind="smallStrong" style={{ flex: 1 }} numberOfLines={1}>{p.short}</T>
                    <T kind="caption" numberOfLines={1}>{IS_SAMPLE_DATA ? 'Sample' : searchLabel(p.id,s.accounts[p.id],s.statuses[p.id])}</T>
                  </Pressable>
                )
              })}
            </View>
            <T kind="caption" style={{ textAlign: 'center', marginTop: 18 }}>
              {IS_SAMPLE_DATA ? 'Browser preview · sample prices' : 'Quick-delivery prices · choose the same area in each app'}
            </T>
          </View>
        </ScrollView>
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
              ? `Searching ${active.length} ${active.length === 1 ? 'app' : 'apps'}…`
              : `${plural(s.groups.length, 'product')} from ${plural(appsWithResults, 'app')}${s.elapsed !== null ? ` · ${(s.elapsed / 1000).toFixed(1)} s` : ''}`}
          </T>
          <View style={{ flexDirection: 'row', gap: 4 }} accessibilityLabel={`${appsWithResults} of ${PLATFORMS.length} apps have results`}>
            {PLATFORMS.map((p) => (
              <PlatformMark key={p.id} platform={p.id} size={18} style={{ opacity: s.statuses[p.id]?.state === 'done' && (s.offers[p.id]?.length ?? 0) > 0 ? 1 : 0.25 }} />
            ))}
          </View>
        </View>

        {problems.length > 0 && !searching && (
          <Card style={{ padding: 14, gap: 6 }}>
            {problems.map((p) => (
              <View key={p.platform} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                <CircleAlert size={16} color={t.accentText} style={{ marginTop: 1 }} />
                <T kind="small" style={{ flex: 1, color: t.ink }}>
                  <Text style={{ fontFamily: t.fonts.bodyBold }}>{PLATFORM[p.platform].name}: </Text>
                  {p.state === 'timeout' ? 'took too long. Check your connection and search again.'
                    : p.state === 'needs_login' ? 'needs you to sign in (Account tab).'
                    : ['needs_location','blocked','unavailable'].includes(p.state) ? p.error
                    : p.error?.includes('location') ? 'needs your exact location.' : `couldn't search${p.error ? ` (${p.error})` : ''}.`}
                </T>
              </View>
            ))}
            {problems.filter(p => ['needs_location','blocked','needs_login'].includes(p.state)).map(p => (
              <Button key={p.platform} small variant="secondary" label={`${p.state === 'needs_login' ? 'Connect' : p.state === 'needs_location' ? 'Set area in' : 'Open'} ${PLATFORM[p.platform].name}`}
                onPress={() => { if (p.state === 'needs_login') router.navigate('/account'); else s.setupProvider(p.platform).catch(e => s.showToast((e as Error).message)) }} />
            ))}
            {problems.some((p) => p.error?.includes('location')) && (
              <Button small label="Set my location" onPress={() => router.push('/location')} style={{ alignSelf: 'flex-start', marginTop: 4 }} />
            )}
          </Card>
        )}

        {bestValue && bestValue.key !== visible[0]?.key && (
          <Pressable onPress={() => open(bestValue)} style={[styles.hero, { backgroundColor: t.hero }]} accessibilityRole="button">
            <PackIcon variantKey={bestValue.variantKey} imageUrl={bestValue.best.imageUrl} size={48} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.heroMuted, fontFamily: t.fonts.mono, fontSize: 11, letterSpacing: 1.3 }}>BEST VALUE RIGHT NOW</Text>
              <Text style={{ color: t.heroText, fontFamily: t.fonts.displayBold, fontSize: 17, marginTop: 3 }} numberOfLines={2}>
                {bestValue.variant}{bestValue.sizeGrams ? `, ${formatSize(bestValue.sizeGrams)}` : ''}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                <Text style={{ color: t.accent, fontFamily: t.fonts.display, fontSize: 26 }}>{rupee(bestValue.best.price)}</Text>
                <Text style={{ color: t.heroMuted, fontFamily: t.fonts.body, fontSize: 12 }}>
                  on {PLATFORM[bestValue.best.platform].name}{bestValue.pricePer100g ? ` · ${rupee(+bestValue.pricePer100g.toFixed(1))}/100 g` : ''}
                </Text>
              </View>
            </View>
          </Pressable>
        )}

        {variantOptions.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow} style={{ marginHorizontal: -16 }}>
            <Chip label={`All ${variantOptions.length} flavours`} active={variant === null} onPress={() => setVariant(null)} />
            {variantOptions.map((o) => (
              <Chip key={o.key} label={o.label} dot={flavorColor(o.key)} active={variant === o.key} onPress={() => setVariant(variant === o.key ? null : o.key)} />
            ))}
          </ScrollView>
        )}

        {sizes.length > 1 && (variant !== null || variantOptions.length <= 1) && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow} style={{ marginHorizontal: -16 }}>
            <Chip label="All sizes" active={activeSize === null} onPress={() => setSize(null)} />
            {sizes.map((g) => <Chip key={g} label={formatSize(g)} active={activeSize === g} onPress={() => setSize(activeSize === g ? null : g)} />)}
          </ScrollView>
        )}

        {visible.length > 0 && <Eyebrow label="Best matches · cheapest first" style={{ marginTop: 4, marginBottom: 10 }} />}
      </View>
    </View>
  )

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={['top']}>
      <FlatList
        data={visible}
        keyExtractor={(g) => g.key}
        ListHeaderComponent={listHeader}
        renderItem={({ item }) => (
          <View style={{ paddingHorizontal: 16 }}>
            <ProductCard
              group={item}
              total={Math.max(1, statuses.filter(s => s.state === 'done').length)}
              inCart={cartQty.get(item.key) ?? 0}
              saved={s.isSaved(item.key)}
              onOpen={open}
              onAdd={s.addToCart}
              onQty={setQty}
              onSave={save}
            />
          </View>
        )}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListEmptyComponent={
          searching ? (
            <View style={{ padding: 40, alignItems: 'center', gap: 10 }}>
              <ActivityIndicator color={t.muted} />
              <T kind="small">Checking {active.map((p) => p.name).join(', ') || 'apps'}…</T>
            </View>
          ) : (
            <View style={{ padding: 40, alignItems: 'center', gap: 6 }}>
              <Clock size={28} color={t.faint} />
              <T kind="bodyStrong">{problems.length ? 'No results this time' : 'No matches'}</T>
              <T kind="small" style={{ textAlign: 'center' }}>
                {problems.length ? 'See above for what went wrong.' : 'Try a shorter search, like a brand name.'}
              </T>
            </View>
          )
        }
        contentContainerStyle={{ paddingBottom: 24, gap: 0 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        initialNumToRender={8}
        windowSize={7}
        removeClippedSubviews
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  headerWrap: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, gap: 12 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logo: { fontSize: 28, letterSpacing: -1.2 },
  locPill: { marginLeft: 'auto', flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 36, borderRadius: 18, maxWidth: '62%' },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 18, paddingLeft: 14, paddingRight: 6, height: 54, elevation: 2, shadowColor: '#14152a', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  input: { flex: 1, fontSize: 16, paddingVertical: 0 },
  compare: { height: 42, borderRadius: 13, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  recents: { gap: 8, paddingRight: 16 },
  recent: { borderWidth: 1, borderRadius: 17, height: 34, paddingHorizontal: 13, justifyContent: 'center', maxWidth: 220 },
  appGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  how: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 16, paddingVertical: 13 },
  appTile: { width: '48.5%', flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, height: 48, borderRadius: 16 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 22, padding: 16 },
  chipRow: { gap: 8, paddingHorizontal: 16 },
})
