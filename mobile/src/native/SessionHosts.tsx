import { X } from 'lucide-react-native'
import { useCallback, useEffect, useRef, useState, type ComponentType, type RefAttributes } from 'react'
import { BackHandler, Linking, Modal, Platform, Pressable, StyleSheet, Text, ToastAndroid, useWindowDimensions, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { WebView as RNWebView, type WebViewMessageEvent, type WebViewProps } from 'react-native-webview'
import SastaNative from '../../modules/sasta-native'
import readerScripts from '@/core/adapters/readers.generated.json'
import { routeOtp } from '@/core/otp'
import { PLATFORM } from '@/core/platforms'
import type { Platform as Shop } from '@/core/types'
import { plural } from '@/core/utils'
import { PlatformMark } from '@/ui/PlatformMark'
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
  autoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16 },
})

/* ------------------------------------------------------------------ auto sign-in */

type AutoStatus = 'starting' | 'login-opened' | 'phone-filled' | 'waiting-otp' | 'otp-filled' | 'needs-you' | 'done'
interface AutoSession {
  id: number; platform: Shop; opts: SignInOptions; resolve: (r: SignInResult) => void
  status: AutoStatus; done: string[]; otp: string | null; detail?: string; settled?: boolean
}

const HOST_PLATFORM: [RegExp, Shop][] = [
  [/blinkit\.com/, 'blinkit'], [/swiggy\.com/, 'instamart'], [/zepto/, 'zepto'],
  [/bigbasket\.com/, 'bigbasket'], [/flipkart\.com/, 'flipkart_minutes'], [/amazon\.in/, 'amazon_now'],
]
const platformFor = (url: string): Shop => HOST_PLATFORM.find(([re]) => re.test(url))?.[1] ?? 'blinkit'

const AUTO_LABEL: Record<AutoStatus, string> = {
  'starting': 'Opening sign-in…',
  'login-opened': 'Opening sign-in…',
  'phone-filled': 'Number entered · waiting for OTP',
  'waiting-otp': 'Waiting for OTP',
  'otp-filled': 'OTP entered · signing in…',
  'needs-you': 'Needs you · tap to finish',
  'done': 'Signed in',
}

/**
 * Signs in to several apps at once on their own pages: types the number, requests the OTP, and types
 * each OTP that arrives in a notification into the app it belongs to. Every page stays one tap away,
 * so anything the script can't do (captcha, password) is finished by hand.
 */
export function AutoSignInHost() {
  const t = useTheme()
  const { width, height } = useWindowDimensions()
  const [sessions, setSessions] = useState<AutoSession[]>([])
  const [shown, setShown] = useState<number | null>(null)
  const phone = useRef('')
  const nextId = useRef(1)
  const views = useRef(new Map<number, WebViewHandle | null>())
  const list = useRef<AutoSession[]>([])
  useEffect(() => { list.current = sessions }, [sessions])

  const update = useCallback((id: number, patch: Partial<AutoSession>) => setSessions((all) => all.map((x) => (x.id === id ? { ...x, ...patch } : x))), [])
  const settle = useCallback((id: number, r: SignInResult) => {
    const s = list.current.find((x) => x.id === id)
    if (!s || s.settled) return
    SastaNative.flushCookies().catch(() => {})
    s.settled = true
    s.resolve(r)
    setSessions((all) => {
      const next = all.map((x) => (x.id === id ? { ...x, settled: true, status: r.kind === 'cancelled' ? x.status : 'done' as AutoStatus } : x))
      return next.every((x) => x.settled) ? [] : next
    })
  }, [])

  useEffect(() => {
    registerHosts({ autoSignIn: (opts, number) => new Promise<SignInResult>((resolve) => {
      phone.current = number
      const id = nextId.current++
      setSessions((all) => [...all, { id, platform: platformFor(opts.url), opts, resolve, status: 'starting', done: [], otp: null }])
    }) })
  }, [])

  // OTPs from notifications go to the app the message names (or the only app still waiting).
  useEffect(() => {
    if (Platform.OS !== 'android' || !sessions.length) return
    const sub = SastaNative.addListener('otp', (e) => {
      const waiting = list.current.filter((x) => !x.settled && ['phone-filled', 'waiting-otp'].includes(x.status) && !x.otp)
      const to = routeOtp(e.text, waiting.map((x) => x.platform))
      const s = waiting.find((x) => x.platform === to)
      if (s) update(s.id, { otp: e.code })
    })
    return () => sub.remove()
  }, [sessions.length, update])

  // Drive each page one step at a time, and watch for the signed-in signal each app gives.
  useEffect(() => {
    if (!sessions.length) return
    const timer = setInterval(async () => {
      for (const s of list.current) {
        if (s.settled || s.status === 'needs-you' && s.id === shown) continue
        const step = `(function(){try{var r=(${readerScripts.autofillStep})(${JSON.stringify(phone.current)},${JSON.stringify(s.otp)},${JSON.stringify(s.done)});window.ReactNativeWebView.postMessage(JSON.stringify({__auto:r}))}catch(e){}})();true;`
        const doneCheck = s.opts.doneScript ? `(function(){try{if(${s.opts.doneScript})window.ReactNativeWebView.postMessage('__sasta_signed_in__')}catch(e){}})();true;` : ''
        views.current.get(s.id)?.injectJavaScript(doneCheck + step)
        const { doneCookies, doneOrigins } = s.opts
        if (doneCookies?.length && doneOrigins?.length) {
          const names = await SastaNative.cookieNames(doneOrigins).catch(() => [] as string[])
          if (doneCookies.some((c) => names.includes(c))) settle(s.id, { kind: 'done' })
        }
      }
    }, 1500)
    return () => clearInterval(timer)
  }, [sessions.length, shown, settle])

  const onAutoMessage = (s: AutoSession, data: string) => {
    if (data === '__sasta_signed_in__') return settle(s.id, { kind: 'done' })
    let r: { step: AutoStatus | 'waiting'; detail?: string } | undefined
    try { r = JSON.parse(data).__auto } catch { return }
    if (!r) return
    const done = [...s.done]
    if (r.step === 'login-opened' && !done.includes('opener')) done.push('opener')
    if (r.step === 'phone-filled' && !done.includes('phone')) done.push('phone')
    if (r.step === 'otp-filled' && s.otp && !done.includes(`otp:${s.otp}`)) done.push(`otp:${s.otp}`)
    // Apps without a sign-in signal (BigBasket, Flipkart): the OTP form going away means it worked.
    if (r.step === 'waiting' && s.status === 'otp-filled' && !s.opts.doneScript && !s.opts.doneCookies?.length && !s.opts.interceptPrefix) {
      if (done.filter((d) => d === 'gone').length >= 2) return settle(s.id, { kind: 'done' })
      done.push('gone')
    }
    const status: AutoStatus = r.step === 'waiting' ? (s.status === 'starting' ? 'starting' : s.status) : r.step
    if (status !== s.status || done.length !== s.done.length || r.detail !== s.detail) update(s.id, { status, done, detail: r.detail })
  }

  const intercept = (s: AutoSession, url?: string) => {
    const prefix = s.opts.interceptPrefix
    if (prefix && url?.startsWith(prefix)) { settle(s.id, { kind: 'redirect', redirectUrl: url }); return true }
    return false
  }

  const open = sessions.filter((x) => !x.settled)
  const current = sessions.find((x) => x.id === shown && !x.settled)
  const cancelAll = () => list.current.forEach((x) => settle(x.id, { kind: 'cancelled' }))

  return (
    <Modal visible={sessions.length > 0} animationType="slide" onRequestClose={() => (current ? setShown(null) : cancelAll())} statusBarTranslucent>
      <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={['top', 'bottom']}>
        <View style={[styles.bar, { borderBottomColor: t.line }]}>
          <Pressable onPress={() => (current ? setShown(null) : cancelAll())} hitSlop={10} style={styles.barBtn} accessibilityLabel={current ? 'Back to all apps' : 'Cancel sign-in'}>
            <X size={22} color={t.ink} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: t.ink, fontFamily: t.fonts.display }]} numberOfLines={1}>
              {current ? `Sign in to ${PLATFORM[current.platform].name}` : `Connecting ${plural(open.length, 'app')}`}
            </Text>
            <Text style={[styles.hint, { color: t.muted, fontFamily: t.fonts.body }]} numberOfLines={2}>
              {current ? 'Finish here if the page needs you. Sasta fills the number and OTP.' : 'Sasta types your number and fills each OTP from your notifications.'}
            </Text>
          </View>
          {current && (
            <Pressable onPress={() => settle(current.id, { kind: 'done' })} style={[styles.doneBtn, { backgroundColor: t.ink }]}>
              <Text style={{ color: t.bg, fontFamily: t.fonts.bodyBold, fontSize: 13 }}>{"I'm signed in"}</Text>
            </Pressable>
          )}
        </View>
        {!current && (
          <View style={{ padding: 16, gap: 8 }}>
            {sessions.map((x) => (
              <Pressable key={x.id} onPress={() => !x.settled && setShown(x.id)} style={[styles.autoRow, { backgroundColor: t.surface }]} accessibilityRole="button">
                <PlatformMark platform={x.platform} size={28} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.ink, fontFamily: t.fonts.bodyBold, fontSize: 15 }}>{PLATFORM[x.platform].name}</Text>
                  <Text style={{ color: x.status === 'needs-you' ? t.accentText : x.settled ? t.good : t.muted, fontFamily: t.fonts.body, fontSize: 12.5 }} numberOfLines={2}>
                    {x.settled ? 'Signed in' : x.detail ? `${x.detail} · tap to finish` : AUTO_LABEL[x.status]}
                  </Text>
                </View>
                {!x.settled && <Text style={{ color: t.ink, fontFamily: t.fonts.bodySemi, fontSize: 12.5 }}>View</Text>}
              </Pressable>
            ))}
            <Text style={{ color: t.muted, fontFamily: t.fonts.body, fontSize: 12, textAlign: 'center', marginTop: 4 }}>
              Your number and OTPs go only to each app&apos;s own page on this phone.
            </Text>
          </View>
        )}
        <View style={{ flex: current ? 1 : 0, height: current ? undefined : 0 }}>
          {sessions.filter((x) => !x.settled).map((x) => (
            <View key={x.id} pointerEvents={x.id === shown ? 'auto' : 'none'}
              style={x.id === shown ? StyleSheet.absoluteFill : { position: 'absolute', top: 0, left: -width * 2, width, height: height * 0.8, opacity: 0 }}>
              <WebView
                ref={(v) => { views.current.set(x.id, v) }}
                source={{ uri: x.opts.url }}
                userAgent={browserUA}
                onShouldStartLoadWithRequest={(r: { url: string }) => !intercept(x, r.url) && !NON_WEB.test(r.url)}
                onNavigationStateChange={(st: { url?: string }) => { intercept(x, st.url) }}
                onError={(e: { nativeEvent: { url?: string } }) => { intercept(x, e.nativeEvent.url) }}
                onMessage={(e: WebViewMessageEvent) => onAutoMessage(x, e.nativeEvent.data)}
                thirdPartyCookiesEnabled
                domStorageEnabled
                geolocationEnabled={false}
                setSupportMultipleWindows={false}
                style={{ flex: 1 }}
              />
            </View>
          ))}
        </View>
      </SafeAreaView>
    </Modal>
  )
}
