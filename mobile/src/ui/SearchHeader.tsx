import { router } from 'expo-router'
import { MapPin, Search as SearchIcon, X } from 'lucide-react-native'
import { useRef, type ComponentRef } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useStore } from '@/state/store'
import { tap } from './kit'
import { useTheme } from './theme'

/** Logo, delivery location and the search bar with recent searches. Grocery and Food share it. */
export function SearchHeader({ value, onChange, onSubmit, onClear, placeholder, recents, showRecents }: {
  value: string; onChange: (q: string) => void; onSubmit: (q: string) => void; onClear: () => void
  placeholder: string; recents: string[]; showRecents: boolean
}) {
  const t = useTheme()
  const { location } = useStore()
  const input = useRef<ComponentRef<typeof TextInput>>(null)
  return (
    <View style={styles.headerWrap}>
      <View style={styles.topRow}>
        <Text style={[styles.logo, { color: t.ink, fontFamily: t.fonts.display }]}>sasta<Text style={{ color: t.accent }}>.</Text></Text>
        <Pressable onPress={() => router.push('/location')} style={[styles.locPill, { backgroundColor: t.surface }]} accessibilityLabel={`Delivery location ${location.label} ${location.pincode}`}>
          <MapPin size={14} color={t.muted} />
          <Text style={{ color: t.muted, fontFamily: t.fonts.body, fontSize: 13, flexShrink: 1 }} numberOfLines={1}>
            {location.label} · {location.pincode}
          </Text>
        </Pressable>
      </View>
      <View style={[styles.searchBar, { backgroundColor: t.surface }]}>
        <SearchIcon size={18} color={t.muted} />
        <TextInput
          ref={input}
          value={value}
          onChangeText={onChange}
          onSubmitEditing={() => onSubmit(value)}
          placeholder={placeholder}
          placeholderTextColor={t.faint}
          returnKeyType="search"
          autoCorrect={false}
          style={[styles.input, { color: t.ink, fontFamily: t.fonts.body }]}
          accessibilityLabel={placeholder}
        />
        {!!value && (
          <Pressable hitSlop={10} onPress={() => { onClear(); input.current?.focus() }} accessibilityLabel="Clear search">
            <X size={18} color={t.faint} />
          </Pressable>
        )}
        <Pressable onPress={() => onSubmit(value)} style={[styles.compare, { backgroundColor: t.ink }]} accessibilityLabel="Compare prices">
          <Text style={{ color: t.bg, fontFamily: t.fonts.bodyBold, fontSize: 14 }}>Compare</Text>
        </Pressable>
      </View>
      {recents.length > 0 && showRecents && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recents} keyboardShouldPersistTaps="handled">
          {recents.map((r) => (
            <Pressable key={r} onPress={() => { tap(); onSubmit(r) }} style={[styles.recent, { borderColor: t.line }]}>
              <Text style={{ color: t.muted, fontFamily: t.fonts.body, fontSize: 13 }} numberOfLines={1}>{r}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  headerWrap: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, gap: 12 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logo: { fontSize: 28, letterSpacing: -1.2 },
  locPill: { marginLeft: 'auto', flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 36, borderRadius: 18, maxWidth: '62%' },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 18, paddingLeft: 14, paddingRight: 6, height: 54, elevation: 2, shadowColor: '#14152a', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  input: { flex: 1, fontSize: 16, paddingVertical: 0 },
  compare: { height: 42, borderRadius: 13, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  recents: { gap: 8, paddingRight: 16 },
  recent: { borderWidth: 1, borderRadius: 17, height: 34, paddingHorizontal: 13, justifyContent: 'center', maxWidth: 220 },
})
