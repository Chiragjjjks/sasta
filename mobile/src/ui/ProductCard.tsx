import { Bookmark, Plus } from 'lucide-react-native'
import { memo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { inStockCount } from '@/core/normalize'
import { PLATFORM } from '@/core/platforms'
import type { ProductGroup } from '@/core/types'
import { formatSize, rupee } from '@/core/utils'
import { Stepper, T, tap } from './kit'
import { OfferSlots } from './OfferSlots'
import { PackIcon } from './PackIcon'
import { useTheme } from './theme'

/** Rows shown on a result card; the rest are one tap away on the compare screen. */
const ROWS = 3

/** One product: its top apps ranked by price, then Save and Add (or a quantity once it is in the cart). */
function ProductCardImpl({ group, total, inCart, saved, onOpen, onAdd, onQty, onSave }: {
  group: ProductGroup; total: number; inCart: number; saved: boolean
  onOpen: (g: ProductGroup) => void; onAdd: (g: ProductGroup) => void; onQty: (g: ProductGroup, qty: number) => void; onSave: (g: ProductGroup) => void
}) {
  const t = useTheme()
  const { best } = group
  const title = group.brand !== 'Other' && !group.variant.toLowerCase().includes(group.brand.toLowerCase()) ? `${group.brand} ${group.variant}` : group.variant
  const inStock = group.offers.filter((o) => o.inStock)
  const pack = (group.packLabel ?? formatSize(group.sizeGrams)) || group.brand
  return (
    <Pressable
      onPress={() => onOpen(group)}
      android_ripple={{ color: t.dark ? '#ffffff12' : '#0000000b' }}
      style={[styles.card, { backgroundColor: t.surface }]}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${pack}, ${best.inStock ? `${rupee(best.price)} on ${PLATFORM[best.platform].name}` : 'out of stock'}. Compare all apps`}
    >
      <View style={styles.head}>
        <PackIcon variantKey={group.variantKey} imageUrl={best.imageUrl} size={38} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.name, { color: t.ink, fontFamily: t.fonts.displayBold }]} numberOfLines={2}>{title}</Text>
          <Text style={[styles.meta, { color: t.muted, fontFamily: t.fonts.body }]} numberOfLines={1}>
            {pack} · on {inStockCount(group)} of {total} {total === 1 ? 'app' : 'apps'}
          </Text>
        </View>
      </View>
      {inStock.length > 0
        ? <OfferSlots offers={inStock} chosen={best.platform} limit={ROWS} countHidden={false} />
        : <T kind="small" style={{ paddingLeft: 6, paddingVertical: 6 }}>Out of stock on every app right now</T>}
      <View style={styles.footer}>
        <Pressable
          hitSlop={4}
          onPress={() => { tap(); onSave(group) }}
          style={[styles.iconBtn, { backgroundColor: saved ? t.ink : t.chip }]}
          accessibilityLabel={saved ? 'Saved to a list' : 'Save to list'}
        >
          <Bookmark size={17} color={saved ? t.bg : t.ink} fill={saved ? t.bg : 'transparent'} />
        </Pressable>
        <T kind="smallStrong" style={{ flex: 1, color: t.muted }} numberOfLines={1}>
          {inStock.length > ROWS ? `+${inStock.length - ROWS} more ${inStock.length - ROWS === 1 ? 'app' : 'apps'}` : ''}
        </T>
        {best.inStock && (inCart ? (
          <View style={styles.inCart}>
            <T kind="smallStrong" style={{ color: t.good }}>In cart</T>
            <Stepper qty={inCart} onChange={(q) => onQty(group, q)} />
          </View>
        ) : (
          <Pressable
            hitSlop={4}
            onPress={() => { tap(); onAdd(group) }}
            style={[styles.addBtn, { backgroundColor: t.ink }]}
            accessibilityLabel={`Add to cart from ${PLATFORM[best.platform].name}`}
          >
            <Plus size={15} color={t.bg} />
            <Text style={{ color: t.bg, fontFamily: t.fonts.bodyBold, fontSize: 13.5 }}>Add · {PLATFORM[best.platform].short}</Text>
          </Pressable>
        ))}
      </View>
    </Pressable>
  )
}

export const ProductCard = memo(ProductCardImpl, (a, b) =>
  a.group === b.group && a.inCart === b.inCart && a.saved === b.saved && a.total === b.total)

const styles = StyleSheet.create({
  card: { borderRadius: 20, padding: 12, paddingBottom: 12, overflow: 'hidden', gap: 6 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 2, paddingBottom: 4 },
  name: { fontSize: 15.5, lineHeight: 20 },
  meta: { fontSize: 12, marginTop: 2 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 40, borderRadius: 20, paddingHorizontal: 16 },
  inCart: { flexDirection: 'row', alignItems: 'center', gap: 8 },
})
