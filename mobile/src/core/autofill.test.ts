// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { autofillStep } from './adapters/autofill'
import { routeOtp, tenDigits } from './otp'

afterEach(() => { document.body.innerHTML = '' })

describe('autofillStep', () => {
  it('opens the login form on a home page once', () => {
    document.body.innerHTML = '<header><button id="l">Login</button></header>'
    const clicked = vi.fn(); document.getElementById('l')!.addEventListener('click', clicked)
    expect(autofillStep('9876543210', null, [])).toEqual({ step: 'login-opened' })
    expect(autofillStep('9876543210', null, ['opener'])).toEqual({ step: 'waiting' })
    expect(clicked).toHaveBeenCalledTimes(1)
  })

  it('types the number into a React-style phone field and asks for the OTP', () => {
    document.body.innerHTML = '<form><input type="tel" placeholder="Enter mobile number"><button id="c">Continue</button></form>'
    const input = document.querySelector('input')!
    const seen: string[] = []; input.addEventListener('input', () => seen.push(input.value))
    const clicked = vi.fn(); document.getElementById('c')!.addEventListener('click', clicked)
    expect(autofillStep('9876543210', null, [])).toEqual({ step: 'phone-filled' })
    expect(seen).toEqual(['9876543210'])
    expect(clicked).toHaveBeenCalledOnce()
  })

  it('never requests a second OTP', () => {
    document.body.innerHTML = '<input name="mobile"><button id="c">Get OTP</button>'
    const clicked = vi.fn(); document.getElementById('c')!.addEventListener('click', clicked)
    autofillStep('9876543210', null, [])
    expect(autofillStep('9876543210', null, ['phone'])).toEqual({ step: 'phone-filled' })
    expect(clicked).toHaveBeenCalledOnce()
  })

  it('finds Flipkart-style "Email/Mobile number" fields', () => {
    document.body.innerHTML = '<input type="text" placeholder="Enter Email/Mobile number"><button>Request OTP</button>'
    expect(autofillStep('9876543210', null, []).step).toBe('phone-filled')
    expect(document.querySelector('input')!.value).toBe('9876543210')
  })

  it('waits for the OTP, then types it into one field and submits', () => {
    document.body.innerHTML = '<input autocomplete="one-time-code" maxlength="6"><button id="v">Verify</button>'
    expect(autofillStep('9876543210', null, ['phone'])).toEqual({ step: 'waiting-otp' })
    const clicked = vi.fn(); document.getElementById('v')!.addEventListener('click', clicked)
    expect(autofillStep('9876543210', '482913', ['phone'])).toEqual({ step: 'otp-filled' })
    expect(document.querySelector('input')!.value).toBe('482913')
    expect(clicked).toHaveBeenCalledOnce()
  })

  it('splits the OTP across single-digit boxes', () => {
    document.body.innerHTML = '<div>' + '<input maxlength="1" inputmode="numeric">'.repeat(4) + '</div>'
    expect(autofillStep('9876543210', '4829', ['phone']).step).toBe('otp-filled')
    expect(Array.from(document.querySelectorAll('input')).map((i) => i.value).join('')).toBe('4829')
  })

  it('does not mistake a pincode field for the OTP, and stops at passwords', () => {
    document.body.innerHTML = '<input name="pincode" maxlength="6">'
    expect(autofillStep('9876543210', '482913', []).step).not.toBe('otp-filled')
    document.body.innerHTML = '<input type="email"><input type="password">'
    expect(autofillStep('9876543210', null, []).step).toBe('needs-you')
  })
})

describe('OTP routing', () => {
  it('routes by the app named in the message or its SMS sender ID', () => {
    const waiting = ['blinkit', 'instamart', 'zepto'] as const
    expect(routeOtp('JD-BLNKIT 4829 is your OTP', [...waiting])).toBe('blinkit')
    expect(routeOtp('Your Swiggy OTP is 482913', [...waiting])).toBe('instamart')
    expect(routeOtp('482913 is your Zepto login code', [...waiting])).toBe('zepto')
  })
  it('never guesses between several waiting apps', () => {
    expect(routeOtp('Your OTP is 4829', ['blinkit', 'zepto'])).toBeUndefined()
    expect(routeOtp('Your OTP is 4829', ['zepto'])).toBe('zepto')
    expect(routeOtp('Amazon OTP 482913', ['zepto'])).toBeUndefined()
  })
  it('accepts Indian numbers in any common format', () => {
    expect(tenDigits('+91 98765 43210')).toBe('9876543210')
    expect(tenDigits('098765-43210')).toBe('9876543210')
    expect(tenDigits('12345')).toBeNull()
  })
})
