import AsyncStorage from '@react-native-async-storage/async-storage'
import { Platform } from 'react-native'
import SastaNative from '../../modules/sasta-native'

/** Same shape as Capacitor Preferences, so the shared core code is unchanged. Non-secret data only. */
export const Preferences = {
  async get({ key }: { key: string }): Promise<{ value: string | null }> {
    let value = await AsyncStorage.getItem(key)
    if (value === null && Platform.OS === 'android') {
      value = await SastaNative.legacyPreference(key)
      if (value !== null) {
        await AsyncStorage.setItem(key, value)
        await SastaNative.removeLegacyPreference(key)
      }
    }
    return { value }
  },
  async set({ key, value }: { key: string; value: string }): Promise<void> {
    await AsyncStorage.setItem(key, value)
  },
  async remove({ key }: { key: string }): Promise<void> {
    await AsyncStorage.removeItem(key)
    if (Platform.OS === 'android') await SastaNative.removeLegacyPreference(key)
  },
}
