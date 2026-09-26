import { useRef, useState } from 'react'
import { ChatList } from './components/ChatList'
import { ChatWindow } from './components/ChatWindow'
import { Icon } from './components/Icon'
import { SidebarForm } from './components/SidebarForm'
import { createDemoChats } from './data/demoChats'
import type { ConnectionSettings } from './types'
import './App.css'

function App() {
  const [chats, setChats] = useState(createDemoChats)
  const [activeId, setActiveId] = useState<string | null>('79991234567')
  const [search, setSearch] = useState('')
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [panel, setPanel] = useState<'connection' | 'chat' | null>('connection')
  const [settings, setSettings] = useState<ConnectionSettings | null>(null)
  const [notice, setNotice] = useState('')
  const [mobileChat, setMobileChat] = useState(false)
  const newChatRef = useRef<HTMLButtonElement>(null)
  const settingsRef = useRef<HTMLButtonElement>(null)
  const activeChat = chats.find(chat => chat.id === activeId)

  function closePanel() {
    setPanel(null)
    if (panel === 'chat') newChatRef.current?.focus()
    else settingsRef.current?.focus()
  }

  function createChat(phone: string) {
    setChats(current => current.some(chat => chat.id === phone) ? current : [{ id: phone, phone, messages: [] }, ...current])
    setActiveId(phone)
    setSearch('')
    closePanel()
    setMobileChat(true)
  }

  function sendMessage() {
    if (!activeId) return
    const text = (drafts[activeId] ?? '').trim()
    if (!text) return
    const message = { id: crypto.randomUUID(), text, direction: 'outgoing' as const, createdAt: new Date().toISOString() }
    setChats(current => current.map(chat => chat.id === activeId ? { ...chat, messages: [...chat.messages, message] } : chat))
    setDrafts(current => ({ ...current, [activeId]: '' }))
  }

  return <main className={`app ${mobileChat ? 'app--chat-open' : ''}`}>
    <div className="demo-banner"><span className="demo-badge">Демо</span><span>Сообщения видны только здесь и не отправляются в MAX.</span></div>
    <div className="chat-layout">
      <aside className="sidebar" aria-label="Чаты и подключение">
        <header className="sidebar__header"><h1>Чаты</h1><div className="sidebar__actions"><button ref={newChatRef} type="button" className="primary-button" onClick={() => { setPanel('chat'); setNotice('') }}><Icon name="plus" />Новый чат</button><button ref={settingsRef} type="button" className={`icon-button settings-button ${panel === 'connection' ? 'is-active' : ''}`} aria-label="Настройки подключения" aria-expanded={panel === 'connection'} onClick={() => { setPanel(panel === 'connection' ? null : 'connection'); setNotice('') }}><Icon name="settings" /></button></div></header>
        <ChatList chats={chats} activeId={activeId} search={search} onSearch={setSearch} onSelect={id => { setActiveId(id); setMobileChat(true) }} />
        {notice && <p className="sidebar-notice" role="status">{notice}</p>}
        {panel && <SidebarForm key={panel} mode={panel} settings={settings} onClose={closePanel} onCreate={createChat} onSave={values => { setSettings(values); closePanel(); setNotice('Данные сохранены в памяти вкладки. API пока не подключён.') }} />}
      </aside>
      <ChatWindow chat={activeChat} draft={activeId ? drafts[activeId] ?? '' : ''} onDraft={text => { if (activeId) setDrafts(current => ({ ...current, [activeId]: text })) }} onSend={sendMessage} onBack={() => setMobileChat(false)} />
    </div>
  </main>
}

export default App
