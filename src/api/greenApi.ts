import type { ConnectionSettings } from '../types.ts'
import { MESSAGE_MAX_LENGTH } from '../constants.ts'
import { normalizeRecipient } from '../utils/format.ts'

export class GreenApiError extends Error {
  readonly uncertain: boolean

  constructor(message: string, uncertain = false) {
    super(message)
    this.name = 'GreenApiError'
    this.uncertain = uncertain
  }
}

export function validateSettings(values: ConnectionSettings): ConnectionSettings {
  let url: URL
  try {
    url = new URL(values.apiUrl.trim())
  } catch {
    throw new GreenApiError('Введите apiUrl из личного кабинета GREEN-API.')
  }

  if (
    url.protocol !== 'https:' || url.port || url.username || url.password ||
    url.search || url.hash || url.pathname !== '/' ||
    !url.hostname.endsWith('.green-api.com')
  ) {
    throw new GreenApiError('Укажите HTTPS-адрес сервера GREEN-API без пути и параметров.')
  }

  const idInstance = values.idInstance.trim()
  const apiTokenInstance = values.apiTokenInstance.trim()
  if (!/^\d+$/.test(idInstance) || !/^[a-zA-Z0-9_-]+$/.test(apiTokenInstance)) {
    throw new GreenApiError('Проверьте idInstance и apiTokenInstance.')
  }

  return { apiUrl: url.origin, idInstance, apiTokenInstance }
}

function httpError(status: number) {
  const descriptions: Record<number, string> = {
    400: 'GREEN-API отклонил запрос. Проверьте номер получателя и текст сообщения.',
    401: 'Неверные данные подключения. Проверьте ID инстанса и токен.',
    403: 'Доступ запрещён. Проверьте токен, тариф и ограничения аккаунта Telegram.',
    404: 'Инстанс не найден. Проверьте apiUrl и idInstance.',
    429: 'Слишком много запросов. Подождите и повторите попытку.',
    466: 'Превышены ограничения тарифа GREEN-API. Проверьте личный кабинет.',
    469: 'Telegram ограничил поиск получателей. Повторите попытку позже.',
  }
  return new GreenApiError(
    descriptions[status] ?? (status >= 500
      ? 'Сервис GREEN-API временно недоступен.'
      : `GREEN-API вернул ошибку HTTP ${status}.`),
    status >= 500 || status === 408,
  )
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function request(
  settings: ConnectionSettings,
  method: string,
  signal?: AbortSignal,
  body?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { apiUrl, idInstance, apiTokenInstance } = validateSettings(settings)
  const timeout = AbortSignal.timeout(20_000)
  const combinedSignal = signal ? AbortSignal.any([signal, timeout]) : timeout
  const url = `${apiUrl}/waInstance${idInstance}/${method}/${encodeURIComponent(apiTokenInstance)}`

  try {
    const response = await fetch(url, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: combinedSignal,
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
    })
    if (!response.ok) throw httpError(response.status)

    let data: unknown
    try {
      data = await response.json()
    } catch {
      throw new GreenApiError('GREEN-API вернул некорректный ответ.', true)
    }
    combinedSignal.throwIfAborted()
    if (!isObject(data)) throw new GreenApiError('GREEN-API вернул некорректный ответ.', true)
    return data
  } catch (error) {
    if (signal?.aborted) throw new DOMException('Запрос отменён', 'AbortError')
    if (timeout.aborted) throw new GreenApiError('Сервер не ответил за 20 секунд.', true)
    if (error instanceof GreenApiError) throw error
    // Не выводим исходный текст ошибки: он может содержать URL с токеном.
    throw new GreenApiError('Не удалось связаться с GREEN-API. Проверьте интернет и apiUrl.', true)
  }
}

export async function checkConnection(settings: ConnectionSettings, signal?: AbortSignal) {
  const data = await request(settings, 'getStateInstance', signal)
  if (data.stateInstance === 'authorized') return

  const states: Record<string, string> = {
    notAuthorized: 'Авторизуйте инстанс Telegram в личном кабинете GREEN-API.',
    starting: 'Инстанс запускается. Подождите несколько минут и подключитесь снова.',
    blocked: 'Аккаунт Telegram заблокирован. Проверьте его в личном кабинете.',
    suspended: 'На аккаунте Telegram действуют ограничения. Проверьте личный кабинет.',
    pendingPassword: 'Завершите двухфакторную авторизацию в личном кабинете GREEN-API.',
  }
  throw new GreenApiError(states[String(data.stateInstance)] ?? 'Не удалось подтвердить авторизацию инстанса Telegram.')
}

export async function resolveChat(settings: ConnectionSettings, recipient: string, signal?: AbortSignal) {
  const normalized = normalizeRecipient(recipient)
  if (!normalized) {
    throw new GreenApiError('Введите международный номер или @username получателя.')
  }
  const body = normalized.startsWith('@')
    ? { username: normalized }
    : { phoneNumber: Number(normalized) }
  const data = await request(settings, 'checkAccount', signal, body)
  if (data.status === false) {
    const details = isObject(data.data) ? data.data : null
    const rateLimited = details?.reason === 'rate_limit_exceeded' || data.reason === 'Rate limited by messenger'
    throw new GreenApiError(rateLimited
      ? 'Telegram ограничил поиск получателей. Повторите попытку позже.'
      : 'Не удалось проверить получателя. Проверьте авторизацию инстанса и повторите попытку.')
  }
  if (data.exist === false) {
    throw new GreenApiError('Telegram не нашёл аккаунт или номер скрыт настройками приватности. Проверьте данные или укажите @username.')
  }
  if (data.exist !== true || typeof data.chatId !== 'string' || !/^[1-9]\d*$/.test(data.chatId)) {
    throw new GreenApiError('GREEN-API не вернул идентификатор личного чата. Группы и каналы не поддерживаются.')
  }
  return data.chatId
}

export async function sendText(
  settings: ConnectionSettings,
  chatId: string,
  message: string,
  signal?: AbortSignal,
) {
  if (!message.trim() || message.length > MESSAGE_MAX_LENGTH) {
    throw new GreenApiError(`Сообщение должно содержать от 1 до ${MESSAGE_MAX_LENGTH} символов.`)
  }
  const data = await request(settings, 'sendMessage', signal, { chatId, message })
  if (typeof data.idMessage !== 'string' || !data.idMessage.trim()) {
    throw new GreenApiError('GREEN-API не подтвердил приём сообщения.', true)
  }
  return data.idMessage
}

export function errorMessage(error: unknown) {
  return error instanceof GreenApiError ? error.message : 'Не удалось выполнить запрос. Повторите попытку.'
}
