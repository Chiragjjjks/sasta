import { Tabs } from 'expo-router'
import { Bookmark, Search, ShoppingBag, UserRound } from 'lucide-react-native'
import { useStore } from '@/state/store'
import { useTheme } from '@/ui/theme'

export default function TabsLayout() {
  const t = useTheme()
  const { cart, accounts } = useStore()
  const items = cart.reduce((s, i) => s + i.qty, 0)
  const connected = Object.values(accounts).filter((a) => a?.status === 'connected').length
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.ink,
        tabBarInactiveTintColor: t.faint,
        tabBarStyle: { backgroundColor: t.surface, borderTopColor: t.line, height: undefined, paddingTop: 6 },
        tabBarLabelStyle: { fontFamily: t.fonts.bodySemi, fontSize: 11.5 },
        tabBarBadgeStyle: { backgroundColor: t.accent, color: '#fff', fontFamily: t.fonts.bodyBold, fontSize: 10.5 },
        sceneStyle: { backgroundColor: t.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Search', tabBarIcon: ({ color, size }) => <Search color={color} size={size - 2} /> }} />
      <Tabs.Screen name="lists" options={{ title: 'Lists', tabBarIcon: ({ color, size }) => <Bookmark color={color} size={size - 2} /> }} />
      <Tabs.Screen name="cart" options={{ title: 'Cart', tabBarBadge: items || undefined, tabBarIcon: ({ color, size }) => <ShoppingBag color={color} size={size - 2} /> }} />
      <Tabs.Screen name="account" options={{ title: 'Account', tabBarBadge: connected ? undefined : undefined, tabBarIcon: ({ color, size }) => <UserRound color={color} size={size - 2} /> }} />
    </Tabs>
  )
}
