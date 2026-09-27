import { useEffect, useReducer, useRef, useState } from 'react'
import { checkConnection, errorMessage, GreenApiError, resolveChat, sendText } from './api/greenApi'
import { ChatList } from './components/ChatList'
import { ChatWindow } from './components/ChatWindow'
import { Icon } from './components/Icon'
import { SidebarForm } from './components/SidebarForm'
import { chatsReducer, initialChatsState } from './state/chats'
import { useNotifications } from './hooks/useNotifications'
import type { ConnectionSettings, Message } from './types'
import './App.css'

function App() {
  const [{ chats }, dispatch] = useReducer(chatsReducer, initialChatsState)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [panel, setPanel] = useState<'connection' | 'chat' | null>('connection')
  const [settings, setSettings] = useState<ConnectionSettings | null>(null)
  const [sendErrors, setSendErrors] = useState<Record<string, string>>({})
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [mobileChat, setMobileChat] = useState(false)
  const newChatRef = useRef<HTMLButtonElement>(null)
  const settingsRef = useRef<HTMLButtonElement>(null)
  const sendControllerRef = useRef<AbortController | null>(null)
  const activeChat = chats.find(chat => chat.id === activeId)
  const receiving = useNotifications(settings, dispatch)

  useEffect(() => () => sendControllerRef.current?.abort(), [])

  function closePanel() {
    setPanel(null)
    if (panel === 'chat') newChatRef.current?.focus()
    else settingsRef.current?.focus()
  }

  async function connect(values: ConnectionSettings, signal: AbortSignal) {
    await checkConnection(values, signal)
    if (signal.aborted) return
    setSettings(values)
    setPanel('chat')
  }

  function disconnect() {
    if (sendControllerRef.current) return
    receiving.stop()
    setSettings(null)
    dispatch({ type: 'reset' })
    setDrafts({})
    setSendErrors({})
    setSearch('')
    setActiveId(null)
    setMobileChat(false)
    setPanel('connection')
  }

  async function createChat(recipient: string, signal: AbortSignal) {
    if (!settings) return
    const existing = chats.find(chat => chat.recipient === recipient)
    const id = existing?.id ?? await resolveChat(settings, recipient, signal)
    if (signal.aborted) return
    dispatch({ type: 'create', chatId: id, recipient })
    setActiveId(id)
    setSearch('')
    closePanel()
    setMobileChat(true)
  }

  async function sendMessage() {
    if (!settings || !activeChat || sendControllerRef.current) return
    const chatId = activeChat.id
    const draft = drafts[chatId] ?? ''
    const text = draft.trim()
    if (!text) return

    const controller = new AbortController()
    sendControllerRef.current = controller
    setSendingId(chatId)
    setSendErrors(current => ({ ...current, [chatId]: '' }))

    try {
      const id = await sendText(settings, chatId, text, controller.signal)
      if (controller.signal.aborted) return
      const message: Message = {
        id, text, direction: 'outgoing', createdAt: new Date().toISOString(), status: 'queued',
      }
      dispatch({ type: 'message', chatId, recipient: activeChat.recipient, message })
      setDrafts(current => current[chatId] === draft ? { ...current, [chatId]: '' } : current)
    } catch (error) {
      if (controller.signal.aborted) return
      const detail = errorMessage(error)
      const message = error instanceof GreenApiError && error.uncertain
        ? `${detail} Отправка могла состояться. Проверьте Telegram перед повторной попыткой.`
        : detail
      setSendErrors(current => ({ ...current, [chatId]: message }))
    } finally {
      if (sendControllerRef.current === controller) {
        sendControllerRef.current = null
        if (!controller.signal.aborted) setSendingId(null)
      }
    }
  }

  return (
    <main className={`app ${mobileChat ? 'app--chat-open' : ''}`}>
      <div className={`connection-banner ${settings && receiving.status !== 'running' ? 'connection-banner--warning' : ''}`} role="status">
        <span className={`connection-badge ${settings ? 'connection-badge--connected' : ''}`}>
          {settings ? (receiving.status === 'paused' ? 'Получение приостановлено' : 'Telegram подключён') : 'Нет подключения'}
        </span>
        <span>{settings ? receiving.message : 'Подключите инстанс GREEN-API, чтобы начать переписку.'}</span>
        {settings && receiving.status === 'paused' && (
          <button type="button" className="retry-button" onClick={receiving.retry}>Проверить снова</button>
        )}
      </div>
      <div className="chat-layout">
        <aside className="sidebar" aria-label="Чаты и подключение">
          <header className="sidebar__header">
            <h1>Чаты</h1>
            <div className="sidebar__actions">
              <button ref={newChatRef} type="button" className="primary-button" disabled={!settings} onClick={() => setPanel('chat')}>
                <Icon name="plus" />Новый чат
              </button>
              <button ref={settingsRef} type="button" className={`icon-button settings-button ${panel === 'connection' ? 'is-active' : ''}`}
                aria-label="Настройки подключения" aria-expanded={panel === 'connection'}
                onClick={() => setPanel(panel === 'connection' ? null : 'connection')}>
                <Icon name="settings" />
              </button>
            </div>
          </header>
          <ChatList chats={chats} activeId={activeId} search={search} onSearch={setSearch}
            onSelect={id => { setActiveId(id); setMobileChat(true) }} />
          {panel && (
            <SidebarForm key={`${panel}-${settings ? 'connected' : 'disconnected'}`} mode={panel} settings={settings}
              sending={sendingId !== null} onClose={closePanel} onCreate={createChat} onConnect={connect} onDisconnect={disconnect} />
          )}
        </aside>
        <ChatWindow chat={activeChat} connected={!!settings} draft={activeId ? drafts[activeId] ?? '' : ''}
          sending={sendingId === activeId && sendingId !== null} sendBusy={sendingId !== null}
          error={activeId ? sendErrors[activeId] ?? '' : ''}
          onDraft={text => { if (activeId) setDrafts(current => ({ ...current, [activeId]: text })) }}
          onSend={() => { void sendMessage() }} onBack={() => setMobileChat(false)} />
      </div>
    </main>
  )
}

export default App
