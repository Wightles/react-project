export function formatRecipient(phone: string) {
  if (!/^\d+$/.test(phone)) return phone
  if (phone.length === 11 && phone.startsWith('7')) {
    return `+7 ${phone.slice(1, 4)} ${phone.slice(4, 7)}-${phone.slice(7, 9)}-${phone.slice(9)}`
  }
  return `+${phone}`
}

export function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, '')
  return digits.length === 11 && digits.startsWith('8') ? `7${digits.slice(1)}` : digits
}

export function normalizeRecipient(value: string): string | null {
  const trimmed = value.trim()
  if (trimmed.startsWith('@')) {
    return /^@[a-zA-Z][a-zA-Z0-9_]{0,31}$/.test(trimmed) ? trimmed.toLowerCase() : null
  }
  if (!/^\+?[\d\s()-]+$/.test(trimmed)) return null
  const phone = normalizePhone(trimmed)
  return /^[1-9]\d{6,14}$/.test(phone) ? phone : null
}

export function formatTime(value: string) {
  return new Date(value).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

export function formatDay(value: string) {
  const date = new Date(value)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (date.toDateString() === today.toDateString()) return 'Сегодня'
  if (date.toDateString() === yesterday.toDateString()) return 'Вчера'
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined })
}
