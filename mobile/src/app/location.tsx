import * as ExpoLocation from 'expo-location'
import { router } from 'expo-router'
import { Crosshair } from 'lucide-react-native'
import { useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useStore } from '@/state/store'
import { Button, T } from '@/ui/kit'
import { useTheme } from '@/ui/theme'

export default function LocationScreen() {
  const t = useTheme()
  const s = useStore()
  const [label, setLabel] = useState(s.location.label)
  const [pincode, setPincode] = useState(s.location.pincode)
  const [coords, setCoords] = useState<{ lat?: number; lng?: number; pincode?: string }>({ lat: s.location.lat, lng: s.location.lng, pincode: s.location.pincode })
  const [busy, setBusy] = useState<'gps' | 'save' | null>(null)
  const [msg, setMsg] = useState('')

  const valid = /^\d{6}$/.test(pincode) && label.trim().length > 0

  async function useGps() {
    setBusy('gps'); setMsg('')
    try {
      const perm = await ExpoLocation.requestForegroundPermissionsAsync()
      if (perm.status !== 'granted') { setMsg('Location permission is off. Turn it on in Settings, or type your pincode.'); return }
      const pos = await ExpoLocation.getCurrentPositionAsync({ accuracy: ExpoLocation.Accuracy.Balanced })
      const lat = +pos.coords.latitude.toFixed(5)
      const lng = +pos.coords.longitude.toFixed(5)
      const [place] = await ExpoLocation.reverseGeocodeAsync({ latitude: lat, longitude: lng }).catch(() => [])
      const pin = place?.postalCode?.replace(/\D/g, '').slice(0, 6) || pincode
      setCoords({ lat, lng, pincode: pin })
      setPincode(pin)
      setLabel(place?.district || place?.subregion || place?.city || place?.name || 'Current location')
    } catch {
      setMsg('Could not get your location. Try again, or type your pincode.')
    } finally { setBusy(null) }
  }

  async function save() {
    setBusy('save'); setMsg('')
    let { lat, lng } = coords
    // A typed pincode needs coordinates too: live apps price by exact location.
    if (coords.pincode !== pincode || lat === undefined) {
      const permission = await ExpoLocation.requestForegroundPermissionsAsync()
      if (permission.status !== 'granted') {
        setMsg('Location permission is needed to place this pincode on the map. Allow it in Settings, or keep your saved location.')
        setBusy(null)
        return
      }
      const found = await ExpoLocation.geocodeAsync(`${pincode}, India`).catch(() => [])
      if (found[0]) { lat = +found[0].latitude.toFixed(5); lng = +found[0].longitude.toFixed(5) }
      else { lat = undefined; lng = undefined }
    }
    s.setLocation({ label: label.trim(), pincode, lat, lng })
    setBusy(null)
    if (lat === undefined) { setMsg('Saved, but this pincode could not be placed on the map. Use your current location for live prices.'); return }
    router.back()
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={['bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
          <T kind="small">Every app prices and stocks per dark store, so results depend on this.</T>
          <Button variant="secondary" label="Use my current location" disabled={busy !== null} loading={busy === 'gps'} icon={busy !== 'gps' ? <Crosshair size={16} color={t.ink} /> : undefined} onPress={useGps} />
          {coords.lat !== undefined && <T kind="caption" style={{ textAlign: 'center' }}>Pinned at {coords.lat}, {coords.lng}</T>}
          <T kind="smallStrong" style={{ marginTop: 6 }}>Area</T>
          <TextInput value={label} onChangeText={setLabel} placeholder="e.g. Rajajinagar" placeholderTextColor={t.faint}
            style={[styles.input, { backgroundColor: t.surface, color: t.ink, fontFamily: t.fonts.body }]} />
          <T kind="smallStrong">Pincode</T>
          <TextInput value={pincode} onChangeText={(v) => setPincode(v.replace(/\D/g, '').slice(0, 6))} placeholder="6 digits" placeholderTextColor={t.faint}
            keyboardType="number-pad" maxLength={6} style={[styles.input, { backgroundColor: t.surface, color: t.ink, fontFamily: t.fonts.body }]} />
          {!!msg && <T kind="small" style={{ color: t.accentText }}>{msg}</T>}
        </ScrollView>
        <View style={{ padding: 16 }}>
          <Button label="Save location" disabled={!valid || busy !== null} loading={busy === 'save'} onPress={save} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  input: { height: 52, borderRadius: 14, paddingHorizontal: 14, fontSize: 16 },
})
