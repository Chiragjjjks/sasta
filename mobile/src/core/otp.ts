import type { Platform } from './types'

/** How each app names itself in OTP messages, including Indian SMS sender IDs (e.g. JD-BLNKIT). */
const SENDERS: Record<Platform, RegExp> = {
  blinkit: /blinkit|blnkit|blinkt|grofers/i,
  instamart: /swiggy|swigy|instamart/i,
  zepto: /zepto|zeptonow|zepton/i,
  bigbasket: /big ?basket|bigbsk|bbasket|bbnow/i,
  flipkart_minutes: /flipkart|flpkrt|fkrt/i,
  amazon_now: /amazon|amzn/i,
}

/** Normalises a phone number to the 10 digits every app's login form expects. */
export function tenDigits(input: string): string | null {
  const d = input.replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '')
  return /^[6-9]\d{9}$/.test(d) ? d : null
}

/**
 * Which waiting app an OTP belongs to: the app the message names, or the only app still waiting.
 * Undefined when it can't be told apart, so a code is never typed into the wrong app.
 */
export function routeOtp(text: string, waiting: Platform[]): Platform | undefined {
  const named = (Object.keys(SENDERS) as Platform[]).filter((p) => SENDERS[p].test(text))
  const match = named.filter((p) => waiting.includes(p))
  if (match.length === 1) return match[0]
  if (!named.length && waiting.length === 1) return waiting[0]
  return undefined
}
