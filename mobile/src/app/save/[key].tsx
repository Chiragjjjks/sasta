import { router, useLocalSearchParams } from 'expo-router'
import { Check, Plus } from 'lucide-react-native'
import { useState } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { STARTER_LISTS } from '@/core/lists'
import { formatSize } from '@/core/utils'
import { useStore } from '@/state/store'
import { Button, Card, Chip, Divider, T } from '@/ui/kit'
import { useTheme } from '@/ui/theme'

export default function SaveScreen() {
  const t = useTheme()
  const { key } = useLocalSearchParams<{ key: string }>()
  const s = useStore()
  const group = s.groupByKey(String(key))
  const [name, setName] = useState('')
  const starters = STARTER_LISTS.filter((x) => !s.lists.some((l) => l.name.toLowerCase() === x.name.toLowerCase()))
  if (!group) return <View style={{ flex: 1, padding: 24 }}><T kind="bodyStrong">This product is no longer in your results.</T></View>

  const create = (n: string, emoji: string) => {
    if (!n.trim()) return
    s.createList(n.trim(), emoji, group)
    s.showToast(`Saved to ${n.trim()}`)
    setName('')
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={['bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
          <T kind="small">{group.variant}{group.sizeGrams ? ` · ${formatSize(group.sizeGrams)}` : ''}</T>
          {s.lists.length > 0 && (
            <Card>
              {s.lists.map((l, i) => {
                const saved = l.items.some((x) => x.key === group.key)
                return (
                  <View key={l.id}>
                    {i > 0 && <Divider />}
                    <Pressable onPress={() => s.toggleSaved(l.id, group)} style={styles.row} android_ripple={{ color: '#00000010' }} accessibilityState={{ checked: saved }}>
                      <View style={[styles.emoji, { backgroundColor: t.chip }]}><Text style={{ fontSize: 18 }}>{l.emoji}</Text></View>
                      <View style={{ flex: 1 }}>
                        <T kind="bodyStrong">{l.name}</T>
                        <T kind="small">{l.items.length} {l.items.length === 1 ? 'product' : 'products'}</T>
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
})
