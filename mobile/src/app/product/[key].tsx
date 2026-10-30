import { router, useLocalSearchParams } from 'expo-router'
import { Bookmark, ShoppingBag } from 'lucide-react-native'
import { useState } from 'react'
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { chosenOffer, summarize } from '@/core/cart'
import { PLATFORM } from '@/core/platforms'
import type { Platform } from '@/core/types'
import { formatSize, plural, rupee } from '@/core/utils'
import { useStore } from '@/state/store'
import { Button, Card, Stepper, T, tap } from '@/ui/kit'
import { OfferSlots } from '@/ui/OfferSlots'
import { PackIcon } from '@/ui/PackIcon'
import { useTheme } from '@/ui/theme'

export default function CompareScreen() {
  const t = useTheme()
  const { key, batchId, queryId } = useLocalSearchParams<{ key: string; batchId?: string; queryId?: string }>()
  const s = useStore()
  const [pick, setPick] = useState<Platform | undefined>(undefined)
  const source = batchId && queryId ? { batchId: String(batchId), queryId: String(queryId) } : undefined
  const group = s.groupByKey(String(key), source)
  if (!group) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 }}>
        <T kind="bodyStrong" style={{ textAlign: 'center' }}>{source ? 'These results are out of date. Search again.' : 'This product is no longer in your results.'}</T>
        <Button label={source ? 'Back' : 'Back to search'} onPress={() => router.back()} />
      </View>
    )
  }
  const inStock = group.offers.filter((o) => o.inStock)
  const outOfStock = group.offers.filter((o) => !o.inStock).map((o) => o.platform)
  const cartItem = s.cart.find((i) => i.key === group.key)
  // In the cart, picking an app changes the cart straight away; before that it picks where Add buys from.
  const chosen = cartItem ? chosenOffer(cartItem) : inStock.find((o) => o.platform === pick) ?? inStock[0]
  const pinned = cartItem ? cartItem.pinned : pick
  const cheapest = inStock[0]
  const priciest = inStock[inStock.length - 1]
  const saved = s.isSaved(group.key)
  const cart = summarize(s.cart)
  const choose = (p: Platform | undefined) => (cartItem ? s.pinItem(group.key, p) : setPick(p))
  const open = (url: string, p: Platform) => Linking.openURL(url).catch(() => s.showToast(`Could not open ${PLATFORM[p].name}`))

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <PackIcon variantKey={group.variantKey} imageUrl={group.best.imageUrl} size={56} />
          <View style={{ flex: 1 }}>
            <T kind="caption" style={{ letterSpacing: 1.2 }}>{group.brand.toUpperCase()}</T>
            <T kind="h2" numberOfLines={3}>{group.variant}</T>
            <T kind="small">
              {(group.packLabel ?? formatSize(group.sizeGrams))}{group.pricePer100g ? ` · best ${rupee(+group.pricePer100g.toFixed(1))}/100 g` : ''}
            </T>
          </View>
        </View>

        {cheapest && (
          <View style={[styles.banner, { backgroundColor: t.goodBg }]}>
            <Text style={{ color: t.good, fontFamily: t.fonts.bodyBold, fontSize: 14 }}>
              {inStock.length === 1
                ? `Only ${PLATFORM[cheapest.platform].name} has this right now.`
                : priciest.price > cheapest.price
                  ? `Cheapest on ${PLATFORM[cheapest.platform].name}. ${rupee(priciest.price - cheapest.price)} less than ${PLATFORM[priciest.platform].name}.`
                  : `Same price on all ${inStock.length} apps.`}
            </Text>
          </View>
        )}

        {inStock.length > 0 ? (
          <Card style={{ padding: 8 }}>
            <OfferSlots offers={inStock} chosen={chosen?.platform} pinned={pinned} onPick={choose}
              onOpen={(o) => open(o.deepLink, o.platform)} outOfStock={outOfStock} />
          </Card>
        ) : (
          <Card style={{ padding: 16 }}>
            <T kind="bodyStrong">Out of stock everywhere right now</T>
            <T kind="small">Checked {outOfStock.map((p) => PLATFORM[p].short).join(', ')}. Search again later.</T>
          </Card>
        )}
        <T kind="caption" style={{ textAlign: 'center' }}>
          Tap an app to buy from it. The arrow opens that app; ordering and payment happen there.
        </T>
      </ScrollView>

      <View style={[styles.bottom, { borderTopColor: t.line, backgroundColor: t.bg }]}>
        {cartItem ? (
          <>
            <Stepper qty={cartItem.qty} onChange={(q) => s.setCartQty(group.key, q)} />
            <Button flex label={`View cart · ${plural(cart.itemCount, 'item')} · ${rupee(cart.total)}`}
              icon={<ShoppingBag size={16} color={t.bg} />} onPress={() => router.navigate('/cart')} />
          </>
        ) : (
          <>
            <Pressable onPress={() => { tap(); router.push({ pathname: '/save/[key]', params: { key: group.key, ...source } }) }}
              style={[styles.save, { backgroundColor: saved ? t.ink : t.chip }]} accessibilityLabel={saved ? 'Saved to a list' : 'Save to list'}>
              <Bookmark size={18} color={saved ? t.bg : t.ink} fill={saved ? t.bg : 'transparent'} />
            </Pressable>
            {chosen && (
              <Button flex label={`Add · ${rupee(chosen.price)} · ${PLATFORM[chosen.platform].short}`}
                icon={<ShoppingBag size={16} color={t.bg} />} onPress={() => s.addToCart(group, chosen.platform, source)} />
            )}
          </>
        )}
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  banner: { borderRadius: 16, padding: 14 },
  bottom: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10, borderTopWidth: StyleSheet.hairlineWidth },
  save: { width: 50, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
})
