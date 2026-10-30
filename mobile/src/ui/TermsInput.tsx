import { Search as SearchIcon, X } from 'lucide-react-native'
import { useRef, useState, type ComponentRef } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { MAX_TERMS, parseTerms } from '@/core/search-batch'
import { T, tap } from './kit'
import { useTheme } from './theme'

/**
 * The search bar. One product behaves as it always did. A comma or a new line turns what came before it
 * into a chip, so "lays, maggi, amul butter" becomes three chips and the button reads "Compare 3".
 * The chips live here; the text being typed lives in the store (`value`), so recents and Clear keep working.
 */
export function TermsInput({ value, onChangeText, chips, onChipsChange, onSubmit, onClear, placeholder }: {
  value: string
  onChangeText: (text: string) => void
  chips: string[]
  onChipsChange: (chips: string[]) => void
  /** `terms` has one entry for a normal search, two or more for a several-product search. */
  onSubmit: (terms: string[]) => void
  onClear: () => void
  placeholder: string
}) {
  const t = useTheme()
  const input = useRef<ComponentRef<typeof TextInput>>(null)
  const [refused, setRefused] = useState<string | null>(null)

  /** Chips plus whatever is still in the box, cleaned up. */
  const all = (extra: string) => parseTerms([...chips, extra].join('\n'))
  const pending = all(value)
  const count = pending.terms.length
  // A term typed past the limit is flagged as soon as it is there, not only after Compare.
  const notAdded = pending.rejected[0] ?? refused

  const change = (text: string) => {
    if (!/[,\n]/.test(text)) { onChangeText(text); if (refused) setRefused(null); return }
    // Everything before the last separator is finished; the tail stays in the box.
    const cut = Math.max(text.lastIndexOf(','), text.lastIndexOf('\n'))
    const { terms, rejected } = all(text.slice(0, cut))
    onChipsChange(terms)
    setRefused(rejected[0] ?? null)
    onChangeText(text.slice(cut + 1).replace(/^\s+/, ''))
  }

  const submit = () => {
    const { terms, rejected } = all(value)
    if (rejected.length) { setRefused(rejected[0]); return }
    if (!terms.length) return
    setRefused(null)
    if (terms.length > 1) { onChipsChange(terms); onChangeText('') } else onChipsChange([])
    onSubmit(terms)
  }

  const edit = (chip: string) => {
    tap()
    // Keep what was being typed: it becomes a chip of its own before the tapped one comes back to the box.
    const { terms } = parseTerms([...chips.filter((c) => c !== chip), value].join('\n'))
    onChipsChange(terms)
    onChangeText(chip)
    setRefused(null)
    input.current?.focus()
  }
  const drop = (chip: string) => { tap(); onChipsChange(chips.filter((c) => c !== chip)); setRefused(null) }

  const clear = () => { setRefused(null); onClear(); input.current?.focus() }

  return (
    <View>
      <View style={[styles.bar, { backgroundColor: t.surface }]}>
        {chips.length > 0 && (
          <View style={styles.chips}>
            {chips.map((c) => (
              <View key={c} style={[styles.chip, { backgroundColor: t.chip }]}>
                <Pressable onPress={() => edit(c)} accessibilityLabel={`Edit ${c}`} style={{ flexShrink: 1 }}>
                  <Text style={{ color: t.ink, fontFamily: t.fonts.bodySemi, fontSize: 14 }} numberOfLines={1}>{c}</Text>
                </Pressable>
                <Pressable hitSlop={8} onPress={() => drop(c)} accessibilityLabel={`Remove ${c}`}>
                  <X size={14} color={t.muted} />
                </Pressable>
              </View>
            ))}
          </View>
        )}
        <View style={styles.row}>
          <SearchIcon size={18} color={t.muted} />
          <TextInput
            ref={input}
            value={value}
            onChangeText={change}
            onSubmitEditing={submit}
            placeholder={chips.length ? 'Add another' : placeholder}
            placeholderTextColor={t.faint}
            returnKeyType="search"
            autoCorrect={false}
            style={[styles.input, { color: t.ink, fontFamily: t.fonts.body }]}
            accessibilityLabel={placeholder}
          />
          {(!!value || chips.length > 0) && (
            <Pressable hitSlop={10} onPress={clear} accessibilityLabel="Clear search">
              <X size={18} color={t.faint} />
            </Pressable>
          )}
          <Pressable onPress={submit} style={[styles.compare, { backgroundColor: t.ink }]} accessibilityLabel="Compare prices">
            <Text style={{ color: t.bg, fontFamily: t.fonts.bodyBold, fontSize: 14 }}>{count > 1 ? `Compare ${count}` : 'Compare'}</Text>
          </Pressable>
        </View>
      </View>
      {notAdded !== null && notAdded !== undefined && (
        <T kind="small" style={{ color: t.accentText, marginTop: 8, paddingHorizontal: 4 }}>
          {MAX_TERMS} max · “{notAdded}” not added. Remove one to add another.
        </T>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  bar: { borderRadius: 18, elevation: 2, shadowColor: '#14152a', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 10, paddingTop: 10 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, borderRadius: 16, paddingLeft: 12, paddingRight: 9, maxWidth: '100%' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 14, paddingRight: 6, height: 54 },
  input: { flex: 1, minWidth: 0, fontSize: 16, paddingVertical: 0 },
  compare: { flexShrink: 0, height: 42, borderRadius: 13, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
})
