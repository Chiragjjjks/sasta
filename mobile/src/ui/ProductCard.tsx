import { Bookmark, Check, Plus } from 'lucide-react-native'
import { memo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { inStockCount } from '@/core/normalize'
import { PLATFORM } from '@/core/platforms'
import type { ProductGroup } from '@/core/types'
import { formatSize, rupee } from '@/core/utils'
import { tap } from './kit'
import { PackIcon } from './PackIcon'
import { useTheme } from './theme'

function ProductCardImpl({ group, total, inCart, saved, onOpen, onAdd, onSave }: {
  group: ProductGroup; total: number; inCart: number; saved: boolean
  onOpen: (g: ProductGroup) => void; onAdd: (g: ProductGroup) => void; onSave: (g: ProductGroup) => void
}) {
  const t = useTheme()
  const { best } = group
  const title = group.brand !== 'Other' && !group.variant.toLowerCase().includes(group.brand.toLowerCase()) ? `${group.brand} ${group.variant}` : group.variant
  const others = group.offers.filter((o) => o.inStock).slice(1, 3)
  const more = Math.max(0, group.offers.filter((o) => o.inStock).length - 1 - others.length)
  return (
    <Pressable
      onPress={() => onOpen(group)}
      android_ripple={{ color: t.dark ? '#ffffff12' : '#0000000b' }}
      style={[styles.card, { backgroundColor: t.surface }]}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${(group.packLabel ?? formatSize(group.sizeGrams))}, ${rupee(best.price)} on ${PLATFORM[best.platform].name}`}
    >
      <View style={styles.row}>
        <PackIcon variantKey={group.variantKey} imageUrl={best.imageUrl} size={42} />
        <View style={styles.middle}>
          <Text style={[styles.name, { color: t.ink, fontFamily: t.fonts.displayBold }]} numberOfLines={2}>{title}</Text>
          <Text style={[styles.meta, { color: t.muted, fontFamily: t.fonts.body }]} numberOfLines={1}>
            {(group.packLabel ?? formatSize(group.sizeGrams)) || group.brand} · on {inStockCount(group)} of {total} {total === 1 ? 'app' : 'apps'}
          </Text>
        </View>
        <View style={styles.priceCol}>
          <Text style={[styles.price, { color: t.ink, fontFamily: t.fonts.display }]}>{best.inStock ? rupee(best.price) : '—'}</Text>
          {!!best.mrp && best.mrp > best.price && (
            <Text style={[styles.mrp, { color: t.muted, fontFamily: t.fonts.body }]}>{rupee(best.mrp)}</Text>
          )}
          <Text style={[styles.where, { color: t.good, fontFamily: t.fonts.bodyBold }]} numberOfLines={1}>{PLATFORM[best.platform].short}</Text>
        </View>
      </View>
      <View style={styles.footer}>
        <View style={styles.pills}>
          {others.map((o) => (
            <View key={o.platform} style={[styles.pill, { backgroundColor: t.chip }]}>
              <Text style={[styles.pillTxt, { color: t.muted, fontFamily: t.fonts.body }]} numberOfLines={1}>{PLATFORM[o.platform].short} {rupee(o.price)}</Text>
            </View>
          ))}
          {more > 0 && <View style={[styles.pill, { backgroundColor: t.chip }]}><Text style={[styles.pillTxt, { color: t.muted, fontFamily: t.fonts.body }]}>+{more}</Text></View>}
        </View>
        <Pressable
          hitSlop={8}
          onPress={() => { tap(); onSave(group) }}
          style={[styles.iconBtn, { backgroundColor: saved ? t.ink : t.chip }]}
          accessibilityLabel={saved ? 'Saved to a list' : 'Save to list'}
        >
          <Bookmark size={16} color={saved ? t.bg : t.muted} fill={saved ? t.bg : 'transparent'} />
        </Pressable>
        {best.inStock && (
          <Pressable
            hitSlop={8}
            onPress={() => { tap(); onAdd(group) }}
            style={[styles.addBtn, { backgroundColor: inCart ? t.goodBg : t.ink }]}
            accessibilityLabel={inCart ? `Add another, ${inCart} in cart` : 'Add to cart'}
          >
            {inCart ? <Check size={15} color={t.good} /> : <Plus size={15} color={t.bg} />}
            <Text style={{ color: inCart ? t.good : t.bg, fontFamily: t.fonts.bodyBold, fontSize: 13 }}>{inCart ? inCart : 'Add'}</Text>
          </Pressable>
        )}
      </View>
    </Pressable>
  )
}

export const ProductCard = memo(ProductCardImpl, (a, b) =>
  a.group === b.group && a.inCart === b.inCart && a.saved === b.saved && a.total === b.total)

const styles = StyleSheet.create({
  card: { borderRadius: 20, padding: 14, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  middle: { flex: 1, minWidth: 0 },
  name: { fontSize: 15.5, lineHeight: 20 },
  meta: { fontSize: 12, marginTop: 3 },
  priceCol: { alignItems: 'flex-end' },
  price: { fontSize: 21, lineHeight: 24 },
  mrp: { fontSize: 12, textDecorationLine: 'line-through' },
  where: { fontSize: 12, marginTop: 1 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, paddingLeft: 54 },
  pills: { flex: 1, flexDirection: 'row', gap: 5, overflow: 'hidden' },
  pill: { borderRadius: 7, paddingHorizontal: 7, paddingVertical: 3 },
  pillTxt: { fontSize: 11.5 },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 36, borderRadius: 18, paddingHorizontal: 14 },
})
