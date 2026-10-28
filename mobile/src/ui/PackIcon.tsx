import { useId } from 'react'
import { Image } from 'react-native'
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg'

const FLAVOR_COLORS: Record<string, [string, string]> = {
  'classic-salted': ['#f6cf3f', '#e0a915'],
  'magic-masala': ['#3d6be0', '#2448a8'],
  'cream-onion': ['#4caf5f', '#2f7d40'],
  'tomato-tango': ['#e5543f', '#b23322'],
  'chile-limon': ['#a04fd0', '#6d2c99'],
  'hot-sweet-chilli': ['#e0662f', '#a93d14'],
  'sizzling-hot': ['#d63b2f', '#8f1d15'],
  'masala-noodles': ['#f6c63c', '#d9311f'],
  'atta-noodles': ['#d9a24a', '#9a6a22'],
}

function fallback(key: string): [string, string] {
  let h = 0
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) % 360
  return [`hsl(${h}, 55%, 55%)`, `hsl(${h}, 55%, 38%)`]
}

export function flavorColor(variantKey: string): string {
  return (FLAVOR_COLORS[variantKey] ?? fallback(variantKey))[0]
}

/** Product photo when the app has one, otherwise a stylised chip bag in the flavour's colour. */
export function PackIcon({ variantKey, imageUrl, size = 44 }: { variantKey: string; imageUrl?: string; size?: number }) {
  // Unique per icon: two bags of the same flavour on screen must not share one gradient id.
  const id = `g${useId().replace(/[^a-z0-9]/gi, '')}`
  if (imageUrl) {
    return <Image source={{ uri: imageUrl }} style={{ width: size, height: size * 1.2, borderRadius: 10, backgroundColor: '#fff' }} resizeMode="contain" />
  }
  const [top, bottom] = FLAVOR_COLORS[variantKey] ?? fallback(variantKey)
  return (
    <Svg width={size} height={size * 1.25} viewBox="0 0 48 60">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={top} />
          <Stop offset="1" stopColor={bottom} />
        </LinearGradient>
      </Defs>
      <Path d="M4 6 L8 2 L12 6 L16 2 L20 6 L24 2 L28 6 L32 2 L36 6 L40 2 L44 6 L44 52 Q44 58 38 58 L10 58 Q4 58 4 52 Z" fill={`url(#${id})`} />
      <Circle cx="24" cy="30" r="9" fill="#fff" opacity={0.85} />
    </Svg>
  )
}
