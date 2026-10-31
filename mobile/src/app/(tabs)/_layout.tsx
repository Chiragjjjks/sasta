import { Tabs } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Bookmark, ShoppingBag, ShoppingBasket, UserRound, Utensils } from 'lucide-react-native'
import { useStore } from '@/state/store'
import { useTheme } from '@/ui/theme'

export default function TabsLayout() {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const { cart } = useStore()
  const items = cart.reduce((s, i) => s + i.qty, 0)
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.ink,
        tabBarInactiveTintColor: t.muted,
        // Fixed height plus the gesture-bar inset, so labels are never clipped.
        tabBarStyle: { backgroundColor: t.surface, borderTopColor: t.line, height: 72 + insets.bottom, paddingTop: 6, paddingBottom: Math.max(insets.bottom, 8) },
        tabBarLabelStyle: { fontFamily: t.fonts.bodySemi, fontSize: 12 },
        tabBarBadgeStyle: { backgroundColor: t.accent, color: t.onAccent, fontFamily: t.fonts.bodyBold, fontSize: 10.5 },
        sceneStyle: { backgroundColor: t.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Grocery', tabBarIcon: ({ color, size }) => <ShoppingBasket color={color} size={size - 2} /> }} />
      <Tabs.Screen name="food" options={{ title: 'Food', tabBarIcon: ({ color, size }) => <Utensils color={color} size={size - 2} /> }} />
      <Tabs.Screen name="lists" options={{ title: 'Lists', tabBarIcon: ({ color, size }) => <Bookmark color={color} size={size - 2} /> }} />
      <Tabs.Screen name="cart" options={{ title: 'Cart', tabBarBadge: items || undefined, tabBarIcon: ({ color, size }) => <ShoppingBag color={color} size={size - 2} /> }} />
      <Tabs.Screen name="account" options={{ title: 'Account', tabBarIcon: ({ color, size }) => <UserRound color={color} size={size - 2} /> }} />
    </Tabs>
  )
}
