import type { Message, MessageStatus } from '../types.ts'

export type NotificationEvent =
  | { type: 'message'; chatId: string; recipient: string; message: Message }
  | { type: 'status'; chatId: string; messageId: string; status: MessageStatus }
  | { type: 'delivery-error'; chatId: string; message: string }
  | { type: 'instance-state'; state: string }

export class NotificationFormatError extends Error {
  constructor() {
    super('Не удалось разобрать текстовое уведомление. Получение остановлено, уведомление не удалено из очереди.')
    this.name = 'NotificationFormatError'
  }
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function string(value: unknown) {
  return typeof value === 'string' ? value : ''
}

export function parseNotification(body: Record<string, unknown>): NotificationEvent | null {
  if (body.typeWebhook === 'stateInstanceChanged') {
    return typeof body.stateInstance === 'string' ? { type: 'instance-state', state: body.stateInstance } : null
  }

  if (body.typeWebhook === 'outgoingMessageStatus') {
    const chatId = string(body.chatId)
    if (!/^[1-9]\d*$/.test(chatId)) return null
    const status = body.status === 'noAccount' ? 'failed' : body.status
    if (status !== 'delivered' && status !== 'read' && status !== 'failed') return null
    if (typeof body.idMessage === 'string' && body.idMessage) {
      return { type: 'status', chatId, messageId: body.idMessage, status }
    }
    // Без idMessage нельзя достоверно связать сбой с конкретным сообщением.
    return status === 'failed' ? {
      type: 'delivery-error', chatId,
      message: 'Telegram сообщил об ошибке доставки в этом чате без указания сообщения. Проверьте переписку в Telegram.',
    } : null
  }

  const incoming = body.typeWebhook === 'incomingMessageReceived'
  const outgoing = body.typeWebhook === 'outgoingMessageReceived' || body.typeWebhook === 'outgoingAPIMessageReceived'
  if (!incoming && !outgoing) return null
  const sender = object(body.senderData)
  const data = object(body.messageData)
  const chatId = string(sender.chatId)
  if (!chatId) throw new NotificationFormatError()
  if (!/^[1-9]\d*$/.test(chatId) || (sender.chatType && sender.chatType !== 'user')) return null

  let text: unknown
  if (data.typeMessage === 'textMessage') text = object(data.textMessageData).textMessage
  else if (data.typeMessage === 'extendedTextMessage') text = object(data.extendedTextMessageData).text
  else return null

  if (typeof text !== 'string' || !string(body.idMessage) || typeof body.timestamp !== 'number' || body.timestamp <= 0) {
    throw new NotificationFormatError()
  }
  const date = new Date(body.timestamp * 1000)
  if (!Number.isFinite(date.getTime())) throw new NotificationFormatError()

  const phone = incoming && typeof sender.senderPhoneNumber === 'number' && Number.isSafeInteger(sender.senderPhoneNumber)
    ? String(sender.senderPhoneNumber) : ''
  const name = string(sender.chatName) || (incoming ? string(sender.senderContactName) || string(sender.senderName) : '')
  const recipient = /^[1-9]\d{6,14}$/.test(phone) ? phone : name || `ID ${chatId}`
  return {
    type: 'message', chatId, recipient,
    message: {
      id: string(body.idMessage), text, createdAt: date.toISOString(),
      direction: incoming ? 'incoming' : 'outgoing',
    },
  }
}
