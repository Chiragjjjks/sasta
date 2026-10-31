import { Pressable, StyleSheet, Text, View } from 'react-native'
import { orderable } from '@/core/food/match'
import type { DishGroup, FoodPlatform, FoodOutlet } from '@/core/food/types'
import { FOOD_PLATFORM } from '@/core/platforms'
import { rupee } from '@/core/utils'
import { Badge, tap } from './kit'
import { PlatformMark } from './PlatformMark'
import { useTheme } from './theme'

/** One app's row: its price for a dish (or a whole order), and what else that app says. */
export interface FoodRow {
  platform: FoodPlatform
  price: number
  outlet: FoodOutlet
  /** The price leaves out a delivery fee the app does not show yet: printed "₹668+". */
  plus?: boolean
  /** Why this app can't take it: "Closed now", "Sold out", "Doesn't list Mutton Biryani". Unranked. */
  reason?: string
}

export const feeLabel = (fee?: number) => fee === undefined ? 'fee not shown' : fee === 0 ? 'Free delivery' : `${rupee(fee)} fee`

/** Rows for one dish: orderable apps by price, ties to the faster app, then the ones that can't take it. */
export function dishRows(g: DishGroup): FoodRow[] {
  return [...g.offers].sort((a, b) => Number(orderable(b)) - Number(orderable(a)) || a.price - b.price || (a.outlet.etaMinutes ?? 99) - (b.outlet.etaMinutes ?? 99))
    .map((d) => ({ platform: d.platform, price: d.price, outlet: d.outlet, reason: !d.outlet.open ? 'Closed now' : !d.available ? 'Sold out' : undefined }))
}

/**
 * Every app for one dish or order, cheapest first, two lines each: app, its rating and the "Cheapest"
 * badge; then ETA and delivery fee. The same reading order as the grocery rows (OfferSlots).
 */
export function FoodSlots({ rows, chosen, pinned, onPick, showOffer, limit, priced = true }: {
  rows: FoodRow[]
  /** Off before anything is picked: each app's rating, ETA, fee and offer, with no rank or price. */
  priced?: boolean
  chosen?: FoodPlatform
  pinned?: FoodPlatform
  onPick?: (p: FoodPlatform | undefined) => void
  showOffer?: boolean
  limit?: number
}) {
  const t = useTheme()
  const ranked = rows.filter((r) => !r.reason)
  const cheapest = ranked[0]?.price ?? 0
  // Same price on the next app: the first row is only faster (rows tie-break on ETA), not cheaper.
  const tie = ranked.length > 1 && ranked[1].price === cheapest
  const faster = tie && (ranked[0].outlet.etaMinutes ?? 99) < (ranked[1].outlet.etaMinutes ?? 99)
  const shown = limit === undefined ? rows : rows.filter((r, n) => n < limit || r.platform === chosen)
  return (
    <View>
      {shown.map((r) => {
        const rank = r.reason || !priced ? -1 : ranked.indexOf(r)
        const isChosen = chosen === r.platform && rank >= 0
        const win = rank === 0 && !tie
        const name = FOOD_PLATFORM[r.platform].short
        const o = r.outlet
        const label = `${FOOD_PLATFORM[r.platform].name} ${r.reason ?? (priced ? `${rupee(r.price)}${rank === 0 && !tie ? ', cheapest' : ''}` : '')}`
        const body = (
          <>
            <Text style={[styles.rank, { color: win ? t.good : t.muted, fontFamily: t.fonts.monoBold }]}>{rank >= 0 ? rank + 1 : priced ? '–' : ''}</Text>
            <PlatformMark platform={r.platform} size={22} style={[{ marginTop: 1 }, r.reason ? { opacity: 0.5 } : null]} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={styles.line}>
                <Text style={{ color: r.reason ? t.muted : t.ink, fontFamily: t.fonts.bodySemi, fontSize: 13.5, flexShrink: 1 }} numberOfLines={1}>
                  {name}
                  {o.rating ? <Text style={{ color: t.muted, fontFamily: t.fonts.body, fontSize: 12 }}>{`  ★ ${o.rating.toFixed(1)}`}</Text> : null}
                </Text>
                {rank === 0 && ranked.length > 1 && (!tie ? <Badge label="Cheapest" tone="good" /> : faster ? <Badge label="Faster" tone="muted" /> : null)}
                {isChosen && !!pinned && rank > 0 && <Badge label="Your pick" tone="muted" />}
              </View>
              <Text style={{ color: t.muted, fontFamily: t.fonts.body, fontSize: 12, marginTop: 1 }} numberOfLines={1}>
                {r.reason ?? [o.etaMinutes ? `${o.etaMinutes} min` : '', feeLabel(o.deliveryFee)].filter(Boolean).join(' · ')}
              </Text>
              {showOffer && !r.reason && !!o.offer && o.offer.toLowerCase() !== feeLabel(o.deliveryFee).toLowerCase() && (
                <Text style={{ color: t.accentText, fontFamily: t.fonts.bodySemi, fontSize: 12, marginTop: 1 }} numberOfLines={1}>{o.offer}</Text>
              )}
            </View>
            {rank > 0 && <Text style={[styles.diff, { color: t.muted, fontFamily: t.fonts.mono }]}>{r.price > cheapest ? `+${rupee(r.price - cheapest)}` : 'same'}</Text>}
            {rank >= 0 && (
              <Text style={[styles.price, { color: win ? t.good : t.ink, fontFamily: t.fonts.bodyBold }]}>{rupee(r.price)}{r.plus ? '+' : ''}</Text>
            )}
          </>
        )
        const style = [styles.slot, isChosen && { backgroundColor: win ? t.goodBg : t.chip }]
        return onPick && rank >= 0 ? (
          <Pressable key={r.platform} onPress={() => { tap(); onPick(rank === 0 || pinned === r.platform ? undefined : r.platform) }}
            accessibilityRole="radio" accessibilityState={{ selected: isChosen }} accessibilityLabel={label} style={style}>{body}</Pressable>
        ) : (
          <View key={r.platform} style={style} accessibilityLabel={label}>{body}</View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  slot: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 6, paddingVertical: 8, borderRadius: 11, minHeight: 48 },
  rank: { width: 12, fontSize: 11, textAlign: 'right', marginTop: 5 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  diff: { fontSize: 11.5, minWidth: 40, textAlign: 'right', marginTop: 3 },
  price: { fontSize: 14, minWidth: 46, textAlign: 'right', fontVariant: ['tabular-nums'], marginTop: 2 },
})
