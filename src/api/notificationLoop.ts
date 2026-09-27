import type { ConnectionSettings } from '../types.ts'
import { checkReceivingSettings, deleteNotification, errorMessage, GreenApiError, receiveNotification } from './greenApi.ts'
import { NotificationFormatError, parseNotification } from './notifications.ts'
import type { NotificationEvent } from './notifications.ts'

export interface ReceivingState {
  status: 'checking' | 'running' | 'retrying' | 'paused'
  message: string
}

export function waitForPoll(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    if (signal.aborted) { resolve(); return }
    const finish = () => { clearTimeout(timer); signal.removeEventListener('abort', finish); resolve() }
    const timer = setTimeout(finish, milliseconds)
    signal.addEventListener('abort', finish, { once: true })
  })
}

export async function runNotificationLoop(
  settings: ConnectionSettings,
  signal: AbortSignal,
  onEvent: (event: NotificationEvent) => void,
  onState: (state: ReceivingState) => void,
  wait = waitForPoll,
) {
  let verified = false
  let failures = 0
  let pending: { receiptId: number; event: NotificationEvent | null } | null = null
  onState({ status: 'checking', message: 'Проверка получения сообщений…' })

  while (!signal.aborted) {
    try {
      if (!verified) {
        await checkReceivingSettings(settings, signal)
        if (signal.aborted) return
        verified = true
      }
      if (!pending) {
        const notification = await receiveNotification(settings, signal)
        if (signal.aborted) return
        if (notification) {
          const event = parseNotification(notification.body)
          if (event) onEvent(event)
          pending = { receiptId: notification.receiptId, event }
        }
      }
      if (signal.aborted) return
      if (pending) {
        await deleteNotification(settings, pending.receiptId, signal)
        if (signal.aborted) return
        const event = pending.event
        pending = null
        if (event?.type === 'instance-state' && event.state !== 'authorized') {
          onState({ status: 'paused', message: 'Инстанс Telegram больше не авторизован или ограничен. Проверьте его в GREEN-API.' })
          return
        }
      }
      failures = 0
      onState({ status: 'running', message: 'Сообщения обновляются автоматически.' })
      // Long polling ждёт до 5 секунд; небольшая пауза защищает от быстрых пустых ответов.
      await wait(250, signal)
    } catch (error) {
      if (signal.aborted) return
      const permanent = error instanceof NotificationFormatError || (error instanceof GreenApiError && [400, 401, 403, 404, 466].includes(error.status ?? 0))
      const message = error instanceof NotificationFormatError ? error.message : errorMessage(error)
      if (permanent) {
        onState({ status: 'paused', message })
        return
      }
      const delay = Math.min(1000 * 2 ** Math.min(failures++, 5), 30_000)
      onState({ status: 'retrying', message: `${message} Повтор через ${delay / 1000} с.` })
      await wait(delay, signal)
    }
  }
}
