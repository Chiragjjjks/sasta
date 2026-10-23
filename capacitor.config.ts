import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'app.sasta.android',
  appName: 'Sasta',
  webDir: 'dist',
  android: { backgroundColor: '#f0f1f6' },
  plugins: {
    // Native HTTP so live adapters (Phase 2) bypass browser CORS.
    CapacitorHttp: { enabled: true },
    // Shares the WebView cookie store with native HTTP, so platform sign-in sessions reach adapters.
    CapacitorCookies: { enabled: true },
    SystemBars: { insetsHandling: 'css' },
  },
}

export default config
