import { router, useLocalSearchParams } from 'expo-router'
import { Check, Plus } from 'lucide-react-native'
import { useState } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { itemTitle, listPlan, STARTER_LISTS } from '@/core/lists'
import { formatSize, plural, rupee } from '@/core/utils'
import { useStore } from '@/state/store'
import { Button, Card, Chip, Divider, T } from '@/ui/kit'
import { PlatformMark } from '@/ui/PlatformMark'
import { useTheme } from '@/ui/theme'

export default function SaveScreen() {
  const t = useTheme()
  const { key, batchId, queryId } = useLocalSearchParams<{ key: string; batchId?: string; queryId?: string }>()
  const s = useStore()
  const source = batchId && queryId ? { batchId: String(batchId), queryId: String(queryId) } : undefined
  const group = s.groupByKey(String(key), source)
  const [name, setName] = useState('')
  const starters = STARTER_LISTS.filter((x) => !s.lists.some((l) => l.name.toLowerCase() === x.name.toLowerCase()))
  if (!group) return (
    <View style={{ flex: 1, padding: 24, gap: 12 }}>
      <T kind="bodyStrong">{source ? 'These results are out of date. Search again.' : 'This product is no longer in your results.'}</T>
      <Button label="Back" onPress={() => router.back()} />
    </View>
  )

  const create = (n: string, emoji: string) => {
    if (!n.trim()) return
    s.createList(n.trim(), emoji, group, source)
    s.showToast(`Saved to ${n.trim()}`)
    setName('')
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={['bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
          <T kind="small">{group.variant}{(group.packLabel || group.sizeGrams) ? ` · ${(group.packLabel ?? formatSize(group.sizeGrams))}` : ''}</T>
          {s.lists.length > 0 && (
            <Card>
              {s.lists.map((l, i) => {
                const saved = l.items.some((x) => x.key === group.key)
                const plan = listPlan(l.items)
                const names = l.items.map(itemTitle)
                return (
                  <View key={l.id}>
                    {i > 0 && <Divider />}
                    <Pressable onPress={() => s.toggleSaved(l.id, group, source)} style={styles.row} android_ripple={{ color: '#00000010' }} accessibilityState={{ checked: saved }}>
                      <View style={[styles.emoji, { backgroundColor: t.chip }]}><Text style={{ fontSize: 18 }}>{l.emoji}</Text></View>
                      <View style={{ flex: 1 }}>
                        <T kind="bodyStrong">{l.name}</T>
                        <T kind="small" numberOfLines={2}>
                          {l.items.length ? `${names.slice(0, 3).join(', ')}${names.length > 3 ? ` +${names.length - 3} more` : ''}` : 'Empty'}
                        </T>
                        {plan.groups.length > 0 && (
                          <View style={styles.apps}>
                            {plan.groups.map((g) => <PlatformMark key={g.platform} platform={g.platform} size={16} />)}
                            <T kind="caption">{plural(l.items.length, 'item')} · {rupee(plan.total)}</T>
                          </View>
                        )}
                      </View>
                      <View style={[styles.check, { borderColor: saved ? t.ink : t.line, backgroundColor: saved ? t.ink : 'transparent' }]}>
                        {saved && <Check size={15} color={t.bg} />}
                      </View>
                    </Pressable>
                  </View>
                )
              })}
            </Card>
          )}
          <T kind="smallStrong">New list</T>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="e.g. Office snacks"
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
        </ScrollView>
        <View style={{ padding: 16 }}>
          <Button label="Done" onPress={() => router.back()} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  emoji: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  check: { width: 26, height: 26, borderRadius: 8, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, height: 50, borderRadius: 14, paddingHorizontal: 14, fontSize: 15 },
  apps: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
})
