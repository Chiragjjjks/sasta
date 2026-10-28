import { useSyncExternalStore } from 'react'
import { Appearance, Platform, useColorScheme } from 'react-native'
import { loadAppearance, saveAppearance, type AppearancePref } from '@/core/storage'

/** Design tokens from the sasta.html prototype. */
const light = {
  bg: '#f0f1f6', surface: '#ffffff', ink: '#14152a', muted: '#6b6d80', faint: '#9b9db0', line: '#e3e5ee',
  chip: '#eceef4', accent: '#f08a24', good: '#1b8a4b', goodBg: '#e3f5ea', hero: '#14152a', heroText: '#ffffff',
  overlay: 'rgba(10,11,20,0.45)', dark: false,
}
const dark: typeof light = {
  bg: '#0d0e1a', surface: '#171829', ink: '#eef0fa', muted: '#a3a5bb', faint: '#7a7c93', line: '#262840',
  chip: '#232540', accent: '#f39a40', good: '#5fd394', goodBg: '#173524', hero: '#22243d', heroText: '#ffffff',
  overlay: 'rgba(0,0,0,0.6)', dark: true,
}

export const fonts = {
  display: 'BricolageGrotesque_800ExtraBold',
  displayBold: 'BricolageGrotesque_700Bold',
  body: 'Figtree_500Medium',
  bodyRegular: 'Figtree_400Regular',
  bodyBold: 'Figtree_700Bold',
  bodySemi: 'Figtree_600SemiBold',
}

export type Theme = typeof light & { fonts: typeof fonts }
const LIGHT: Theme = { ...light, fonts }
const DARK: Theme = { ...dark, fonts }

/** System, Light or Dark, chosen in Account. Kept outside React so every screen re-renders together. */
let pref: AppearancePref = 'system'
const listeners = new Set<() => void>()
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }

function apply(next: AppearancePref) {
  pref = next
  // Native dialogs and the system bars follow the app's choice on Android.
  if (Platform.OS !== 'web') Appearance.setColorScheme(next === 'system' ? 'unspecified' : next)
  listeners.forEach((l) => l())
}

export function setAppearance(next: AppearancePref) {
  apply(next)
  void saveAppearance(next)
}

/** Read the saved choice before the first screen renders, so the app never flashes the wrong theme. */
export async function restoreAppearance() {
  const saved = await loadAppearance()
  if (saved !== pref) apply(saved)
}

export function useAppearance(): AppearancePref {
  return useSyncExternalStore(subscribe, () => pref, () => pref)
}

export function useTheme(): Theme {
  const scheme = useColorScheme()
  const choice = useAppearance()
  return (choice === 'system' ? scheme === 'dark' : choice === 'dark') ? DARK : LIGHT
}

export const PLATFORM_COLORS: Record<string, string> = {}
