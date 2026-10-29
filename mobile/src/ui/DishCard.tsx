import { ChevronRight, Plus } from 'lucide-react-native'
import { memo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { orderable } from '@/core/food/match'
import type { DishGroup } from '@/core/food/types'
import { FOOD_PLATFORM } from '@/core/platforms'
import { rupee } from '@/core/utils'
import { FoodSlots, dishRows } from './FoodSlots'
import { Badge, Stepper, T, tap } from './kit'
import { useTheme } from './theme'
import { VegMark } from './VegMark'

const ROWS = 3

/** One dish from one restaurant: every app's price for it, cheapest first, then the menu link and Add. */
function DishCardImpl({ group, qty, multiApp, onOpen, onAdd, onQty }: {
  group: DishGroup; qty: number
  /** More than one app answered, so "Only on Swiggy" means something. */
  multiApp: boolean
  onOpen: (g: DishGroup) => void; onAdd: (g: DishGroup) => void; onQty: (g: DishGroup, qty: number) => void
}) {
  const t = useTheme()
  const rows = dishRows(group)
  const best = group.best
  const canOrder = orderable(best)
  const hidden = rows.length - ROWS
  return (
    <Pressable
      onPress={() => onOpen(group)}
      android_ripple={{ color: t.dark ? '#ffffff12' : '#0000000b' }}
      style={[styles.card, { backgroundColor: t.surface }]}
      accessibilityRole="button"
      accessibilityLabel={`${group.dish} from ${group.restaurant}, ${canOrder ? `${rupee(best.price)} on ${FOOD_PLATFORM[best.platform].name}` : 'not available now'}. Compare the menu`}
    >
      <View style={styles.head}>
        <View style={{ marginTop: 3 }}><VegMark veg={group.veg} /></View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.name, { color: t.ink, fontFamily: t.fonts.displayBold }]} numberOfLines={2}>{group.dish}</Text>
          <Text style={{ color: t.muted, fontFamily: t.fonts.body, fontSize: 12.5, marginTop: 2 }} numberOfLines={1}>
            {group.portion ? `${group.portion} · ` : ''}<Text style={{ color: t.ink, fontFamily: t.fonts.bodySemi }}>{group.restaurant}</Text>
            {best.bestseller ? <Text style={{ color: t.accentText, fontFamily: t.fonts.bodySemi }}>{' · Bestseller'}</Text> : null}
          </Text>
        </View>
        {group.saving > 0 ? <Badge label={`Save ${rupee(group.saving)}`} tone="good" />
          : group.offers.filter(orderable).length > 1 ? <Badge label="Same price" tone="muted" />
          : multiApp && group.offers.length === 1 ? <Badge label={`Only on ${FOOD_PLATFORM[best.platform].short}`} tone="muted" /> : null}
      </View>
      <FoodSlots rows={rows} chosen={canOrder ? best.platform : undefined} limit={ROWS} showOffer />
      <View style={styles.footer}>
        <Pressable hitSlop={6} onPress={() => { tap(); onOpen(group) }} style={styles.menu} accessibilityRole="button" accessibilityLabel={`${group.restaurant} menu on every app`}>
          <T kind="smallStrong" style={{ color: t.muted }}>{hidden > 0 ? `+${hidden} more · ` : ''}Whole menu</T>
          <ChevronRight size={15} color={t.muted} />
        </Pressable>
        {canOrder && (qty > 0 ? (
          <View style={styles.inOrder}>
            <T kind="smallStrong" style={{ color: t.good }}>In order</T>
            <Stepper qty={qty} onChange={(q) => onQty(group, q)} />
          </View>
        ) : (
          <Pressable hitSlop={4} onPress={() => { tap(); onAdd(group) }} style={[styles.add, { backgroundColor: t.ink }]} accessibilityLabel={`Add to order, cheapest on ${FOOD_PLATFORM[best.platform].name}`}>
            <Plus size={15} color={t.bg} />
            <Text style={{ color: t.bg, fontFamily: t.fonts.bodyBold, fontSize: 13.5 }}>Add · {FOOD_PLATFORM[best.platform].short}</Text>
          </Pressable>
        ))}
      </View>
    </Pressable>
  )
}

export const DishCard = memo(DishCardImpl, (a, b) => a.group === b.group && a.qty === b.qty && a.multiApp === b.multiApp)

const styles = StyleSheet.create({
  card: { borderRadius: 20, padding: 12, overflow: 'hidden', gap: 4 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingHorizontal: 4, paddingBottom: 4 },
  name: { fontSize: 15.5, lineHeight: 20 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  menu: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 2, paddingLeft: 6, minHeight: 40 },
  add: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 40, borderRadius: 20, paddingHorizontal: 16 },
  inOrder: { flexDirection: 'row', alignItems: 'center', gap: 8 },
})
