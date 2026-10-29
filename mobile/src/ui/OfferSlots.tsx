import { ArrowUpRight, ChevronDown } from 'lucide-react-native'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { PLATFORM } from '@/core/platforms'
import type { Offer, Platform } from '@/core/types'
import { plural, rupee } from '@/core/utils'
import { Badge, T, tap } from './kit'
import { PlatformMark } from './PlatformMark'
import { useTheme } from './theme'

/**
 * Every app that has a product, cheapest first: rank, app mark, name, ETA, how much more than the
 * cheapest, and the price. The same rows appear in results, compare, lists and the cart, so a price
 * is always read next to the app it comes from.
 *
 * Read-only unless `onPick` is given. Tapping a row picks that app; tapping the cheapest, or the
 * current pick again, goes back to "cheapest" (undefined).
 */
export function OfferSlots({ offers, qty = 1, chosen, pinned, limit, onPick, onMore, onOpen, outOfStock = [], countHidden = true }: {
  /** In-stock offers, cheapest first. */
  offers: Offer[]
  qty?: number
  /** The app this is bought from, highlighted. */
  chosen?: Platform
  /** The app the user picked over the cheapest. */
  pinned?: Platform
  /** Rows before "more apps". The chosen app is always shown. */
  limit?: number
  onPick?: (p: Platform | undefined) => void
  /** Shows the hidden rows. Without it, "more apps" is a plain label. */
  onMore?: () => void
  /** Adds an open-in-app button to each row. */
  onOpen?: (o: Offer) => void
  outOfStock?: Platform[]
  /** Say how many apps are hidden. Off when the caller shows that count itself. */
  countHidden?: boolean
}) {
  const t = useTheme()
  const cheapest = offers[0] ? offers[0].price * qty : 0
  const rows = limit === undefined ? offers : offers.filter((o, n) => n < limit || o.platform === chosen)
  const hidden = offers.length - rows.length
  return (
    <View>
      {rows.map((o, rank) => {
        const isChosen = chosen === o.platform
        const yours = isChosen && !!pinned && rank > 0
        const total = o.price * qty
        const body = (
          <>
            <Text style={[styles.rank, { color: rank === 0 ? t.good : t.muted, fontFamily: t.fonts.monoBold }]}>{rank + 1}</Text>
            <PlatformMark platform={o.platform} size={22} />
            <Text style={{ flex: 1, color: t.ink, fontFamily: t.fonts.bodySemi, fontSize: 13.5 }} numberOfLines={1}>
              {PLATFORM[o.platform].short}
              <Text style={{ color: t.muted, fontFamily: t.fonts.body, fontSize: 12 }}>
                {[qty > 1 ? `${rupee(o.price)} each` : '', o.etaMinutes ? `${o.etaMinutes} min` : ''].filter(Boolean).map((x) => `  ${x}`).join(' ·')}
              </Text>
            </Text>
            {rank === 0 && <Badge label="Cheapest" tone="good" />}
            {yours && <Badge label="Your pick" tone="muted" />}
            {rank > 0 && <Text style={{ color: t.muted, fontFamily: t.fonts.mono, fontSize: 11.5, minWidth: 40, textAlign: 'right' }}>{total > cheapest ? `+${rupee(total - cheapest)}` : 'same'}</Text>}
            <Text style={{ color: rank === 0 ? t.good : t.ink, fontFamily: t.fonts.bodyBold, fontSize: 14, minWidth: 46, textAlign: 'right', fontVariant: ['tabular-nums'] }}>{rupee(total)}</Text>
          </>
        )
        const rowStyle = [styles.slot, isChosen && { backgroundColor: rank === 0 ? t.goodBg : t.chip }]
        return (
          <View key={o.platform} style={styles.rowWrap}>
            {onPick ? (
              <Pressable onPress={() => { tap(); onPick(rank === 0 || pinned === o.platform ? undefined : o.platform) }}
                accessibilityRole="radio" accessibilityState={{ selected: isChosen }}
                accessibilityLabel={`${PLATFORM[o.platform].name} ${rupee(total)}${rank === 0 ? ', cheapest' : ''}`}
                style={[rowStyle, { flex: 1 }]}>{body}</Pressable>
            ) : (
              <View style={[rowStyle, { flex: 1 }]} accessibilityLabel={`${PLATFORM[o.platform].name} ${rupee(total)}${rank === 0 ? ', cheapest' : ''}`}>{body}</View>
            )}
            {onOpen && (
              <Pressable onPress={() => onOpen(o)} style={[styles.open, { backgroundColor: t.chip }]} accessibilityLabel={`Open in ${PLATFORM[o.platform].name}`}>
                <ArrowUpRight size={16} color={t.ink} />
              </Pressable>
            )}
          </View>
        )
      })}
      {hidden > 0 && countHidden && (onMore ? (
        <Pressable onPress={onMore} hitSlop={8} style={styles.more} accessibilityRole="button">
          <ChevronDown size={14} color={t.muted} /><T kind="smallStrong" style={{ color: t.muted }}>{plural(hidden, 'more app')}</T>
        </Pressable>
      ) : (
        <T kind="smallStrong" style={[styles.more, { color: t.muted }]}>+{plural(hidden, 'more app')}</T>
      ))}
      {outOfStock.length > 0 && <T kind="caption" style={{ paddingLeft: 28, paddingTop: 4 }}>Out of stock on {outOfStock.map((p) => PLATFORM[p].short).join(', ')}</T>}
    </View>
  )
}

const styles = StyleSheet.create({
  rowWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  slot: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 6, paddingVertical: 7, borderRadius: 11, minHeight: 40 },
  rank: { width: 12, fontSize: 11, textAlign: 'right' },
  more: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 28, paddingTop: 6 },
  open: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
})
