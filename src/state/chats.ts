import type { Chat, MessageStatus } from '../types.ts'
import type { NotificationEvent } from '../api/notifications.ts'

export interface ChatsState {
  chats: Chat[]
  pendingStatuses: Record<string, MessageStatus>
}

export const initialChatsState: ChatsState = { chats: [], pendingStatuses: {} }
export type ChatsAction = NotificationEvent | { type: 'reset' } | { type: 'create'; chatId: string; recipient: string }

const statusRank: Record<MessageStatus, number> = { queued: 0, failed: 1, delivered: 2, read: 3 }
function mergeStatus(current?: MessageStatus, next?: MessageStatus) {
  if (!current) return next
  if (!next) return current
  return statusRank[next] > statusRank[current] ? next : current
}

export function chatsReducer(state: ChatsState, action: ChatsAction): ChatsState {
  if (action.type === 'reset') return initialChatsState
  if (action.type === 'instance-state') return state
  const existing = state.chats.find(chat => chat.id === action.chatId)

  if (action.type === 'create') {
    return {
      ...state,
      chats: existing
        ? state.chats.map(chat => chat.id === action.chatId ? { ...chat, recipient: action.recipient } : chat)
        : [{ id: action.chatId, recipient: action.recipient, messages: [] }, ...state.chats],
    }
  }
  if (action.type === 'delivery-error') {
    return { ...state, chats: state.chats.map(chat => chat.id === action.chatId ? { ...chat, deliveryError: action.message } : chat) }
  }
  if (action.type === 'status') {
    const message = existing?.messages.find(item => item.id === action.messageId && item.direction === 'outgoing')
    if (!message) {
      const key = `${action.chatId}:${action.messageId}`
      const statuses = { ...state.pendingStatuses, [key]: mergeStatus(state.pendingStatuses[key], action.status)! }
      // Статус может прийти раньше ответа SendMessage. Ограничиваем буфер неизвестных сообщений.
      const keys = Object.keys(statuses)
      if (keys.length > 1000) delete statuses[keys[0]]
      return { ...state, pendingStatuses: statuses }
    }
    return {
      ...state,
      chats: state.chats.map(chat => chat.id !== action.chatId ? chat : {
        ...chat,
        messages: chat.messages.map(item => item === message ? { ...item, status: mergeStatus(item.status, action.status) } : item),
      }),
    }
  }

  const chat = existing ?? { id: action.chatId, recipient: action.recipient, messages: [] }
  const message = chat.messages.find(item => item.id === action.message.id && item.direction === action.message.direction)
  const key = `${action.chatId}:${action.message.id}`
  const status = action.message.direction === 'outgoing'
    ? mergeStatus(mergeStatus(message?.status, action.message.status), state.pendingStatuses[key]) : undefined
  const pendingStatuses = { ...state.pendingStatuses }
  if (action.message.direction === 'outgoing') delete pendingStatuses[key]
  const messages = message
    ? chat.messages.map(item => item === message ? { ...item, status } : item)
    : [...chat.messages, { ...action.message, status }].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
  const updated = { ...chat, messages }
  const chats = existing ? state.chats.map(item => item.id === chat.id ? updated : item) : [...state.chats, updated]
  return {
    chats: chats.sort((a, b) => Date.parse(b.messages.at(-1)?.createdAt ?? '1970-01-01') - Date.parse(a.messages.at(-1)?.createdAt ?? '1970-01-01')),
    pendingStatuses,
  }
}
