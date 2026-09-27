import { Fragment, useEffect, useRef } from 'react'
import { MESSAGE_MAX_LENGTH } from '../constants'
import type { Chat, MessageStatus } from '../types'
import { formatDay, formatRecipient, formatTime } from '../utils/format'
import { Avatar, Icon } from './Icon'

const statusLabels: Record<MessageStatus, string> = { queued: 'В очереди', delivered: 'Доставлено', read: 'Прочитано', failed: 'Не доставлено' }

interface Props {
  chat: Chat | undefined
  connected: boolean
  draft: string
  sending: boolean
  sendBusy: boolean
  error: string
  onDraft: (text: string) => void
  onSend: () => void
  onBack: () => void
}

export function ChatWindow({ chat, connected, draft, sending, sendBusy, error, onDraft, onSend, onBack }: Props) {
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const wasSending = useRef(false)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [chat?.id, chat?.messages.length])

  useEffect(() => {
    if (wasSending.current && !sending && !sendBusy) inputRef.current?.focus()
    wasSending.current = sending
  }, [sending, sendBusy])

  if (!chat) {
    return (
      <section className="conversation conversation--empty">
        <Icon name="chat" />
        <h2>{connected ? 'Начните переписку' : 'Подключите Telegram'}</h2>
        <p>{connected ? 'Нажмите «Новый чат» и введите номер или @username получателя.' : 'Введите данные инстанса GREEN-API в форме подключения.'}</p>
      </section>
    )
  }

  return (
    <section className="conversation" aria-label={`Переписка с ${formatRecipient(chat.recipient)}`}>
      <header className="conversation__header">
        <button type="button" className="icon-button mobile-back" onClick={onBack} aria-label="Назад к чатам">
          <Icon name="back" />
        </button>
        <Avatar />
        <div><h2>{formatRecipient(chat.recipient)}</h2><p>Telegram</p></div>
      </header>
      <div className="messages" role="log" aria-label="Сообщения" aria-live="polite" aria-relevant="additions">
        {chat.messages.length === 0 && (
          <div className="empty-messages"><Icon name="chat" /><h3>Начните разговор</h3><p>Напишите первое сообщение.</p></div>
        )}
        {chat.messages.map((message, index) => {
          const previous = chat.messages[index - 1]
          const startsDay = !previous || new Date(previous.createdAt).toDateString() !== new Date(message.createdAt).toDateString()
          return (
            <Fragment key={`${message.direction}:${message.id}`}>
              {startsDay && <div className="day-divider"><span>{formatDay(message.createdAt)}</span></div>}
              <div className={`message-row message-row--${message.direction}`}>
                <div className="message">
                  <span className="sr-only">{message.direction === 'outgoing' ? 'Вы: ' : 'Собеседник: '}</span>
                  <span className="message__text">{message.text}</span>
                  <span className="message__meta">
                    {message.status && <span className={message.status === 'failed' ? 'message-status--failed' : undefined}>{statusLabels[message.status]}</span>}
                    <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>
                  </span>
                </div>
              </div>
            </Fragment>
          )
        })}
        <div ref={endRef} />
      </div>
      {chat.deliveryError && <p className="send-error" role="alert">{chat.deliveryError}</p>}
      {error && <p className="send-error" role="alert">{error} Текст сохранён в поле ввода.</p>}
      <form className="composer" aria-busy={sending} onSubmit={event => { event.preventDefault(); onSend() }}>
        <div className="composer__input">
          <textarea ref={inputRef} aria-label="Сообщение" placeholder="Введите сообщение" rows={1} maxLength={MESSAGE_MAX_LENGTH}
            value={draft} readOnly={sending} onChange={event => onDraft(event.target.value)} onKeyDown={event => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault()
                onSend()
              }
            }} />
          <span className="composer__hint" role="status">
            {sending ? 'Отправка…' : 'Enter – отправить · Shift + Enter – новая строка'}
          </span>
        </div>
        <button className="send-button" type="submit" aria-label="Отправить сообщение"
          disabled={!draft.trim() || sendBusy} title={sending ? 'Отправка…' : 'Отправить сообщение в Telegram'}>
          {sending ? <span className="spinner" aria-hidden="true" /> : <Icon name="send" />}
        </button>
      </form>
    </section>
  )
}
