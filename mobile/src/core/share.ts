import { File, Paths } from 'expo-file-system'
import * as Sharing from 'expo-sharing'
import { Platform, Share } from 'react-native'

/** Shares plain text through Android's share sheet (WhatsApp etc.). */
export async function shareText(title: string, text: string): Promise<'shared' | 'copied'> {
  await Share.share({ title, message: text })
  return 'shared'
}

/** Writes a JSON backup to the cache and opens the share sheet so it can go to Drive, Files or a chat. */
export async function shareFile(name: string, contents: string): Promise<void> {
  if (Platform.OS === 'web') {
    await Share.share({ title: name, message: contents })
    return
  }
  const file = new File(Paths.cache, name)
  if (file.exists) file.delete()
  file.create()
  await file.write(contents)
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Save your Sasta lists' })
}
