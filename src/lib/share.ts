import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

/** Shares plain text (WhatsApp etc.). Falls back to the clipboard in the browser preview. */
export async function shareText(title: string, text: string): Promise<'shared' | 'copied'> {
  if (Capacitor.isNativePlatform()) {
    await Share.share({ title, text, dialogTitle: title })
    return 'shared'
  }
  if (navigator.share) { await navigator.share({ title, text }); return 'shared' }
  await navigator.clipboard.writeText(text)
  return 'copied'
}

/** Saves a JSON backup and opens the share sheet so it can go to Drive, Files or a chat. */
export async function shareFile(name: string, contents: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const { uri } = await Filesystem.writeFile({ path: name, data: contents, directory: Directory.Cache, encoding: Encoding.UTF8 })
    await Share.share({ title: name, url: uri, dialogTitle: 'Save your Sasta lists' })
    return
  }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([contents], { type: 'application/json' }))
  a.download = name
  a.click()
  URL.revokeObjectURL(a.href)
}
