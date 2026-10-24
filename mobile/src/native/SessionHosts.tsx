import { X } from 'lucide-react-native'
import { useCallback, useEffect, useRef, useState, type ComponentType, type RefAttributes } from 'react'
import { BackHandler, Linking, Modal, Platform, Pressable, StyleSheet, Text, ToastAndroid, useWindowDimensions, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { WebView as RNWebView, type WebViewMessageEvent, type WebViewProps } from 'react-native-webview'
import SastaNative from '../../modules/sasta-native'
import { useTheme } from '@/ui/theme'
import { registerHosts, markHostsReady, type PageResult, type SignInOptions, type SignInResult } from './platformSession'

// The package's class declaration conflicts with React 19; retain its prop and ref contracts.
interface WebViewHandle { injectJavaScript(script: string): void; goBack(): void }
const WebView = RNWebView as unknown as ComponentType<WebViewProps & RefAttributes<WebViewHandle>>

/** Mobile Chrome user agent from this phone's WebView, without the "; wv" marker some sites refuse. */
let browserUA: string | undefined
const uaWaiters: ((ua: string) => void)[] = []
function setUA(ua: string) {
  browserUA = ua.replace('; wv', '').replace(/ Version\/\d+\.\d+/, '')
  uaWaiters.splice(0).forEach((w) => w(browserUA!))
}

/* ------------------------------------------------------------------ hidden pages */

interface Page { origin: string; path: string; key: number }
interface Pending { origin: string; resolve: (r: PageResult) => void; timer: ReturnType<typeof setTimeout> }

/**
 * One invisible WebView per shopping site. Scripts run inside the site's own page, so requests
 * look like real Chrome (passing TLS-fingerprint bot checks) and carry the signed-in session.
 * API adapters use a tiny same-site file; storefront readers load the real search page.
 */
export function HiddenPages() {
  const viewport = useWindowDimensions()
  const [pages, setPages] = useState<Page[]>([])
  const refs = useRef(new Map<string, WebViewHandle | null>())
  const loaded = useRef(new Map<string, boolean>())
  const failed = useRef(new Set<string>())
  const pageKeys = useRef(new Map<string, number>())
  const nextPageKey = useRef(0)
  const queues = useRef(new Map<string, (() => void)[]>())
  const pending = useRef(new Map<string, Pending>())
  const [ua, setUa] = useState(browserUA)

  useEffect(() => { if (!ua) uaWaiters.push(setUa) }, [ua])

  const flush = (origin: string) => {
    const q = queues.current.get(origin) ?? []
    queues.current.set(origin, [])
    q.forEach((job) => job())
  }

  const ensure = useCallback((origin: string, path: string) => {
    const retry = failed.current.delete(origin)
    if (pageKeys.current.has(origin) && !retry) return
    const key = ++nextPageKey.current
    pageKeys.current.set(origin, key)
    setPages((ps) => [...ps.filter((p) => p.origin !== origin), { origin, path, key }])
  }, [])

  const failPage = (origin: string, error: string) => {
    loaded.current.delete(origin)
    failed.current.add(origin)
    queues.current.delete(origin)
    for (const [id, job] of pending.current) {
      if (job.origin !== origin) continue
      clearTimeout(job.timer)
      pending.current.delete(id)
      job.resolve({ ok: false, error })
    }
  }

  useEffect(() => {
    registerHosts({ pageRun: ({ origin, script, timeoutMs = 12000, path = '/robots.txt' }) =>
      new Promise<PageResult>((resolve) => {
        const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`
        const timer = setTimeout(() => { pending.current.delete(id); resolve({ ok: false, error: 'Timed out' }) }, timeoutMs)
        pending.current.set(id, { origin, resolve, timer })
        const job = () => {
          if (!pending.current.has(id)) return
          const js = `(async()=>{try{const v=await (async()=>{${script}})();window.ReactNativeWebView.postMessage(JSON.stringify({id:${JSON.stringify(id)},ok:true,value:v}))}catch(e){window.ReactNativeWebView.postMessage(JSON.stringify({id:${JSON.stringify(id)},ok:false,error:String((e&&e.message)||e)}))}})();true;`
          refs.current.get(origin)?.injectJavaScript(js)
        }
        if (loaded.current.get(origin)) job()
        else {
          queues.current.set(origin, [...(queues.current.get(origin) ?? []), job])
          ensure(origin, path)
        }
      }),
    pageReset: (origin) => {
      failPage(origin, 'Page reset')
      pageKeys.current.delete(origin)
      setPages((ps) => ps.filter((p) => p.origin !== origin))
    } })
    markHostsReady()
  }, [ensure])

  const onMessage = (e: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data) as PageResult & { id: string }
      const p = pending.current.get(msg.id)
      if (!p) return
      clearTimeout(p.timer)
      pending.current.delete(msg.id)
      p.resolve({ ok: msg.ok, value: msg.value, error: msg.error })
    } catch { /* not ours */ }
  }

  if (Platform.OS === 'web') return null
  return (
    <View pointerEvents="none" style={styles.hidden}>
      {!ua && (
        <WebView
          source={{ html: '<script>window.ReactNativeWebView.postMessage(navigator.userAgent)</script>' }}
          onMessage={(e: WebViewMessageEvent) => setUA(e.nativeEvent.data)}
          style={{ width: viewport.width, height: viewport.height }}
        />
      )}
      {ua && pages.map((p) => (
        <WebView
          key={`${p.origin}:${p.key}`}
          ref={(r: WebViewHandle) => { refs.current.set(p.origin, r) }}
          source={{ uri: p.origin + p.path }}
          userAgent={ua}
          onLoadEnd={() => { if (pageKeys.current.get(p.origin) === p.key && !failed.current.has(p.origin)) { loaded.current.set(p.origin, true); flush(p.origin) } }}
          onError={(e) => { if (pageKeys.current.get(p.origin) === p.key) failPage(p.origin, e.nativeEvent.description || 'Could not load shopping site') }}
          onHttpError={(e) => { if (pageKeys.current.get(p.origin) === p.key) failPage(p.origin, `Shopping site returned HTTP ${e.nativeEvent.statusCode}`) }}
          onMessage={onMessage}
          thirdPartyCookiesEnabled
          domStorageEnabled
          geolocationEnabled={false}
          injectedJavaScriptBeforeContentLoaded="try{if(navigator.geolocation){navigator.geolocation.getCurrentPosition=function(_,e){if(e)e({code:1,message:'denied'});};navigator.geolocation.watchPosition=function(_,e){if(e)e({code:1,message:'denied'});return 0;};}}catch(e){};true;"
          style={{ width: viewport.width, height: viewport.height }}
        />
      ))}
    </View>
  )
}

/* ------------------------------------------------------------------ sign-in screen */

interface Request { opts: SignInOptions; resolve: (r: SignInResult) => void }

const NON_WEB = /^(?!https?:|about:|data:|blob:|javascript:)[a-z][a-z0-9+.-]*:/i

export function SignInHost() {
  const t = useTheme()
  const [req, setReq] = useState<Request | null>(null)
  const [signedIn, setSignedIn] = useState(false)
  const web = useRef<WebViewHandle>(null)
  const canGoBack = useRef(false)
  const finished = useRef(false)
  const returnTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    registerHosts({ signIn: (opts) => new Promise<SignInResult>((resolve) => {
      finished.current = false
      canGoBack.current = false
      setSignedIn(false)
      setReq({ opts, resolve })
    }) })
  }, [])

  const finish = useCallback((r: SignInResult) => {
    if (finished.current || !req) return
    finished.current = true
    if (returnTimer.current) clearTimeout(returnTimer.current)
    SastaNative.flushCookies().catch(() => {})
    req.resolve(r)
    setReq(null)
  }, [req])

  const announceSignedIn = useCallback(() => {
    if (signedIn || finished.current) return
    setSignedIn(true)
    if (Platform.OS === 'android') ToastAndroid.show('Signed in · returning to Sasta', ToastAndroid.SHORT)
    returnTimer.current = setTimeout(() => finish({ kind: 'done' }), 1200)
  }, [finish, signedIn])

  // Watch for sign-in: the site's own storage (doneScript) and its session cookies.
  useEffect(() => {
    if (!req) return
    const { doneScript, doneCookies, doneOrigins } = req.opts
    if (!doneScript && !(doneCookies?.length && doneOrigins?.length)) return
    const timer = setInterval(async () => {
      if (doneScript) web.current?.injectJavaScript(`(function(){try{if(${doneScript})window.ReactNativeWebView.postMessage('__sasta_signed_in__')}catch(e){}})();true;`)
      if (doneCookies?.length && doneOrigins?.length) {
        const names = await SastaNative.cookieNames(doneOrigins).catch(() => [] as string[])
        if (doneCookies.some((c) => names.includes(c))) announceSignedIn()
      }
    }, 1000)
    return () => clearInterval(timer)
  }, [req, announceSignedIn])

  // Hardware back: go back inside the site first, then cancel.
  useEffect(() => {
    if (!req) return
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBack.current) web.current?.goBack()
      else finish({ kind: 'cancelled' })
      return true
    })
    return () => sub.remove()
  }, [req, finish])

  const shouldStart = (url: string) => {
    const prefix = req?.opts.interceptPrefix
    if (prefix && url.startsWith(prefix)) { finish({ kind: 'redirect', redirectUrl: url }); return false }
    if (NON_WEB.test(url)) {
      // Payment and app links (upi:, intent:, tel:, …) open the matching app.
      const target = url.startsWith('intent:') ? (url.match(/S\.browser_fallback_url=([^;]+)/)?.[1] ? decodeURIComponent(url.match(/S\.browser_fallback_url=([^;]+)/)![1]) : url) : url
      Linking.openURL(target).catch(() => { if (Platform.OS === 'android') ToastAndroid.show('No app found to open this', ToastAndroid.SHORT) })
      return false
    }
    return true
  }

  return (
    <Modal visible={!!req} animationType="slide" onRequestClose={() => {
      if (canGoBack.current) web.current?.goBack()
      else finish({ kind: 'cancelled' })
    }} statusBarTranslucent>
      <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={['top', 'bottom']}>
        <View style={[styles.bar, { borderBottomColor: t.line }]}>
          <Pressable onPress={() => finish({ kind: 'cancelled' })} hitSlop={10} style={styles.barBtn} accessibilityLabel="Cancel sign-in">
            <X size={22} color={t.ink} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: t.ink, fontFamily: t.fonts.display }]} numberOfLines={1}>{req?.opts.title ?? 'Sign in'}</Text>
            <Text style={[styles.hint, { color: t.muted, fontFamily: t.fonts.body }]} numberOfLines={2}>
              {signedIn ? 'Signed in. Returning to Sasta…' : req?.opts.hint ?? (req?.opts.interceptPrefix
                ? "Sign in on Swiggy's page. Sasta never sees your number or OTP."
                : 'Tap Login on this page and enter your number and OTP. Sasta never sees them.')}
            </Text>
          </View>
          {!req?.opts.interceptPrefix && (
            <Pressable onPress={() => finish({ kind: 'done' })} style={[styles.doneBtn, { backgroundColor: t.ink }]}>
              <Text style={{ color: t.bg, fontFamily: t.fonts.bodyBold, fontSize: 13 }}>{req?.opts.doneLabel ?? "I'm signed in"}</Text>
            </Pressable>
          )}
        </View>
        {req && (
          <WebView
            ref={web}
            source={{ uri: req.opts.url }}
            userAgent={browserUA}
            onShouldStartLoadWithRequest={(r: { url: string }) => shouldStart(r.url)}
            onNavigationStateChange={(s: { url?: string; canGoBack: boolean }) => {
              canGoBack.current = s.canGoBack
              const prefix = req.opts.interceptPrefix
              if (prefix && s.url?.startsWith(prefix)) finish({ kind: 'redirect', redirectUrl: s.url })
            }}
            onError={(e: { nativeEvent: { url?: string } }) => {
              const prefix = req.opts.interceptPrefix
              if (prefix && e.nativeEvent.url?.startsWith(prefix)) finish({ kind: 'redirect', redirectUrl: e.nativeEvent.url })
            }}
            onMessage={(e: WebViewMessageEvent) => { if (e.nativeEvent.data === '__sasta_signed_in__') announceSignedIn() }}
            thirdPartyCookiesEnabled
            domStorageEnabled
            geolocationEnabled={false}
            setSupportMultipleWindows={false}
            startInLoadingState
            style={{ flex: 1 }}
          />
        )}
      </SafeAreaView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  hidden: { position: 'absolute', top: -9999, left: -9999, width: 1, height: 1, opacity: 0 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1 },
  barBtn: { padding: 4 },
  title: { fontSize: 16 },
  hint: { fontSize: 12, marginTop: 2 },
  doneBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
})
