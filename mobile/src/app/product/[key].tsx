import { router, useLocalSearchParams } from 'expo-router'
import { ArrowUpRight, Bookmark, ShoppingBag } from 'lucide-react-native'
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { PLATFORM } from '@/core/platforms'
import { formatSize, rupee } from '@/core/utils'
import { useStore } from '@/state/store'
import { Badge, Button, Card, Divider, T } from '@/ui/kit'
import { PackIcon } from '@/ui/PackIcon'
import { useTheme } from '@/ui/theme'
import { PlatformMark } from '@/ui/PlatformMark'

export default function CompareScreen() {
  const t = useTheme()
  const { key } = useLocalSearchParams<{ key: string }>()
  const s = useStore()
  const group = s.groupByKey(String(key))
  if (!group) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 }}>
        <T kind="bodyStrong">This product is no longer in your results.</T>
        <Button label="Back to search" onPress={() => router.back()} />
      </View>
    )
  }
  const inStock = group.offers.filter((o) => o.inStock)
  const save = inStock.length > 1 ? inStock[inStock.length - 1].price - inStock[0].price : 0
  const inCart = s.cart.find((i) => i.key === group.key)?.qty ?? 0
  const saved = s.isSaved(group.key)

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

        {save > 0 && (
          <View style={[styles.saveBanner, { backgroundColor: t.goodBg }]}>
            <Text style={{ color: t.good, fontFamily: t.fonts.bodyBold, fontSize: 14 }}>
              You save {rupee(save)} buying on {PLATFORM[group.best.platform].name} instead of the priciest app.
            </Text>
          </View>
        )}

        <Card>
          {group.offers.map((o, i) => (
            <View key={o.productId}>
              {i > 0 && <Divider />}
              <View style={[styles.offer, { opacity: o.inStock ? 1 : 0.45 }]}>
                <PlatformMark platform={o.platform} size={26} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <T kind="bodyStrong">{PLATFORM[o.platform].name}</T>
                    {i === 0 && o.inStock && <Badge label="Cheapest" tone="good" />}
                  </View>
                  <T kind="small" numberOfLines={1}>
                    {o.inStock ? (o.etaMinutes ? `${o.etaMinutes} min` : 'In stock') : 'Out of stock'} · {o.title}
                  </T>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ color: t.ink, fontFamily: t.fonts.display, fontSize: 17 }}>{rupee(o.price)}</Text>
                  {!!o.mrp && o.mrp > o.price && <Text style={{ color: t.faint, fontFamily: t.fonts.body, fontSize: 11.5, textDecorationLine: 'line-through' }}>{rupee(o.mrp)}</Text>}
                </View>
                <Pressable
                  disabled={!o.inStock}
                  onPress={() => Linking.openURL(o.deepLink).catch(() => s.showToast(`Could not open ${PLATFORM[o.platform].name}`))}
                  style={[styles.openBtn, { backgroundColor: o.inStock ? t.ink : t.chip }]}
                  accessibilityLabel={`Open in ${PLATFORM[o.platform].name}`}
                >
                  <Text style={{ color: o.inStock ? t.bg : t.faint, fontFamily: t.fonts.bodyBold, fontSize: 12.5 }}>Open</Text>
                  <ArrowUpRight size={13} color={o.inStock ? t.bg : t.faint} />
                </Pressable>
              </View>
            </View>
          ))}
        </Card>
        <T kind="caption" style={{ textAlign: 'center' }}>Open takes you to that app. Ordering happens there.</T>
      </ScrollView>

      <View style={[styles.bottom, { borderTopColor: t.line, backgroundColor: t.bg }]}>
        <Button
          variant={saved ? 'primary' : 'secondary'}
          label={saved ? 'Saved' : 'Save'}
          icon={<Bookmark size={16} color={saved ? t.bg : t.ink} fill={saved ? t.bg : 'transparent'} />}
          onPress={() => router.push({ pathname: '/save/[key]', params: { key: group.key } })}
        />
        {group.best.inStock && (
          <Button
            flex
            label={inCart ? `Add another · ${inCart} in cart` : `Add · ${rupee(group.best.price)} on ${PLATFORM[group.best.platform].short}`}
            icon={<ShoppingBag size={16} color={t.bg} />}
            onPress={() => { s.addToCart(group); s.showToast('Added to cart') }}
          />
        )}
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  saveBanner: { borderRadius: 16, padding: 14 },
  offer: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 13 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  openBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 34, paddingHorizontal: 11, borderRadius: 11 },
  bottom: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10, borderTopWidth: StyleSheet.hairlineWidth },
})
