import * as Haptics from 'expo-haptics'
import { useEffect, useState, type ReactNode } from 'react'
import { AccessibilityInfo, ActivityIndicator, Animated, Platform, Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native'
import { useTheme } from './theme'

export const tap = () => { if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {}) }

type Variant = 'primary' | 'secondary' | 'ghost' | 'good' | 'danger'

export function Button({ label, onPress, variant = 'primary', icon, disabled, loading, style, small, flex }: {
  label: string; onPress: () => void; variant?: Variant; icon?: ReactNode; disabled?: boolean; loading?: boolean
  style?: StyleProp<ViewStyle>; small?: boolean; flex?: boolean
}) {
  const t = useTheme()
  const bg = { primary: t.ink, secondary: t.chip, ghost: 'transparent', good: t.goodBg, danger: t.accent }[variant]
  const fg = { primary: t.bg, secondary: t.ink, ghost: t.ink, good: t.good, danger: t.onAccent }[variant]
  return (
    <Pressable
      onPress={() => { tap(); onPress() }}
      disabled={disabled || loading}
      android_ripple={{ color: t.dark ? '#ffffff22' : '#00000014', borderless: false }}
      style={({ pressed }) => [
        styles.btn, small && styles.btnSmall, flex && { flex: 1 },
        { backgroundColor: bg, opacity: disabled ? 0.45 : pressed && Platform.OS !== 'android' ? 0.8 : 1 }, style,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {loading ? <ActivityIndicator size="small" color={fg} /> : icon}
      <Text style={{ color: fg, fontFamily: t.fonts.bodyBold, fontSize: small ? 13 : 15 }} numberOfLines={1}>{label}</Text>
    </Pressable>
  )
}

export function Chip({ label, active, onPress, dot, style }: { label: string; active?: boolean; onPress?: () => void; dot?: string; style?: StyleProp<ViewStyle> }) {
  const t = useTheme()
  return (
    <Pressable
      onPress={onPress ? () => { tap(); onPress() } : undefined}
      style={[styles.chip, { backgroundColor: active ? t.ink : t.surface, borderColor: active ? t.ink : t.line }, style]}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={{ selected: !!active }}
    >
      {dot && <View style={[styles.dot, { backgroundColor: dot }]} />}
      <Text style={{ color: active ? t.bg : t.ink, fontFamily: t.fonts.bodySemi, fontSize: 13 }} numberOfLines={1}>{label}</Text>
    </Pressable>
  )
}

export function Stepper({ qty, onChange, min = 0 }: { qty: number; onChange: (q: number) => void; min?: number }) {
  const t = useTheme()
  return (
    <View style={[styles.stepper, { backgroundColor: t.chip }]}>
      <Pressable hitSlop={6} onPress={() => { tap(); onChange(qty - 1) }} disabled={qty <= min} style={styles.stepBtn} accessibilityLabel="Fewer">
        <Text style={[styles.stepTxt, { color: qty <= min ? t.faint : t.ink }]}>−</Text>
      </Pressable>
      <Text style={{ minWidth: 18, textAlign: 'center', color: t.ink, fontFamily: t.fonts.bodyBold, fontSize: 14 }}>{qty}</Text>
      <Pressable hitSlop={6} onPress={() => { tap(); onChange(qty + 1) }} style={styles.stepBtn} accessibilityLabel="More">
        <Text style={[styles.stepTxt, { color: t.ink }]}>+</Text>
      </Pressable>
    </View>
  )
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const t = useTheme()
  const base = [styles.card, { backgroundColor: t.surface }, style]
  if (!onPress) return <View style={base}>{children}</View>
  return (
    <Pressable onPress={onPress} android_ripple={{ color: t.dark ? '#ffffff14' : '#0000000d' }} style={base}>
      {children}
    </Pressable>
  )
}

export function T({ children, style, kind = 'body', numberOfLines }: {
  children: ReactNode; style?: StyleProp<TextStyle>; numberOfLines?: number
  kind?: 'title' | 'h2' | 'h3' | 'body' | 'bodyStrong' | 'small' | 'smallStrong' | 'caption' | 'price'
}) {
  const t = useTheme()
  const k: Record<string, TextStyle> = {
    title: { fontFamily: t.fonts.display, fontSize: 28, color: t.ink, letterSpacing: -0.6 },
    h2: { fontFamily: t.fonts.display, fontSize: 21, color: t.ink, letterSpacing: -0.3 },
    h3: { fontFamily: t.fonts.displayBold, fontSize: 16, color: t.ink },
    body: { fontFamily: t.fonts.body, fontSize: 14.5, color: t.ink },
    bodyStrong: { fontFamily: t.fonts.bodyBold, fontSize: 14.5, color: t.ink },
    small: { fontFamily: t.fonts.body, fontSize: 12.5, color: t.muted },
    smallStrong: { fontFamily: t.fonts.bodyBold, fontSize: 12.5, color: t.ink },
    caption: { fontFamily: t.fonts.body, fontSize: 11.5, color: t.muted },
    price: { fontFamily: t.fonts.display, fontSize: 20, color: t.ink },
  }
  return <Text style={[k[kind], style]} numberOfLines={numberOfLines}>{children}</Text>
}

export function Badge({ label, tone }: { label: string; tone: 'good' | 'muted' | 'warn' }) {
  const t = useTheme()
  const bg = { good: t.goodBg, muted: t.chip, warn: t.warnBg }[tone]
  const fg = { good: t.good, muted: t.muted, warn: t.accentText }[tone]
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={{ color: fg, fontFamily: t.fonts.monoBold, fontSize: 10.5, letterSpacing: 0.8 }}>{label.toUpperCase()}</Text>
    </View>
  )
}

export function Segmented<V extends string | number>({ value, options, onChange, stretch }: { value: V; options: { value: V; label: string }[]; onChange: (v: V) => void; stretch?: boolean }) {
  const t = useTheme()
  return (
    <View style={[styles.seg, { backgroundColor: t.chip }]}>
      {options.map((o) => {
        const on = o.value === value
        return (
          <Pressable key={String(o.value)} onPress={() => { tap(); onChange(o.value) }} style={[styles.segItem, stretch && { flex: 1 }, on && { backgroundColor: t.surface }]} accessibilityRole="tab" accessibilityState={{ selected: on }}>
            <Text style={{ color: on ? t.ink : t.muted, fontFamily: t.fonts.bodyBold, fontSize: 13 }} numberOfLines={1}>{o.label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

/** Green dot that breathes while something is live. Still when the phone asks for less motion. */
export function LiveDot({ color, size = 8 }: { color?: string; size?: number }) {
  const t = useTheme()
  const [glow] = useState(() => new Animated.Value(0))
  useEffect(() => {
    let loop: Animated.CompositeAnimation | undefined
    let cancelled = false
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce || cancelled) return
      loop = Animated.loop(Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 900, useNativeDriver: true }),
      ]))
      loop.start()
    }).catch(() => {})
    return () => { cancelled = true; loop?.stop() }
  }, [glow])
  const c = color ?? t.good
  return (
    <View style={{ width: size * 2, height: size * 2, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ position: 'absolute', width: size * 2, height: size * 2, borderRadius: size, backgroundColor: c, opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.12, 0.32] }), transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }] }} />
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c }} />
    </View>
  )
}

/** Small uppercase mono label above a section, optionally numbered ("01") or live. */
export function Eyebrow({ label, n, live, tone, style }: { label: string; n?: number; live?: boolean; tone?: string; style?: StyleProp<ViewStyle> }) {
  const t = useTheme()
  return (
    <View style={[styles.eyebrow, style]}>
      {live && <LiveDot size={7} />}
      {n !== undefined && (
        <View style={[styles.eyebrowNum, { borderColor: t.lineStrong }]}>
          <Text style={{ color: t.ink, fontFamily: t.fonts.monoBold, fontSize: 10 }}>{String(n).padStart(2, '0')}</Text>
        </View>
      )}
      <Text style={{ color: tone ?? t.muted, fontFamily: t.fonts.mono, fontSize: 11, letterSpacing: 1.1, flexShrink: 1 }} numberOfLines={1}>{label.toUpperCase()}</Text>
    </View>
  )
}

/** Big two-line heading: the statement in ink, the follow-up line quieter. */
export function Headline({ lead, rest, size = 34, style }: { lead: string; rest?: string; size?: number; style?: StyleProp<TextStyle> }) {
  const t = useTheme()
  const line: TextStyle = { fontFamily: t.fonts.display, fontSize: size, lineHeight: Math.round(size * 1.04), letterSpacing: -size * 0.035 }
  return (
    // One spoken sentence for TalkBack, instead of two lines with a break.
    <Text accessibilityRole="header" accessibilityLabel={rest ? `${lead} ${rest}` : lead} style={[line, { color: t.ink }, style]}>
      {lead}{rest ? <Text style={{ color: t.muted }}>{'\n'}{rest}</Text> : null}
    </Text>
  )
}

export function Divider() {
  const t = useTheme()
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.line }} />
}

const styles = StyleSheet.create({
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingHorizontal: 18, minHeight: 50, overflow: 'hidden' },
  btnSmall: { minHeight: 36, paddingHorizontal: 12, borderRadius: 11 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 14, height: 36, borderRadius: 18, borderWidth: 1 },
  dot: { width: 9, height: 9, borderRadius: 3 },
  stepper: { flexDirection: 'row', alignItems: 'center', borderRadius: 18, height: 34 },
  stepBtn: { width: 32, height: 34, alignItems: 'center', justifyContent: 'center' },
  stepTxt: { fontSize: 18, fontWeight: '700', marginTop: -2 },
  card: { borderRadius: 20, overflow: 'hidden' },
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  eyebrow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyebrowNum: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 6, height: 20, alignItems: 'center', justifyContent: 'center' },
  seg: { flexDirection: 'row', borderRadius: 13, padding: 3 },
  segItem: { paddingHorizontal: 14, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
})
