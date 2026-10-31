import { describe, expect, it } from 'vitest'
import { amazonNowReadScript } from './amazon-now'
import { bigbasketReadScript } from './bigbasket'
import { flipkartReadScript } from './flipkart'
import readerScripts from './readers.generated.json'
import { zeptoReadScript } from './zepto'

const loc = { pincode: '560010', label: 'Rajajinagar', lat: 12.9915, lng: 77.5544 }
// The same wrapper the hidden WebView injects (native/SessionHosts.tsx).
const injected = (script: string) => `(async()=>{try{const v=await (async()=>{${script}})();window.ReactNativeWebView.postMessage(JSON.stringify({id:"1",ok:true,value:v}))}catch(e){}})();true;`

describe('generated reader scripts', () => {
  it.each([
    ['zepto', zeptoReadScript('amul butter', loc)],
    ['bigbasket', bigbasketReadScript('amul butter', loc)],
    ['flipkart', flipkartReadScript('amul butter', loc)],
    ['amazon now', amazonNowReadScript('amul butter', loc)],
    ['autofill', `(function(){try{var r=(${readerScripts.autofillStep})("9999999999",[]);}catch(e){}})();true;`],
  ])('%s parses as the page will run it', (_name, script) => {
    // A syntax error here means the page never answers and the app shows "timed out".
    expect(() => new Function(injected(script))).not.toThrow()
  })

  it('each reader is a bare function expression', () => {
    for (const text of Object.values(readerScripts)) expect(text).toMatch(/^(async )?function \w+\(/)
  })
})
