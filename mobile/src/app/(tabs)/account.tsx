import { router } from 'expo-router'
import { CheckCircle2, ChevronRight, MapPin, ShieldCheck } from 'lucide-react-native'
import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { IS_NATIVE } from '@/core/adapters'
import { ACCOUNT_CONFIG } from '@/core/accounts'
import { PLATFORM, PLATFORMS } from '@/core/platforms'
import type { Platform } from '@/core/types'
import { useStore } from '@/state/store'
import { Badge, Button, Card, Divider, T } from '@/ui/kit'
import { useTheme } from '@/ui/theme'

export default function AccountScreen() {
  const t = useTheme()
  const s = useStore()
  const [busy, setBusy] = useState<Platform | null>(null)
  const [all, setAll] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<Platform, string>>>({})
  const connected = PLATFORMS.filter((p) => s.accounts[p.id]?.status === 'connected').length

  async function run(p: Platform, fn: () => Promise<unknown>) {
    setBusy(p); setErrors((e) => ({ ...e, [p]: undefined }))
    try { await fn() } catch (e) { setErrors((x) => ({ ...x, [p]: (e as Error).message || 'Something went wrong' })) } finally { setBusy(null) }
  }

  async function connectAll() {
    setAll(true)
    try {
      for (const { id } of PLATFORMS) {
        if (s.accounts[id]?.status === 'connected') continue
        setBusy(id)
        try { const acc = await s.connect(id); if (acc.status !== 'connected') break }
        catch (e) { setErrors((x) => ({ ...x, [id]: (e as Error).message })) }
      }
    } finally { setBusy(null); setAll(false) }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 32 }}>
        <T kind="title" style={{ fontSize: 26 }}>Account</T>

        <Card onPress={() => router.push('/location')} style={styles.locRow}>
          <MapPin size={18} color={t.ink} />
          <View style={{ flex: 1 }}>
            <T kind="bodyStrong">{s.location.label} · {s.location.pincode}</T>
            <T kind="small">{s.location.lat !== undefined ? 'Exact location set' : 'No exact location: live prices may fail'}</T>
          </View>
          <ChevronRight size={18} color={t.faint} />
        </Card>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
          <T kind="h2" style={{ flex: 1 }}>Connected apps</T>
          <Badge label="Beta" tone="warn" />
        </View>
        <T kind="small" style={{ marginTop: -6 }}>
          Sign in once on each app&apos;s own page for your member prices and real fees. {connected} of {PLATFORMS.length} connected.
        </T>
        {IS_NATIVE && connected < PLATFORMS.length && (
          <Button label={all ? 'Connecting one by one…' : connected ? `Connect the other ${PLATFORMS.length - connected}` : 'Connect all apps'} loading={all} disabled={busy !== null && !all} onPress={connectAll} />
        )}
        {!IS_NATIVE && <T kind="small" style={{ color: t.accent }}>Signing in works in the Android app.</T>}

        <Card>
          {PLATFORMS.map(({ id }, i) => {
            const cfg = ACCOUNT_CONFIG[id]
            const acc = s.accounts[id]
            const status = acc?.status ?? 'disconnected'
            const isBusy = busy === id
            return (
              <View key={id}>
                {i > 0 && <Divider />}
                <View style={styles.acct}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={[styles.dot, { backgroundColor: PLATFORM[id].color }]} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <T kind="bodyStrong">{PLATFORM[id].name}</T>
                        {cfg.method === 'mcp' && <Badge label="Official" tone="good" />}
                      </View>
                      <T kind="small" numberOfLines={2}>
                        {status === 'connected'
                          ? acc?.label ? `Connected as ${acc.label}` : `${cfg.account} account · connected${acc?.via === 'web' && cfg.method === 'mcp' ? ' via website' : ''}`
                          : status === 'expired' ? 'Session expired · sign in again' : `${cfg.account} account`}
                      </T>
                    </View>
                    {status === 'connected' ? (
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        <Button small variant="secondary" label="Test" loading={isBusy} onPress={() => run(id, () => s.testConnection(id))} />
                        <Button small variant="secondary" label="Disconnect" disabled={isBusy} icon={<CheckCircle2 size={13} color={t.good} />} onPress={() => run(id, () => s.disconnect(id))} />
                      </View>
                    ) : (
                      <Button small label={status === 'expired' ? 'Reconnect' : 'Connect'} loading={isBusy} disabled={!IS_NATIVE || (busy !== null && !isBusy)} onPress={() => run(id, () => s.connect(id))} />
                    )}
                  </View>
                  {status === 'connected' && acc?.lastTest && (
                    <Text style={{ marginTop: 6, marginLeft: 20, color: acc.lastTest.ok ? t.good : t.accent, fontFamily: t.fonts.body, fontSize: 12 }}>
                      {acc.lastTest.ok ? '✓ ' : '! '}{acc.lastTest.detail}
                    </Text>
                  )}
                  {status !== 'connected' && cfg.note && <T kind="caption" style={{ marginTop: 6, marginLeft: 20 }}>{cfg.note}</T>}
                  {status !== 'connected' && cfg.webFallback && IS_NATIVE && (
                    <Pressable onPress={() => run(id, () => s.connect(id, { website: true }))} style={{ marginTop: 6, marginLeft: 20 }}>
                      <Text style={{ color: t.ink, fontFamily: t.fonts.bodyBold, fontSize: 12.5, textDecorationLine: 'underline' }}>Or sign in on Swiggy&apos;s website</Text>
                    </Pressable>
                  )}
                  {!!errors[id] && <T kind="small" style={{ color: t.accent, marginTop: 6, marginLeft: 20 }}>{errors[id]}</T>}
                </View>
              </View>
            )
          })}
        </Card>

        <View style={[styles.privacy, { backgroundColor: t.surface }]}>
          <ShieldCheck size={18} color={t.good} />
          <T kind="small" style={{ flex: 1, lineHeight: 18 }}>
            You type your number and OTP on each app&apos;s own page, never in Sasta. Sessions stay on this phone and are never sent to any server. Disconnect wipes them.
          </T>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  acct: { paddingHorizontal: 14, paddingVertical: 13 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  privacy: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: 18 },
})
