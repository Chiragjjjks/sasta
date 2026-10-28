import { Text, View, type StyleProp, type ViewStyle } from 'react-native'
import { PLATFORM } from '@/core/platforms'
import type { Platform } from '@/core/types'
import { fonts } from './theme'

/** The app's monogram tile (Zepto's purple Z, Instamart's orange I…), so apps are told apart without reading. */
export function PlatformMark({ platform, size = 22, style }: { platform: Platform; size?: number; style?: StyleProp<ViewStyle> }) {
  const { mark, name } = PLATFORM[platform]
  return (
    <View accessibilityLabel={name} style={[{ width: size, height: size, borderRadius: Math.round(size * 0.3), backgroundColor: mark.bg, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Text style={{ color: mark.fg, fontFamily: fonts.display, fontSize: size * (mark.text.length > 1 ? 0.42 : 0.52), includeFontPadding: false, marginTop: -1 }}>{mark.text}</Text>
    </View>
  )
}
