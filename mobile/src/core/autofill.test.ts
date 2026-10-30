// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { autofillStep } from './adapters/autofill'
import { tenDigits } from './otp'

afterEach(() => { document.body.innerHTML = '' })

describe('autofillStep', () => {
  it('opens the login form on a home page once', () => {
    document.body.innerHTML = '<header><button id="l">Login</button></header>'
    const clicked = vi.fn(); document.getElementById('l')!.addEventListener('click', clicked)
    expect(autofillStep('9876543210', [])).toEqual({ step: 'login-opened' })
    expect(autofillStep('9876543210', ['opener'])).toEqual({ step: 'waiting' })
    expect(clicked).toHaveBeenCalledTimes(1)
  })

  it('types the number into a React-style phone field and asks for the OTP', () => {
    document.body.innerHTML = '<form><input type="tel" placeholder="Enter mobile number"><button id="c">Continue</button></form>'
    const input = document.querySelector('input')!
    const seen: string[] = []; input.addEventListener('input', () => seen.push(input.value))
    const clicked = vi.fn(); document.getElementById('c')!.addEventListener('click', clicked)
    expect(autofillStep('9876543210', [])).toEqual({ step: 'phone-filled' })
    expect(seen).toEqual(['9876543210'])
    expect(clicked).toHaveBeenCalledOnce()
  })

  it('never requests a second OTP', () => {
    document.body.innerHTML = '<input name="mobile"><button id="c">Get OTP</button>'
    const clicked = vi.fn(); document.getElementById('c')!.addEventListener('click', clicked)
    autofillStep('9876543210', [])
    expect(autofillStep('9876543210', ['phone'])).toEqual({ step: 'phone-filled' })
    expect(clicked).toHaveBeenCalledOnce()
  })

  it('finds Flipkart-style "Email/Mobile number" fields', () => {
    document.body.innerHTML = '<input type="text" placeholder="Enter Email/Mobile number"><button>Request OTP</button>'
    expect(autofillStep('9876543210', []).step).toBe('phone-filled')
    expect(document.querySelector('input')!.value).toBe('9876543210')
  })

  it('leaves a manually entered OTP and its submit button to the user', () => {
    document.body.innerHTML = '<input autocomplete="one-time-code" maxlength="6" value="482913"><button id="v">Verify</button>'
    const clicked = vi.fn(); document.getElementById('v')!.addEventListener('click', clicked)
    expect(autofillStep('9876543210', ['phone'])).toEqual({ step: 'waiting-otp' })
    expect(document.querySelector('input')!.value).toBe('482913')
    expect(clicked).not.toHaveBeenCalled()
  })

  it('waits for the user to fill single-digit OTP boxes', () => {
    document.body.innerHTML = '<div>' + '<input maxlength="1" inputmode="numeric">'.repeat(4) + '</div>'
    expect(autofillStep('9876543210', ['phone']).step).toBe('waiting-otp')
    expect(Array.from(document.querySelectorAll('input')).map((i) => i.value)).toEqual(['', '', '', ''])
  })

  it('does not mistake a pincode field for the OTP, and stops at passwords', () => {
    document.body.innerHTML = '<input name="pincode" maxlength="6">'
    expect(autofillStep('9876543210', []).step).toBe('waiting')
    expect(document.querySelector('input')!.value).toBe('')
    document.body.innerHTML = '<input type="email"><input type="password">'
    expect(autofillStep('9876543210', []).step).toBe('needs-you')
  })
})

describe('phone number', () => {
  it('accepts Indian numbers in any common format', () => {
    expect(tenDigits('+91 98765 43210')).toBe('9876543210')
    expect(tenDigits('098765-43210')).toBe('9876543210')
    expect(tenDigits('12345')).toBeNull()
  })
})
