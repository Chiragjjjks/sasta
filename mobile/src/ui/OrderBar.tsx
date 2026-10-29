import { ChevronRight } from 'lucide-react-native'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { OrderQuote } from '@/core/food/match'
import { FOOD_PLATFORM } from '@/core/platforms'
import { plural, rupee } from '@/core/utils'
import { tap } from './kit'
import { PlatformMark } from './PlatformMark'
import { useTheme } from './theme'

/** The food order in progress, floating above the list: where it is cheapest and what it costs there. */
export function OrderBar({ restaurant, dishes, quote, onPress }: { restaurant: string; dishes: number; quote?: OrderQuote; onPress: () => void }) {
  const t = useTheme()
  return (
    <Pressable onPress={() => { tap(); onPress() }} style={[styles.bar, { backgroundColor: t.hero }]} accessibilityRole="button"
      accessibilityLabel={`Your order from ${restaurant}, ${plural(dishes, 'dish', 'dishes')}${quote ? `, cheapest on ${FOOD_PLATFORM[quote.platform].name} at ${rupee(quote.total)}` : ''}. Compare on every app`}>
      {quote && <PlatformMark platform={quote.platform} size={26} />}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: t.heroText, fontFamily: t.fonts.bodyBold, fontSize: 14 }} numberOfLines={1}>{restaurant}</Text>
        <Text style={{ color: t.heroMuted, fontFamily: t.fonts.body, fontSize: 12 }} numberOfLines={1}>
          {plural(dishes, 'dish', 'dishes')}{quote ? ` · cheapest on ${FOOD_PLATFORM[quote.platform].short}` : ''}
        </Text>
      </View>
      {quote && <Text style={{ color: t.accent, fontFamily: t.fonts.display, fontSize: 19, fontVariant: ['tabular-nums'] }}>{rupee(quote.total)}{quote.deliveryFee === undefined ? '+' : ''}</Text>}
      <ChevronRight size={18} color={t.heroMuted} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', left: 12, right: 12, bottom: 10, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 18, paddingHorizontal: 14, height: 60, elevation: 6, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
})
