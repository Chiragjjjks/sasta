import { router, Stack, useLocalSearchParams } from 'expo-router'
import { Check, MoreHorizontal, Share2, Trash2 } from 'lucide-react-native'
import { useMemo, useState } from 'react'
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { currentPrice, estimateTotal, priceDrop, sameAsLastTime, sortItems, type ListSort } from '@/core/lists'
import { PLATFORM } from '@/core/platforms'
import { formatSize, rupee } from '@/core/utils'
import { useStore } from '@/state/store'
import { Badge, Button, Card, Chip, Stepper, T, tap } from '@/ui/kit'
import { PackIcon } from '@/ui/PackIcon'
import { useTheme } from '@/ui/theme'

const EMOJIS = ['🛒', '🏢', '🎉', '🏠', '🍿', '🥛', '🧴', '👶', '🐶', '🛍️']
const SORTS: { value: ListSort; label: string }[] = [
  { value: 'saved', label: 'Saved order' }, { value: 'often', label: 'Often bought' }, { value: 'cheapest', label: 'Cheapest' }, { value: 'az', label: 'A–Z' },
]

function ago(ts: number) {
  const m = Math.round((Date.now() - ts) / 60000)
  if (m < 60) return m < 1 ? 'just now' : `${m} min ago`
  const h = Math.round(m / 60)
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} days ago`
}

export default function ListDetail() {
  const t = useTheme()
  const { id } = useLocalSearchParams<{ id: string }>()
  const s = useStore()
  const list = s.lists.find((l) => l.id === id)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [sort, setSort] = useState<ListSort>('saved')
  const [editing, setEditing] = useState(false)
  const [menu, setMenu] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState(list?.name ?? '')
  const [emoji, setEmoji] = useState(list?.emoji ?? '🛍️')

  const items = useMemo(() => (list ? sortItems(list.items, sort) : []), [list, sort])
  const last = useMemo(() => new Set(list ? sameAsLastTime(list) : []), [list])

  if (!list) return <View style={{ flex: 1, padding: 24 }}><T kind="bodyStrong">This list was deleted.</T></View>

  const toggle = (k: string) => { tap(); setPicked((p) => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n }) }
  const pickedItems = list.items.filter((i) => picked.has(i.key))
  const others = s.lists.filter((l) => l.id !== list.id)
  const lastSeen = list.items.length ? Math.min(...list.items.map((i) => i.lastSeenAt)) : list.updatedAt

  const add = async () => {
    setBusy(true)
    try {
      const n = await s.addListToCart(list.id, [...picked])
      setPicked(new Set())
      if (n) router.navigate('/cart')
    } finally { setBusy(false) }
  }

  const confirmDelete = () => Alert.alert(`Delete ${list.name}?`, 'The products stay in your cart if you added them.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => { s.deleteList(list.id); router.back() } },
  ])

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={['bottom']}>
      <Stack.Screen options={{
        title: `${list.emoji} ${list.name}`,
        headerRight: () => (
          <Pressable onPress={() => setEditing((e) => !e)} hitSlop={10} accessibilityLabel="List options">
            <MoreHorizontal size={22} color={t.ink} />
          </Pressable>
        ),
      }} />
      <FlatList
        data={items}
        keyExtractor={(i) => i.key}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: picked.size ? 100 : 24 }}
        ListHeaderComponent={
          <View style={{ gap: 12, marginBottom: 2 }}>
            <T kind="small">{list.items.length} products{list.items.length ? ` · prices from ${ago(lastSeen)}` : ''}</T>
            {editing && (
              <Card style={{ padding: 14, gap: 12 }}>
                <TextInput value={name} onChangeText={setName} style={[styles.input, { backgroundColor: t.chip, color: t.ink, fontFamily: t.fonts.bodyBold }]} />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                  {EMOJIS.map((e) => (
                    <Pressable key={e} onPress={() => setEmoji(e)} style={[styles.emojiBtn, { backgroundColor: e === emoji ? t.ink : t.chip }]}>
                      <Text style={{ fontSize: 18 }}>{e}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Button flex small label="Save" onPress={() => { s.renameList(list.id, name, emoji); setEditing(false) }} />
                  <Button small variant="secondary" label="Share" icon={<Share2 size={14} color={t.ink} />} onPress={() => s.shareList(list.id, picked.size ? [...picked] : list.items.map((i) => i.key))} />
                  <Button small variant="secondary" label="Delete" icon={<Trash2 size={14} color={t.ink} />} onPress={confirmDelete} />
                </View>
              </Card>
            )}
            {list.items.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ marginHorizontal: -16 }} contentInset={{ left: 16 }}>
                <View style={{ width: 8 }} />
                <Chip label="Same as last time" onPress={last.size ? () => setPicked(new Set(last)) : undefined} style={{ opacity: last.size ? 1 : 0.4 }} />
                <Chip label="Select all" onPress={() => setPicked(new Set(list.items.map((i) => i.key)))} />
                <Chip label="Clear" onPress={() => setPicked(new Set())} style={{ opacity: picked.size ? 1 : 0.4 }} />
                {SORTS.map((x) => <Chip key={x.value} label={x.label} active={sort === x.value} onPress={() => setSort(x.value)} />)}
                <View style={{ width: 8 }} />
              </ScrollView>
            )}
          </View>
        }
        ListEmptyComponent={<T kind="small" style={{ textAlign: 'center', paddingVertical: 40 }}>This list is empty. Tap the bookmark on any product to save it here.</T>}
        renderItem={({ item: i }) => {
          const price = currentPrice(i)
          const best = i.lastOffers.filter((o) => o.inStock).sort((a, b) => a.price - b.price)[0]
          const drop = priceDrop(i)
          const on = picked.has(i.key)
          return (
            <Card style={{ opacity: price === undefined ? 0.6 : 1 }}>
              <Pressable onPress={() => toggle(i.key)} style={styles.item} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
                <View style={[styles.check, { borderColor: on ? t.ink : t.line, backgroundColor: on ? t.ink : 'transparent' }]}>
                  {on && <Check size={15} color={t.bg} />}
                </View>
                <PackIcon variantKey={i.variantKey} imageUrl={best?.imageUrl} size={32} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <T kind="bodyStrong" numberOfLines={2}>{i.brand !== 'Other' && !i.variant.startsWith(i.brand) ? `${i.brand} ` : ''}{i.variant}</T>
                  <T kind="small" numberOfLines={1}>
                    {formatSize(i.sizeGrams)}{best ? ` · ${rupee(best.price)} on ${PLATFORM[best.platform].short}` : ' · no app has it now'}
                  </T>
                  {(last.has(i.key) || drop > 0 || price === undefined) && (
                    <View style={{ flexDirection: 'row', gap: 5, marginTop: 4 }}>
                      {last.has(i.key) && <Badge label="Last time" tone="muted" />}
                      {drop > 0 && <Badge label={`${rupee(drop)} drop`} tone="good" />}
                      {price === undefined && <Badge label="Not found" tone="warn" />}
                    </View>
                  )}
                </View>
                <Stepper qty={i.qty} min={1} onChange={(q) => s.setListQty(list.id, i.key, q)} />
                <Pressable hitSlop={8} onPress={() => setMenu(menu === i.key ? null : i.key)} accessibilityLabel="Item options">
                  <MoreHorizontal size={18} color={t.faint} />
                </Pressable>
              </Pressable>
              {menu === i.key && (
                <View style={styles.menu}>
                  {others.map((l) => (
                    <View key={l.id} style={{ flexDirection: 'row', gap: 6 }}>
                      <Chip label={`Move to ${l.emoji} ${l.name}`} onPress={() => { s.moveListItem(list.id, l.id, i.key, false); setMenu(null) }} />
                      <Chip label="Copy" onPress={() => { s.moveListItem(list.id, l.id, i.key, true); setMenu(null) }} />
                    </View>
                  ))}
                  <Chip label="Remove from list" onPress={() => { s.removeFromList(list.id, i.key); setMenu(null) }} />
                </View>
              )}
            </Card>
          )
        }}
      />
      {picked.size > 0 && (
        <View style={styles.cta}>
          <Button label={busy ? 'Checking prices…' : `Add ${picked.size} to cart · about ${rupee(estimateTotal(pickedItems))}`} loading={busy} onPress={add} />
        </View>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  input: { height: 46, borderRadius: 12, paddingHorizontal: 12, fontSize: 15 },
  emojiBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  check: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  menu: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 12, paddingBottom: 12 },
  cta: { position: 'absolute', left: 16, right: 16, bottom: 16 },
})
