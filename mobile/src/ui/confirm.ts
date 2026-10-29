import { Alert, Platform } from 'react-native'

/** A yes/no question. The browser preview has no native alerts, so it uses the page's confirm. */
export function confirm(title: string, message: string, yes: string, no: string, onYes: () => void) {
  if (Platform.OS === 'web') {
    if ((globalThis as { confirm?: (m: string) => boolean }).confirm?.(`${title}\n\n${message}`)) onYes()
    return
  }
  Alert.alert(title, message, [{ text: no, style: 'cancel' }, { text: yes, onPress: onYes }])
}
