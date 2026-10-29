import { View } from 'react-native'
import { useTheme } from './theme'

/** India's food mark: a square with a dot for veg, a triangle for non-veg. Filled so it reads on an active chip. */
export function VegMark({ veg, size = 14 }: { veg?: boolean; size?: number }) {
  const t = useTheme()
  if (veg === undefined) return null
  const c = veg ? t.good : t.bad
  const inner = Math.round(size * 0.46)
  return (
    <View accessibilityLabel={veg ? 'Veg' : 'Non-veg'} style={{ width: size, height: size, borderWidth: 1.5, borderColor: c, borderRadius: 3, backgroundColor: t.surface, alignItems: 'center', justifyContent: 'center' }}>
      {veg
        ? <View style={{ width: inner, height: inner, borderRadius: inner / 2, backgroundColor: c }} />
        : <View style={{ width: 0, height: 0, borderLeftWidth: inner / 2 + 0.5, borderRightWidth: inner / 2 + 0.5, borderBottomWidth: inner, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: c, marginTop: -1 }} />}
    </View>
  )
}
