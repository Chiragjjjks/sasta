// Release signing and version numbers for CI builds, applied at `expo prebuild` time
// (the android/ folder is generated, never edited by hand).
//  - VERSION_CODE env: Android versionCode (CI passes a number above every older release)
//  - ANDROID_KEYSTORE_PATH / ANDROID_STORE_PASSWORD / ANDROID_KEY_ALIAS / ANDROID_KEY_PASSWORD: private key
//  - otherwise the committed PUBLIC key in credentials/ signs, so sideloaded updates install over each other
const { withAppBuildGradle } = require('expo/config-plugins')

const SIGNING = `
    signingConfigs {
        sastaRelease {
            def privateKeystore = System.getenv('ANDROID_KEYSTORE_PATH')
            if (privateKeystore) {
                storeFile file(privateKeystore)
                storePassword System.getenv('ANDROID_STORE_PASSWORD')
                keyAlias System.getenv('ANDROID_KEY_ALIAS')
                keyPassword System.getenv('ANDROID_KEY_PASSWORD')
            } else {
                storeFile file('../../credentials/sasta-public-debug.keystore')
                storePassword 'sasta-public'
                keyAlias 'sasta'
                keyPassword 'sasta-public'
            }
        }
    }
`

module.exports = function withSastaAndroid(config) {
  return withAppBuildGradle(config, (cfg) => {
    let g = cfg.modResults.contents
    if (!g.includes('sastaRelease')) {
      g = g.replace(/android\s*\{/, (m) => `${m}\n${SIGNING}`)
      // Release builds sign with sastaRelease instead of the debug key Expo uses by default.
      g = g.replace(/(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig\s+signingConfigs\.debug/, '$1signingConfig signingConfigs.sastaRelease')
      g = g.replace(/versionCode\s+\d+/, "versionCode((System.getenv('VERSION_CODE') ?: '600').toInteger())")
    }
    cfg.modResults.contents = g
    return cfg
  })
}
