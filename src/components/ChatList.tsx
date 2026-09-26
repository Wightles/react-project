import type { Chat } from '../types'
import { formatDay, formatRecipient, formatTime, normalizePhone } from '../utils/format'
import { Avatar, Icon } from './Icon'

interface Props {
  chats: Chat[]
  activeId: string | null
  search: string
  onSearch: (value: string) => void
  onSelect: (id: string) => void
}

export function ChatList({ chats, activeId, search, onSearch, onSelect }: Props) {
  const query = search.trim().toLowerCase()
  const digits = /^[+\d\s()-]+$/.test(query) ? normalizePhone(query) : ''
  const filtered = chats.filter(chat => !query || (chat.recipient.startsWith('@')
    ? chat.recipient.toLowerCase().includes(query)
    : digits !== '' && chat.recipient.includes(digits)))

  return <>
    <label className="search-field">
      <Icon name="search" />
      <input type="search" aria-label="Поиск по чатам" placeholder="Поиск по чатам..." value={search} onChange={event => onSearch(event.target.value)} />
    </label>
    <nav className="chat-list" aria-label="Список чатов">
      {filtered.map(chat => {
        const last = chat.messages.at(-1)
        return <button type="button" className={`chat-item ${chat.id === activeId ? 'chat-item--active' : ''}`} key={chat.id} onClick={() => onSelect(chat.id)} aria-current={chat.id === activeId ? 'true' : undefined}>
          <Avatar />
          <span className="chat-item__body">
            <span className="chat-item__top"><strong>{formatRecipient(chat.recipient)}</strong>{last && <time dateTime={last.createdAt}>{formatDay(last.createdAt) === 'Сегодня' ? formatTime(last.createdAt) : formatDay(last.createdAt)}</time>}</span>
            <span className="chat-item__preview">{last?.text ?? 'Пока нет сообщений'}</span>
          </span>
        </button>
      })}
      {filtered.length === 0 && <p className="list-empty">{chats.length === 0 ? 'Здесь появятся ваши чаты.' : <>Чаты не найдены.<br />Попробуйте другой номер или имя.</>}</p>}
    </nav>
  </>
}
