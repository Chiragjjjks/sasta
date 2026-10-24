import { useEffect, useState } from 'react'
import { Animated, StyleSheet, Text } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useStore } from '@/state/store'
import { useTheme } from './theme'

export function Toast() {
  const { toast } = useStore()
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const [anim] = useState(() => new Animated.Value(0))
  useEffect(() => {
    Animated.timing(anim, { toValue: toast ? 1 : 0, duration: 180, useNativeDriver: true }).start()
  }, [toast, anim])
  if (!toast) return null
  return (
    <Animated.View pointerEvents="none" style={[styles.wrap, { top: insets.top + 8, opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-10, 0] }) }] }]}>
      <Text style={[styles.text, { backgroundColor: t.ink, color: t.bg, fontFamily: t.fonts.bodyBold }]}>{toast}</Text>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center', zIndex: 100 },
  text: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, fontSize: 13.5, overflow: 'hidden', textAlign: 'center' },
})
