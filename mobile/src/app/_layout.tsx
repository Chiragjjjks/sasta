import { BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque'
import { JetBrainsMono_500Medium, JetBrainsMono_700Bold } from '@expo-google-fonts/jetbrains-mono'
import { Figtree_400Regular, Figtree_500Medium, Figtree_600SemiBold, Figtree_700Bold, useFonts } from '@expo-google-fonts/figtree'
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AutoSignInHost, HiddenPages, SignInHost } from '@/native/SessionHosts'
import { FoodProvider } from '@/state/food'
import { StoreProvider } from '@/state/store'
import { restoreAppearance, useTheme } from '@/ui/theme'
import { Toast } from '@/ui/Toast'

SplashScreen.preventAutoHideAsync().catch(() => {})

export default function RootLayout() {
  const [loaded, fontError] = useFonts({
    BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold,
    Figtree_400Regular, Figtree_500Medium, Figtree_600SemiBold, Figtree_700Bold,
    JetBrainsMono_500Medium, JetBrainsMono_700Bold,
  })
  const [themed, setThemed] = useState(false)
  const t = useTheme()
  useEffect(() => { restoreAppearance().finally(() => setThemed(true)) }, [])
  const ready = (loaded || !!fontError) && themed
  useEffect(() => { if (ready) SplashScreen.hideAsync().catch(() => {}) }, [ready])
  if (!ready) return null

  const nav = t.dark ? DarkTheme : DefaultTheme
  return (
    <SafeAreaProvider>
      <ThemeProvider value={{ ...nav, colors: { ...nav.colors, background: t.bg, card: t.surface, text: t.ink, border: t.line, primary: t.ink } }}>
        <StoreProvider>
        <FoodProvider>
          <View style={{ flex: 1, backgroundColor: t.bg }}>
            <StatusBar style={t.dark ? 'light' : 'dark'} />
            <Stack screenOptions={{ headerShadowVisible: false, headerStyle: { backgroundColor: t.bg }, headerTitleStyle: { fontFamily: t.fonts.displayBold, color: t.ink }, headerTintColor: t.ink, contentStyle: { backgroundColor: t.bg } }}>
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="product/[key]" options={{ presentation: 'modal', title: 'Compare prices', animation: 'slide_from_bottom' }} />
              <Stack.Screen name="save/[key]" options={{ presentation: 'modal', title: 'Save to list', animation: 'slide_from_bottom' }} />
              <Stack.Screen name="list/[id]" options={{ title: '' }} />
              <Stack.Screen name="restaurant/[key]" options={{ title: '' }} />
              <Stack.Screen name="location" options={{ presentation: 'modal', title: 'Delivery location', animation: 'slide_from_bottom' }} />
            </Stack>
            <HiddenPages />
            <SignInHost />
            <AutoSignInHost />
            <Toast />
          </View>
        </FoodProvider>
        </StoreProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  )
}
