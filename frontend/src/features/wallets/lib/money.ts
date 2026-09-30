export function parseMinorUnits(value: string): string {
  const normalized = value.trim()
  if (!/^-?(0|[1-9][0-9]*)(\.[0-9]{1,2})?$/.test(normalized)) throw new Error('Enter a valid amount with up to two decimal places.')

  const negative = normalized.startsWith('-')
  const unsigned = negative ? normalized.slice(1) : normalized
  const [whole, fraction = ''] = unsigned.split('.')
  const minor = BigInt(`${whole}${fraction.padEnd(2, '0')}`)
  const signedMinor = negative ? -minor : minor
  if (signedMinor < -999999999999n || signedMinor > 999999999999n) throw new Error('The opening balance is too large.')

  return signedMinor.toString()
}

export function formatMinorUnits(value: string): string {
  const minor = BigInt(value)
  const sign = minor < 0n ? '-' : ''
  const absolute = minor < 0n ? -minor : minor
  const whole = (absolute / 100n).toLocaleString('en-US')
  const fraction = (absolute % 100n).toString().padStart(2, '0')

  return `${sign}₱${whole}.${fraction}`
}
