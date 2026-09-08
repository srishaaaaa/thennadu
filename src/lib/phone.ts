// Malaysian phone number validation (+60 format)
// Accepts: +60XXXXXXXXX, 60XXXXXXXXX, 01XXXXXXXX, 011XXXXXXXX
export function normalizePhone(input: string): string | null {
  if (!input) return null

  // Strip everything except digits
  const raw = input.replace(/\D/g, '')
  if (!raw) return null

  let digits = raw

  if (digits.startsWith('60') && digits.length >= 10 && digits.length <= 12) {
    // Already 60XXXXXXXXX — keep as-is
  } else if (digits.startsWith('0') && digits.length >= 9 && digits.length <= 11) {
    // 01XXXXXXXX or 011XXXXXXXX → prepend country code
    digits = '6' + digits
  } else {
    return null
  }

  // Malaysian mobiles: 601[0-9]XXXXXXX (10–12 digits total with 60)
  if (!/^60[0-9]{8,10}$/.test(digits)) return null

  return digits
}

export function isValidPhone(input: string): boolean {
  return normalizePhone(input) !== null
}

export function getSubscriberDigits(input: string): string | null {
  const normalized = normalizePhone(input)
  return normalized ? normalized.slice(2) : null
}

export function normalizePhoneForWhatsApp(input: string): string {
  if (!input) return ''
  const digits = input.replace(/\D/g, '')
  if (!digits) return ''

  if (digits.startsWith('60') && digits.length >= 10) {
    return digits
  }
  if (digits.startsWith('0') && digits.length >= 9) {
    return '6' + digits
  }
  return digits
}

export function toWhatsAppUrl(phone: string, text?: string): string {
  const normalized = normalizePhoneForWhatsApp(phone) || normalizePhone(phone)
  const queryParams: string[] = []

  if (normalized) {
    queryParams.push(`phone=${normalized}`)
  }
  if (text) {
    queryParams.push(`text=${encodeURIComponent(text)}`)
  }

  return `https://api.whatsapp.com/send${queryParams.length > 0 ? `?${queryParams.join('&')}` : ''}`
}
