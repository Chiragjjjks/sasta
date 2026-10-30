import { router } from 'expo-router'
import { Check, ChevronDown, ChevronUp, CircleAlert, Clock, Square, X } from 'lucide-react-native'
import { useCallback, useMemo, useRef, useState, type ComponentRef, type ReactNode } from 'react'
import { Pressable, ScrollView, type LayoutChangeEvent, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { PLATFORM, PLATFORMS } from '@/core/platforms'
import type { BatchSection, SearchBatch, SourceRef } from '@/core/search-batch'
import type { AdapterStatus, Platform, ProductGroup } from '@/core/types'
import { formatSize, plural, rupee } from '@/core/utils'
import { useStore } from '@/state/store'
import { Button, Card, Eyebrow, LiveDot, T, tap } from './kit'
import { PlatformMark } from './PlatformMark'
import { ProductCard } from './ProductCard'
import { useTheme } from './theme'

/** Full cards per section before "More matches", and the most a section ever shows. */
const SHOWN = 2
const CAP = 8

const productTitle = (g: ProductGroup) =>
  g.brand !== 'Other' && !g.variant.toLowerCase().includes(g.brand.toLowerCase()) ? `${g.brand} ${g.variant}` : g.variant
const packOf = (g: ProductGroup) => (g.packLabel ?? formatSize(g.sizeGrams)) || ''
const settled = (s: BatchSection) => Object.values(s.statuses).filter((x) => x.state !== 'searching').length
const bestOf = (s: BatchSection) => s.groups.find((g) => g.best.inStock)

/**
 * Several products at once. Top to bottom: a best-price card with one row per product (tap a row to
 * jump to it), then one section per product with its top matches. Every price is shown next to its app.
 */
export function BatchResults({ batch, header }: { batch: SearchBatch; header: ReactNode }) {
  const t = useTheme()
  const s = useStore()
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null)
  // Heights of everything above and between sections, so a jump can add them up. Reading each section's
  // y instead goes stale when an earlier section grows, and a sticky header reports y = 0 inside the
  // wrapper React Native puts around it.
  const [sizes] = useState<Record<string, number>>(() => ({}))
  const order: string[] = []
  const measure = (key: string) => (e: LayoutChangeEvent) => { sizes[key] = e.nativeEvent.layout.height }
  const [more, setMore] = useState<Record<string, boolean>>({})
  const { sections, stale } = batch
  const running = !stale && sections.some((x) => x.state === 'queued' || x.state === 'searching')
  const answered = sections.filter((x) => x.state === 'done' || x.state === 'empty').length
  const halted = sections.some((x) => x.state === 'stopped')
  const cartQty = useMemo(() => new Map(s.cart.map((i) => [i.key, i.qty])), [s.cart])
  const { addToCart, setCartQty } = s

  // Stable handlers, so a card only re-renders when its own product changes.
  const open = useCallback((g: ProductGroup, src?: SourceRef) => router.push({ pathname: '/product/[key]', params: { key: g.key, ...src } }), [])
  const save = useCallback((g: ProductGroup, src?: SourceRef) => router.push({ pathname: '/save/[key]', params: { key: g.key, ...src } }), [])
  const add = useCallback((g: ProductGroup, src?: SourceRef) => addToCart(g, undefined, src), [addToCart])
  const setQty = useCallback((g: ProductGroup, q: number) => setCartQty(g.key, q), [setCartQty])

  // Sign-in and location problems are the same in every section, so say each one once.
  const problems = useMemo(() => {
    const found = new Map<Platform, AdapterStatus>()
    for (const sec of sections) for (const st of Object.values(sec.statuses)) {
      if (['needs_login', 'needs_location', 'blocked'].includes(st.state) && !found.has(st.platform)) found.set(st.platform, st)
    }
    return [...found.values()]
  }, [sections])

  const jump = (id: string) => {
    tap()
    const y = order.slice(0, order.indexOf(`h-${id}`)).reduce((sum, key) => sum + (sizes[key] ?? 0), 0)
    scroller.current?.scrollTo({ y, animated: true })
  }

  const stateTag = (sec: BatchSection): { label: string; icon: ReactNode; color: string } => {
    switch (sec.state) {
      case 'queued': return { label: 'Up next', icon: <Clock size={13} color={t.muted} />, color: t.muted }
      case 'searching': return { label: `${settled(sec)} of ${PLATFORMS.length} apps`, icon: <LiveDot size={6} />, color: t.muted }
      case 'done': return { label: `${plural(sec.groups.length, 'product')}${sec.elapsedMs !== null ? ` · ${(sec.elapsedMs / 1000).toFixed(1)} s` : ''}`, icon: <Check size={13} color={t.good} />, color: t.good }
      case 'empty': return { label: 'No matches', icon: <Check size={13} color={t.muted} />, color: t.muted }
      case 'failed': return { label: 'No app answered', icon: <CircleAlert size={13} color={t.bad} />, color: t.bad }
      default: return { label: 'Stopped', icon: <Square size={11} color={t.muted} fill={t.muted} />, color: t.muted }
    }
  }

  const nodes: ReactNode[] = []
  const sticky: number[] = []

  order.push("header")
  nodes.push(<View key="header" onLayout={measure("header")}>{header}</View>)

  order.push('status')
  nodes.push(
    <View key="status" onLayout={measure('status')} style={[styles.pad, styles.statusRow]}>
      <Eyebrow style={{ flex: 1 }} live={running} label={stale ? `${plural(sections.length, 'product')} · out of date` : running ? `Comparing ${plural(sections.length, 'product')}` : halted ? `Stopped · ${answered} of ${sections.length} compared` : `${plural(sections.length, 'product')} compared`} />
      {running && <Button small variant="secondary" label="Stop" onPress={s.stopBatch} />}
    </View>,
  )

  if (stale) {
    order.push('stale')
    nodes.push(
      <View key="stale" onLayout={measure('stale')} style={[styles.pad, { paddingBottom: 10 }]}>
        <View style={[styles.banner, { backgroundColor: t.warnBg }]}>
          <CircleAlert size={18} color={t.accentText} style={{ marginTop: 1 }} />
          <View style={{ flex: 1, gap: 2 }}>
            <T kind="bodyStrong">Location changed</T>
            <T kind="small">These prices were for your old area or account, so they are dimmed.</T>
          </View>
          <Button small label="Search again" onPress={() => s.searchMany(sections.map((x) => x.text))} />
        </View>
      </View>,
    )
  }

  if (problems.length > 0 && !stale) {
    order.push('problems')
    nodes.push(
      <View key="problems" onLayout={measure('problems')} style={[styles.pad, { paddingBottom: 10 }]}>
        <Card style={{ padding: 14, gap: 8 }}>
          {problems.map((p) => (
            <View key={p.platform} style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                <CircleAlert size={16} color={t.accentText} style={{ marginTop: 1 }} />
                <T kind="small" style={{ flex: 1, color: t.ink }}>
                  <Text style={{ fontFamily: t.fonts.bodyBold }}>{PLATFORM[p.platform].name}: </Text>
                  {p.state === 'needs_login' ? 'needs you to sign in (Account tab).' : p.error ?? 'needs your attention.'}
                </T>
              </View>
              <Button small variant="secondary" label={`${p.state === 'needs_login' ? 'Connect' : p.state === 'needs_location' ? 'Set area in' : 'Open'} ${PLATFORM[p.platform].name}`}
                style={{ alignSelf: 'flex-start' }}
                onPress={() => { if (p.state === 'needs_login') router.navigate('/account'); else s.setupProvider(p.platform).catch((e) => s.showToast((e as Error).message)) }} />
            </View>
          ))}
        </Card>
      </View>,
    )
  }

  // Best price per product: the whole search readable on one screen.
  order.push('summary')
  nodes.push(
    <View key="summary" onLayout={measure('summary')} style={[styles.pad, { paddingTop: 4 }]}>
      <Eyebrow label="Best price for each" style={{ marginBottom: 8 }} />
      <Card style={stale ? { opacity: 0.55 } : undefined}>
        {sections.map((sec, n) => {
          const best = bestOf(sec)
          const tag = stateTag(sec)
          return (
            <Pressable
              key={sec.id}
              onPress={() => jump(sec.id)}
              android_ripple={{ color: t.dark ? '#ffffff12' : '#0000000b' }}
              style={[styles.sumRow, n > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.line }]}
              accessibilityRole="button"
              accessibilityLabel={best
                ? `${sec.text}: ${productTitle(best)}, ${rupee(best.best.price)} on ${PLATFORM[best.best.platform].name}. Jump to results`
                : `${sec.text}: ${tag.label}. Jump to results`}
            >
              {best ? <PlatformMark platform={best.best.platform} size={26} /> : <View style={styles.sumIcon}>{tag.icon}</View>}
              <View style={{ flex: 1, minWidth: 0 }}>
                <T kind="bodyStrong" numberOfLines={1}>{sec.text}</T>
                <T kind="small" numberOfLines={1}>
                  {best ? `${productTitle(best)}${packOf(best) ? ` · ${packOf(best)}` : ''}` : tag.label}
                </T>
              </View>
              {best && (
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ color: t.ink, fontFamily: t.fonts.display, fontSize: 19 }}>{rupee(best.best.price)}</Text>
                  <T kind="caption">{PLATFORM[best.best.platform].name}{sec.state === 'searching' ? ' · so far' : ''}</T>
                </View>
              )}
            </Pressable>
          )
        })}
      </Card>
    </View>,
  )

  for (const sec of sections) {
    const tag = stateTag(sec)
    const attempted = Object.values(sec.statuses).length > 0
    sticky.push(nodes.length)
    order.push(`h-${sec.id}`, `b-${sec.id}`)
    nodes.push(
      <View key={`h-${sec.id}`} onLayout={measure(`h-${sec.id}`)} style={[styles.secHead, { backgroundColor: t.bg }]}>
        <Text style={{ color: t.ink, fontFamily: t.fonts.displayBold, fontSize: 18, flexShrink: 1 }} numberOfLines={1}>{sec.text}</Text>
        <View style={styles.tag}>
          {tag.icon}
          <Text style={{ color: tag.color, fontFamily: t.fonts.mono, fontSize: 11 }} numberOfLines={1}>{tag.label}</Text>
        </View>
        <Pressable hitSlop={8} onPress={() => { tap(); s.removeQuery(sec.id) }} style={[styles.remove, { backgroundColor: t.chip }]} accessibilityLabel={`Remove ${sec.text}`}>
          <X size={14} color={t.ink} />
        </Pressable>
      </View>,
    )

    const source: SourceRef = { batchId: batch.id, queryId: sec.id }
    const open8 = !!more[sec.id]
    const cap = Math.min(sec.groups.length, CAP)
    const shown = sec.groups.slice(0, open8 ? CAP : SHOWN)
    const total = Math.max(1, Object.values(sec.statuses).filter((x) => x.state === 'done').length)
    nodes.push(
      <View key={`b-${sec.id}`} onLayout={measure(`b-${sec.id}`)} style={[styles.pad, { gap: 10, paddingBottom: 18 }]}>
        {shown.length > 0 && (
          <View style={[{ gap: 10 }, stale && { opacity: 0.5 }]} pointerEvents={stale ? 'none' : 'auto'}>
            {shown.map((g) => (
              <ProductCard key={g.key} group={g} total={total} source={source} inCart={cartQty.get(g.key) ?? 0} saved={s.isSaved(g.key)}
                onOpen={open} onAdd={add} onQty={setQty} onSave={save} />
            ))}
          </View>
        )}
        {cap > SHOWN && (
          <Pressable onPress={() => { tap(); setMore((m) => ({ ...m, [sec.id]: !open8 })) }} style={[styles.more, { backgroundColor: t.surface }]} accessibilityRole="button">
            {open8 ? <ChevronUp size={16} color={t.ink} /> : <ChevronDown size={16} color={t.ink} />}
            <T kind="smallStrong">{open8 ? 'Show fewer' : `More matches (${cap - SHOWN})`}</T>
            {open8 && sec.groups.length > CAP && <T kind="caption">top {CAP} of {sec.groups.length}</T>}
          </Pressable>
        )}
        {sec.state === 'queued' && <T kind="small">Waiting for the search above to finish.</T>}
        {sec.state === 'searching' && shown.length === 0 && (
          <View style={styles.note}><LiveDot size={6} /><T kind="small">Checking {PLATFORMS.length} apps…</T></View>
        )}
        {sec.state === 'empty' && <T kind="small">No matches in any app. Try a brand name.</T>}
        {sec.state === 'failed' && (
          <View style={styles.note}>
            <T kind="small" style={{ flex: 1 }}>{attempted ? 'No app could search this one. Check your connection.' : 'This search did not run.'}</T>
            {!stale && <Button small variant="secondary" label="Retry" onPress={() => s.retryQuery(sec.id)} />}
          </View>
        )}
        {sec.state === 'stopped' && (
          <View style={styles.note}>
            <T kind="small" style={{ flex: 1 }}>{shown.length ? 'Stopped before every app answered.' : 'Stopped before this ran.'}</T>
            {!stale && <Button small variant="secondary" label="Resume" onPress={() => s.retryQuery(sec.id)} />}
          </View>
        )}
      </View>,
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={['top']}>
      <ScrollView ref={scroller} stickyHeaderIndices={sticky} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ paddingBottom: 24 }}>
        {nodes}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: 16 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, padding: 14, flexWrap: 'wrap' },
  sumRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, minHeight: 56, paddingVertical: 8 },
  sumIcon: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  secHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10 },
  tag: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
  remove: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  more: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 40, borderRadius: 14 },
  note: { flexDirection: 'row', alignItems: 'center', gap: 8 },
})
