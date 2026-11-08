import { Bookmark } from 'lucide-react-native'
import { memo } from 'react'
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import { discountPercent, unitPrice } from '@/core/normalize'
import { PLATFORM } from '@/core/platforms'
import type { SourceRef } from '@/core/search-batch'
import type { Offer, ProductGroup } from '@/core/types'
import { formatSize, rupee } from '@/core/utils'
import { tap } from './kit'
import { PackIcon } from './PackIcon'
import { PlatformMark } from './PlatformMark'
import { useTheme } from './theme'

const perUnit = (o: Offer, g: ProductGroup) => {
  const u = unitPrice(o.price, g.packLabel, g.sizeGrams)
  return u ? `${rupee(+u.value.toFixed(1))}/${u.per}` : ''
}

/**
 * One product in the results grid. The photo carries the saving against MRP, Save and Add; below it,
 * every app that lists the pack gets its own row, cheapest first: mark, delivery time, MRP, price,
 * app name and price per 100 g. Rows at the lowest price are tinted, so ties read as ties.
 */
function ProductTileImpl({ group, total, inCart, saved, source, style, onOpen, onAdd, onQty, onSave }: {
  group: ProductGroup; total: number; inCart: number; saved: boolean
  /** The search section this tile came from (several-product search). It rides along on every action. */
  source?: SourceRef
  style?: StyleProp<ViewStyle>
  onOpen: (g: ProductGroup, source?: SourceRef) => void; onAdd: (g: ProductGroup, source?: SourceRef) => void
  onQty: (g: ProductGroup, qty: number) => void; onSave: (g: ProductGroup, source?: SourceRef) => void
}) {
  const t = useTheme()
  const { best } = group
  const branded = group.brand !== 'Other'
  const name = branded && group.variant.toLowerCase().startsWith(group.brand.toLowerCase()) ? group.variant.slice(group.brand.length).trim() || group.variant : group.variant
  const pack = (group.packLabel ?? formatSize(group.sizeGrams)) || ''
  const inStock = group.offers.filter((o) => o.inStock)
  const low = inStock[0]?.price
  const off = best.inStock ? discountPercent(best) : undefined
  const apps = `${inStock.length} of ${total} ${total === 1 ? 'app' : 'apps'}`
  return (
    <Pressable
      onPress={() => onOpen(group, source)}
      android_ripple={{ color: t.dark ? '#ffffff12' : '#0000000b' }}
      style={[styles.tile, { backgroundColor: t.surface }, style]}
      accessibilityRole="button"
      accessibilityLabel={`${branded ? `${group.brand} ` : ''}${name}, ${pack}, ${best.inStock ? `${rupee(best.price)} on ${PLATFORM[best.platform].name}` : 'out of stock'}. Compare all apps`}
    >
      <View style={[styles.well, { backgroundColor: t.bg }]}>
        <PackIcon variantKey={group.variantKey} imageUrl={best.imageUrl} size={58} />
        {off !== undefined && (
          <View style={[styles.off, { backgroundColor: t.good }]}>
            <Text style={{ color: t.surface, fontFamily: t.fonts.monoBold, fontSize: 10.5, letterSpacing: 0.4 }}>{off}% OFF</Text>
          </View>
        )}
        <Pressable hitSlop={6} onPress={() => { tap(); onSave(group, source) }}
          style={[styles.save, { backgroundColor: saved ? t.ink : t.surface }]}
          accessibilityLabel={saved ? 'Saved to a list' : 'Save to list'}>
          <Bookmark size={15} color={saved ? t.bg : t.ink} fill={saved ? t.bg : 'transparent'} />
        </Pressable>
        {best.inStock && (inCart ? (
          <View style={[styles.add, styles.qty, { backgroundColor: t.ink }]} accessibilityLabel={`${inCart} in cart`}>
            <Pressable hitSlop={8} onPress={() => { tap(); onQty(group, inCart - 1) }} accessibilityLabel="Fewer">
              <Text style={[styles.qtyBtn, { color: t.bg, fontFamily: t.fonts.bodyBold }]}>−</Text>
            </Pressable>
            <Text style={{ color: t.bg, fontFamily: t.fonts.bodyBold, fontSize: 13.5, minWidth: 14, textAlign: 'center' }}>{inCart}</Text>
            <Pressable hitSlop={8} onPress={() => { tap(); onQty(group, inCart + 1) }} accessibilityLabel="More">
              <Text style={[styles.qtyBtn, { color: t.bg, fontFamily: t.fonts.bodyBold }]}>+</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable hitSlop={6} onPress={() => { tap(); onAdd(group, source) }} style={[styles.add, { backgroundColor: t.ink }]}
            accessibilityLabel={`Add to cart from ${PLATFORM[best.platform].name}`}>
            <Text style={{ color: t.bg, fontFamily: t.fonts.bodyBold, fontSize: 13 }}>Add</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.text}>
        {branded && <Text style={[styles.brand, { color: t.muted, fontFamily: t.fonts.body }]} numberOfLines={1}>{group.brand}</Text>}
        <Text style={[styles.name, { color: t.ink, fontFamily: t.fonts.displayBold }]} numberOfLines={2}>{name}</Text>
        <Text style={[styles.meta, { color: t.muted, fontFamily: t.fonts.body }]} numberOfLines={1}>{pack ? `${pack} · ${apps}` : apps}</Text>
      </View>

      <View style={styles.rows}>
        {group.offers.map((o) => {
          const cheapest = o.inStock && o.price === low
          const app = PLATFORM[o.platform]
          return (
            <View key={o.platform}
              style={[styles.row, cheapest ? { backgroundColor: t.goodBg, borderColor: t.goodBg } : { borderColor: t.line }, !o.inStock && { opacity: 0.55 }]}
              accessibilityLabel={`${app.name} ${o.inStock ? `${rupee(o.price)}${o.etaMinutes ? `, ${o.etaMinutes} minutes` : ''}${cheapest ? ', cheapest' : ''}` : 'out of stock'}`}>
              <View style={styles.line}>
                <PlatformMark platform={o.platform} size={16} />
                <Text style={[styles.eta, { color: t.muted, fontFamily: t.fonts.mono }]} numberOfLines={1}>{o.inStock && o.etaMinutes ? `${o.etaMinutes} min` : ''}</Text>
                {o.inStock ? (
                  <>
                    {!!o.mrp && o.mrp > o.price && <Text style={[styles.mrp, { color: t.muted, fontFamily: t.fonts.body }]}>{rupee(o.mrp)}</Text>}
                    <Text style={[styles.price, { color: cheapest ? t.good : t.ink, fontFamily: t.fonts.bodyBold }]}>{rupee(o.price)}</Text>
                  </>
                ) : <Text style={[styles.mrp, { color: t.muted, fontFamily: t.fonts.body, textDecorationLine: 'none' }]}>Out of stock</Text>}
              </View>
              <View style={styles.line}>
                <Text style={[styles.app, { color: t.muted, fontFamily: t.fonts.bodySemi }]} numberOfLines={1}>{app.short}</Text>
                {o.inStock && <Text style={[styles.unit, { color: t.muted, fontFamily: t.fonts.mono }]} numberOfLines={1}>{perUnit(o, group)}</Text>}
              </View>
            </View>
          )
        })}
      </View>
    </Pressable>
  )
}

/** Callers pass stable (useCallback) handlers, so comparing them still skips most re-renders. */
export const ProductTile = memo(ProductTileImpl, (a, b) =>
  a.group === b.group && a.inCart === b.inCart && a.saved === b.saved && a.total === b.total && a.style === b.style
  && a.source?.batchId === b.source?.batchId && a.source?.queryId === b.source?.queryId
  && a.onOpen === b.onOpen && a.onAdd === b.onAdd && a.onQty === b.onQty && a.onSave === b.onSave)

const styles = StyleSheet.create({
  tile: { borderRadius: 18, padding: 7, overflow: 'hidden' },
  well: { height: 104, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  off: { position: 'absolute', top: 6, left: 6, borderRadius: 7, paddingHorizontal: 6, paddingVertical: 3 },
  save: { position: 'absolute', top: 6, right: 6, width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  add: { position: 'absolute', bottom: 6, right: 6, height: 30, borderRadius: 15, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  qty: { flexDirection: 'row', gap: 8, paddingHorizontal: 10 },
  qtyBtn: { fontSize: 16, lineHeight: 20, paddingHorizontal: 2 },
  text: { paddingHorizontal: 3, paddingTop: 8, paddingBottom: 7 },
  brand: { fontSize: 11.5 },
  name: { fontSize: 14, lineHeight: 18, marginTop: 1 },
  meta: { fontSize: 11.5, marginTop: 3 },
  rows: { gap: 5 },
  row: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 5, gap: 2 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  eta: { flex: 1, fontSize: 10.5 },
  mrp: { fontSize: 11, textDecorationLine: 'line-through' },
  price: { fontSize: 13.5, fontVariant: ['tabular-nums'] },
  app: { flex: 1, fontSize: 11 },
  unit: { fontSize: 10, flexShrink: 0 },
})
