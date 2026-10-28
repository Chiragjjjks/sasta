import { router } from 'expo-router'
import { Download, Plus, Upload } from 'lucide-react-native'
import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { listPlan, priceDrop, STARTER_LISTS } from '@/core/lists'
import { PLATFORM } from '@/core/platforms'
import { plural, rupee } from '@/core/utils'
import { pickJsonText } from '@/native/pickFile'
import { useStore } from '@/state/store'
import { Button, Card, Chip, T } from '@/ui/kit'
import { PlatformMark } from '@/ui/PlatformMark'
import { useTheme } from '@/ui/theme'

export default function ListsScreen() {
  const t = useTheme()
  const s = useStore()
  const [name, setName] = useState('')
  const starters = STARTER_LISTS.filter((x) => !s.lists.some((l) => l.name.toLowerCase() === x.name.toLowerCase()))
  const create = (n: string, e: string) => { if (!n.trim()) return; const id = s.createList(n.trim(), e); setName(''); router.push({ pathname: '/list/[id]', params: { id } }) }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
        <T kind="title" style={{ fontSize: 26 }}>Your lists</T>
        <T kind="small" style={{ marginTop: -6 }}>Open a list to see every item on every app, and the cheapest way to buy it all.</T>

        {s.lists.map((l) => {
          const drops = l.items.filter((i) => priceDrop(i) > 0).length
          const plan = listPlan(l.items)
          return (
            <Card key={l.id} onPress={() => router.push({ pathname: '/list/[id]', params: { id: l.id } })} style={styles.listCard}>
              <View style={styles.listRow}>
                <View style={[styles.emoji, { backgroundColor: t.chip }]}><Text style={{ fontSize: 20 }}>{l.emoji}</Text></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <T kind="h3" numberOfLines={1}>{l.name}</T>
                  <T kind="small" numberOfLines={1}>
                    {plural(l.items.length, 'item')}{plan.groups.length ? ` · ${plural(plan.groups.length, 'app')}` : ''}
                    {drops > 0 ? <Text style={{ color: t.good }}> · {drops} cheaper</Text> : null}
                  </T>
                </View>
                {plan.available > 0 && (
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ color: t.ink, fontFamily: t.fonts.display, fontSize: 18 }}>{rupee(plan.total)}</Text>
                    <T kind="caption">{plan.pinned ? 'your plan' : plan.groups.length > 1 ? 'cheapest mix' : 'cheapest'}</T>
                  </View>
                )}
              </View>
              {plan.groups.length > 0 && (
                <>
                  <View style={styles.bar}>
                    {plan.groups.map((g) => <View key={g.platform} style={{ flex: g.total, backgroundColor: PLATFORM[g.platform].mark.bg }} />)}
                  </View>
                  <View style={styles.legend}>
                    {plan.groups.map((g) => (
                      <View key={g.platform} style={styles.legendItem} accessibilityLabel={`${plural(g.lines.length, 'item')} from ${PLATFORM[g.platform].name}`}>
                        <PlatformMark platform={g.platform} size={16} />
                        <T kind="smallStrong" style={{ color: t.muted }}>{g.lines.length}</T>
                      </View>
                    ))}
                    {plan.missing.length > 0 && <T kind="smallStrong" style={{ color: t.accent }}>{plan.missing.length} not found</T>}
                  </View>
                </>
              )}
            </Card>
          )
        })}

        {s.lists.length === 0 && (
          <T kind="small" style={{ textAlign: 'center', paddingVertical: 16 }}>No lists yet. Make one below, then tap the bookmark on any product.</T>
        )}

        <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="New list name"
            placeholderTextColor={t.faint}
            onSubmitEditing={() => create(name, '🛍️')}
            returnKeyType="done"
            style={[styles.input, { backgroundColor: t.surface, color: t.ink, fontFamily: t.fonts.body }]}
          />
          <Button label="Create" icon={<Plus size={16} color={t.bg} />} disabled={!name.trim()} onPress={() => create(name, '🛍️')} />
        </View>
        {starters.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {starters.map((x) => <Chip key={x.name} label={`${x.emoji} ${x.name}`} onPress={() => create(x.name, x.emoji)} />)}
          </View>
        )}

        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 22, marginTop: 14 }}>
          <Pressable onPress={s.exportLists} disabled={!s.lists.length} style={[styles.link, { opacity: s.lists.length ? 1 : 0.4 }]}>
            <Download size={15} color={t.muted} /><T kind="smallStrong" style={{ color: t.muted }}>Back up lists</T>
          </Pressable>
          <Pressable onPress={async () => { const text = await pickJsonText().catch(() => null); if (text) s.importLists(text) }} style={styles.link}>
            <Upload size={15} color={t.muted} /><T kind="smallStrong" style={{ color: t.muted }}>Restore</T>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  listCard: { padding: 14 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bar: { flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden', gap: 2, marginTop: 12, marginBottom: 8 },
  legend: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  emoji: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, height: 50, borderRadius: 14, paddingHorizontal: 14, fontSize: 15 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 6 },
})
