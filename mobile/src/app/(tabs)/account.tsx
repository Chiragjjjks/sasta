import { router } from 'expo-router'
import { CheckCircle2, ChevronRight, MapPin, Palette, ShieldCheck } from 'lucide-react-native'
import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { canSearch, IS_NATIVE } from '@/core/adapters'
import { searchLabel } from '@/core/capabilities'
import { ACCOUNT_CONFIG } from '@/core/accounts'
import { PLATFORM, PLATFORMS } from '@/core/platforms'
import type { SwiggyAddress } from '@/core/adapters/instamart'
import type { Platform } from '@/core/types'
import { useStore } from '@/state/store'
import { Badge, Button, Card, Divider, Segmented, T } from '@/ui/kit'
import { setAppearance, useAppearance, useTheme } from '@/ui/theme'
import { PlatformMark } from '@/ui/PlatformMark'

export default function AccountScreen() {
  const t = useTheme()
  const s = useStore()
  const appearance = useAppearance()
  const [busy, setBusy] = useState<Platform | null>(null)
  const [all, setAll] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<Platform, string>>>({})
  const [addresses, setAddresses] = useState<SwiggyAddress[] | null>(null)
  const connected = PLATFORMS.filter((p) => s.accounts[p.id]?.status === 'connected').length

  async function run(p: Platform, fn: () => Promise<unknown>) {
    setBusy(p); setErrors((e) => ({ ...e, [p]: undefined }))
    try { await fn() } catch (e) { setErrors((x) => ({ ...x, [p]: (e as Error).message || 'Something went wrong' })) } finally { setBusy(null) }
  }

  /** MCP connections search at Sasta's own location (Zepto) or a saved Swiggy address (Instamart). */
  function deliveryArea(p: Platform) {
    const viaMcp = ACCOUNT_CONFIG[p].method === 'mcp' && s.accounts[p]?.via !== 'web' && s.accounts[p]?.status === 'connected'
    if (p === 'instamart' && viaMcp) {
      if (addresses) { setAddresses(null); return }
      return run(p, async () => setAddresses(await s.listInstamartAddresses()))
    }
    if (viaMcp || p === 'instamart') return router.push('/location')
    return run(p, () => s.setupProvider(p))
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

        <Card style={styles.locRow}>
          <Palette size={18} color={t.ink} />
          <T kind="bodyStrong" style={{ flex: 1 }}>Appearance</T>
          <Segmented value={appearance} onChange={setAppearance}
            options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
        </Card>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
          <T kind="h2" style={{ flex: 1 }}>Connected apps</T>
          <Badge label="Beta" tone="warn" />
        </View>
        <T kind="small" style={{ marginTop: -6 }}>
          {connected} of {PLATFORMS.length} sessions connected. Test search checks real products separately from login. Choose the same delivery area in every app.
        </T>
        {IS_NATIVE && connected < PLATFORMS.length && (
          <Button label={all ? 'Connecting one by one…' : connected ? `Connect the other ${PLATFORMS.length - connected}` : 'Connect all apps'} loading={all} disabled={busy !== null && !all} onPress={connectAll} />
        )}
        {!IS_NATIVE && <T kind="small" style={{ color: t.accentText }}>Signing in works in the Android app.</T>}

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
                    <PlatformMark platform={id} size={24} />
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
                      <T kind="caption">Search: {searchLabel(id, acc, s.statuses[id])}</T>
                      {id === 'instamart' && status === 'connected' && acc?.via !== 'web' && (
                        <T kind="caption" numberOfLines={1}>
                          {s.instamartAddress ? `Searches at: ${s.instamartAddress.tag}${s.instamartAddress.line ? ` · ${s.instamartAddress.line}` : ''}` : 'Searches at: your default Swiggy address'}
                        </T>
                      )}
                    </View>
                    {status === 'connected' ? (
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        <Button small variant="secondary" label="Disconnect" disabled={busy !== null} icon={<CheckCircle2 size={13} color={t.good} />} onPress={() => run(id, () => s.disconnect(id))} />
                      </View>
                    ) : (
                      <Button small label={status === 'expired' ? 'Reconnect' : 'Connect'} loading={isBusy} disabled={!IS_NATIVE || (busy !== null && !isBusy)} onPress={() => run(id, () => s.connect(id))} />
                    )}
                  </View>
                  {IS_NATIVE && (canSearch(id) || status === 'connected') && (
                    <View style={{ marginTop: 10, marginLeft: 20, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      <Button small variant="secondary" label={canSearch(id) ? 'Test search' : 'Check login'} loading={isBusy} disabled={busy !== null && !isBusy} onPress={() => run(id, () => s.testConnection(id))} />
                      {cfg.method === 'mcp' && status === 'connected' && <Button small variant="secondary" label={`Reconnect ${cfg.account}`} disabled={busy !== null} onPress={() => run(id, () => s.connect(id))} />}
                      {canSearch(id) && <Button small variant="secondary" label={id === 'instamart' && status === 'connected' && acc?.via !== 'web' ? 'Delivery address' : 'Delivery area'} disabled={busy !== null} onPress={() => deliveryArea(id)} />}
                    </View>
                  )}
                  {id === 'instamart' && addresses && (
                    <View style={{ marginTop: 8, marginLeft: 20, gap: 6 }}>
                      {addresses.length === 0 && <T kind="small">No saved addresses. Add one in the Swiggy app, then try again.</T>}
                      {addresses.map((a) => (
                        <Pressable key={a.id} onPress={() => { setAddresses(null); run(id, () => s.chooseInstamartAddress(a)) }}
                          style={[styles.address, { borderColor: s.instamartAddress?.id === a.id ? t.ink : t.line }]}>
                          <T kind="bodyStrong">{a.tag}{s.instamartAddress?.id === a.id ? ' ✓' : ''}</T>
                          <T kind="small" numberOfLines={2}>{a.line}</T>
                        </Pressable>
                      ))}
                    </View>
                  )}
                  {acc?.lastTest && (
                    <Text style={{ marginTop: 6, marginLeft: 20, color: acc.lastTest.ok ? t.good : t.accentText, fontFamily: t.fonts.body, fontSize: 12 }}>
                      {acc.lastTest.search ? (acc.lastTest.ok ? '✓ ' : '! ') + acc.lastTest.detail : canSearch(id) ? 'Previous check verified login only. Tap Test search to check prices.' : acc.lastTest.detail}
                    </Text>
                  )}
                  {status !== 'connected' && cfg.note && <T kind="caption" style={{ marginTop: 6, marginLeft: 20 }}>{cfg.note}</T>}
                  {status !== 'connected' && cfg.webFallback && IS_NATIVE && (
                    <Pressable onPress={() => run(id, () => s.connect(id, { website: true }))} style={{ marginTop: 6, marginLeft: 20 }}>
                      <Text style={{ color: t.ink, fontFamily: t.fonts.bodyBold, fontSize: 12.5, textDecorationLine: 'underline' }}>
                        {cfg.webFallback.enablesSearch ? `Use the ${cfg.account} website instead` : 'Website sign-in only (does not enable search)'}
                      </Text>
                    </Pressable>
                  )}
                  {!!errors[id] && <T kind="small" style={{ color: t.accentText, marginTop: 6, marginLeft: 20 }}>{errors[id]}</T>}
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
  address: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
})
