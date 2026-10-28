import { Check } from 'lucide-react-native'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { PLATFORM } from '@/core/platforms'
import type { Platform } from '@/core/types'
import { rupee } from '@/core/utils'
import { tap } from './kit'
import { PlatformMark } from './PlatformMark'
import { useTheme } from './theme'

export interface HeroChoice { key: string; label: string; on: boolean; platform?: Platform; onPress: () => void }

/** The answer first: the total, how it splits across apps (bar and legend), and the alternatives as pills. */
export function PlanHero({ label, total, sub, groups, saving, choices }: {
  label: string
  /** Undefined when nothing can be bought. */
  total?: number
  sub: string
  groups: { platform: Platform; total: number }[]
  saving?: string
  choices?: HeroChoice[]
}) {
  const t = useTheme()
  return (
    <View style={[styles.hero, { backgroundColor: t.hero }]}>
      <Text style={[styles.label, { color: t.heroMuted, fontFamily: t.fonts.bodySemi }]}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <Text style={{ color: t.heroText, fontFamily: t.fonts.display, fontSize: 32, letterSpacing: -0.6 }}>{total !== undefined ? rupee(total) : '—'}</Text>
        <Text style={{ color: t.heroMuted, fontFamily: t.fonts.bodySemi, fontSize: 12.5 }}>{sub}</Text>
      </View>
      {groups.length > 0 && (
        <View style={styles.bar}>
          {groups.map((g) => <View key={g.platform} style={[styles.segment, { flex: Math.max(g.total, 0.01), backgroundColor: PLATFORM[g.platform].mark.bg }]} />)}
        </View>
      )}
      <View style={styles.legend}>
        {groups.map((g) => (
          <View key={g.platform} style={styles.legendItem}>
            <PlatformMark platform={g.platform} size={18} />
            <Text style={{ color: t.heroText, fontFamily: t.fonts.bodySemi, fontSize: 12.5 }}>{PLATFORM[g.platform].short} {rupee(g.total)}</Text>
          </View>
        ))}
      </View>
      {!!saving && <Text style={{ color: '#9fe3bb', fontFamily: t.fonts.bodySemi, fontSize: 12.5, marginTop: 8 }}>{saving}</Text>}
      {!!choices?.length && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }} style={{ marginTop: 10 }}>
          {choices.map((c) => (
            <Pressable key={c.key} onPress={() => { tap(); c.onPress() }} accessibilityRole="button" accessibilityState={{ selected: c.on }} hitSlop={{ top: 7, bottom: 7 }}
              style={[styles.pill, { backgroundColor: c.on ? '#fff' : 'transparent', borderColor: c.on ? '#fff' : '#ffffff40' }]}>
              {c.on && !c.platform && <Check size={12} color={t.hero} />}
              {c.platform && <PlatformMark platform={c.platform} size={16} />}
              <Text style={{ color: c.on ? t.hero : t.heroText, fontFamily: t.fonts.bodySemi, fontSize: 12 }}>{c.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  hero: { borderRadius: 20, padding: 16 },
  label: { fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase' },
  bar: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', gap: 2, marginTop: 12, marginBottom: 10 },
  // The outline keeps dark app colours (Amazon) visible on the dark card.
  segment: { borderRadius: 3, borderWidth: 1, borderColor: '#ffffff30' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, rowGap: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 15, paddingHorizontal: 10, height: 30 },
})
