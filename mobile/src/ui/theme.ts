import { useSyncExternalStore } from 'react'
import { Appearance, Platform, useColorScheme } from 'react-native'
import { loadAppearance, saveAppearance, type AppearancePref } from '@/core/storage'

/** Design tokens from the sasta.html prototype. */
/**
 * Text uses ink or muted (AA contrast on bg, surface and chip). faint is for icons, placeholders and
 * disabled states only. accent fills orange; accentText is the readable orange for words.
 */
const light = {
  bg: '#f0f1f6', surface: '#ffffff', ink: '#14152a', muted: '#5c5e72', faint: '#7f8196', line: '#e3e5ee', lineStrong: '#82859c',
  chip: '#eceef4', accent: '#f08a24', accentText: '#a84f08', onAccent: '#14152a', warnBg: '#fdecdc',
  good: '#16743f', goodBg: '#e3f5ea', bad: '#b3261e', badBg: '#fde8e6',
  hero: '#14152a', heroText: '#ffffff', heroMuted: '#ffffffb3',
  overlay: 'rgba(10,11,20,0.45)', dark: false,
}
const dark: typeof light = {
  bg: '#0d0e1a', surface: '#171829', ink: '#eef0fa', muted: '#a3a5bb', faint: '#8d8fa6', line: '#262840', lineStrong: '#6b6e98',
  chip: '#232540', accent: '#f39a40', accentText: '#f39a40', onAccent: '#14152a', warnBg: '#3a2614',
  good: '#5fd394', goodBg: '#173524', bad: '#ff8a80', badBg: '#3a1a1a',
  hero: '#2a2d5a', heroText: '#ffffff', heroMuted: '#ffffffb3',
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

