/** Normalises a phone number to the 10 digits every app's login form expects. */
export function tenDigits(input: string): string | null {
  const d = input.replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '')
  return /^[6-9]\d{9}$/.test(d) ? d : null
}
