import * as DocumentPicker from 'expo-document-picker'
import { File } from 'expo-file-system'

/** Lets the user pick a JSON backup and returns its text, or null if they cancelled. */
export async function pickJsonText(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain', '*/*'], copyToCacheDirectory: true })
  if (result.canceled) return null
  return new File(result.assets[0].uri).text()
}
