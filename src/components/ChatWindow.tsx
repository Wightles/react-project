import { Fragment, useEffect, useRef } from 'react'
import type { Chat } from '../types'
import { formatDay, formatPhone, formatTime } from '../utils/format'
import { Avatar, Icon } from './Icon'

interface Props {
  chat: Chat | undefined
  draft: string
  onDraft: (text: string) => void
  onSend: () => void
  onBack: () => void
}

export function ChatWindow({ chat, draft, onDraft, onSend, onBack }: Props) {
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }) }, [chat?.id, chat?.messages.length])

  if (!chat) return <section className="conversation conversation--empty"><Icon name="chat" /><h2>Выберите чат</h2><p>Или создайте новый, чтобы начать переписку.</p></section>

  return <section className="conversation" aria-label={`Переписка с ${formatPhone(chat.phone)}`}>
    <header className="conversation__header">
      <button type="button" className="icon-button mobile-back" onClick={onBack} aria-label="Назад к чатам"><Icon name="back" /></button>
      <Avatar /><div><h2>{formatPhone(chat.phone)}</h2><p>Демонстрационная переписка</p></div>
    </header>
    <div className="messages" role="log" aria-label="Сообщения" aria-live="polite" aria-relevant="additions">
      {chat.messages.length === 0 && <div className="empty-messages"><Icon name="chat" /><h3>Начните разговор</h3><p>Напишите первое сообщение.</p></div>}
      {chat.messages.map((message, index) => {
        const previous = chat.messages[index - 1]
        const startsDay = !previous || new Date(previous.createdAt).toDateString() !== new Date(message.createdAt).toDateString()
        return <Fragment key={message.id}>
          {startsDay && <div className="day-divider"><span>{formatDay(message.createdAt)}</span></div>}
          <div className={`message-row message-row--${message.direction}`}>
            <div className="message"><span className="sr-only">{message.direction === 'outgoing' ? 'Вы: ' : 'Собеседник: '}</span><span className="message__text">{message.text}</span><time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time></div>
          </div>
        </Fragment>
      })}
      <div ref={endRef} />
    </div>
    <form className="composer" onSubmit={event => { event.preventDefault(); onSend() }}>
      <div className="composer__input"><textarea aria-label="Сообщение" placeholder="Введите сообщение" rows={1} maxLength={4000} value={draft} onChange={event => onDraft(event.target.value)} onKeyDown={event => {
        if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); onSend() }
      }} /><span className="composer__hint">Enter – отправить · Shift + Enter – новая строка</span></div>
      <button className="send-button" type="submit" aria-label="Отправить сообщение" disabled={!draft.trim()} title="Добавить сообщение в демо-чат"><Icon name="send" /></button>
    </form>
  </section>
}
