import { useState } from 'react'
import type { SubmitEvent } from 'react'
import type { ConnectionSettings } from '../types'
import { normalizePhone } from '../utils/format'
import { Icon } from './Icon'

interface Props {
  mode: 'connection' | 'chat'
  settings: ConnectionSettings | null
  onSave: (settings: ConnectionSettings) => void
  onCreate: (phone: string) => void
  onClose: () => void
}

export function SidebarForm({ mode, settings, onSave, onCreate, onClose }: Props) {
  const [phone, setPhone] = useState('')
  const [error, setError] = useState('')
  const [values, setValues] = useState<ConnectionSettings>(settings ?? { apiUrl: '', idInstance: '', apiTokenInstance: '' })
  const isConnection = mode === 'connection'

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isConnection) {
      let url: URL
      try { url = new URL(values.apiUrl.trim()) } catch { setError('Введите корректный URL сервера.'); return }
      if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
        setError('Укажите HTTPS-адрес сервера без пути и параметров.'); return
      }
      if (!/^\d+$/.test(values.idInstance.trim()) || !values.apiTokenInstance.trim()) {
        setError('Проверьте idInstance и токен.'); return
      }
      onSave({ apiUrl: url.origin, idInstance: values.idInstance.trim(), apiTokenInstance: values.apiTokenInstance.trim() })
    } else {
      const normalized = normalizePhone(phone)
      if (!/^[+\d\s()-]+$/.test(phone) || !/^[1-9]\d{9,14}$/.test(normalized)) {
        setError('Введите номер с кодом страны: от 10 до 15 цифр.'); return
      }
      onCreate(normalized)
    }
  }

  return <section className="sidebar-form" aria-labelledby="form-title" onKeyDown={event => { if (event.key === 'Escape') onClose() }}>
    <div className="sidebar-form__heading"><h2 id="form-title">{isConnection ? 'Подключение' : 'Новый чат'}</h2><button type="button" className="icon-button" aria-label="Закрыть форму" onClick={onClose}><Icon name="close" /></button></div>
    <p className="sidebar-form__description">{isConnection ? 'Данные инстанса из личного кабинета GREEN-API.' : 'Введите номер получателя с кодом страны.'}</p>
    <form onSubmit={submit}>
      {isConnection ? <>
        <label className="field">apiUrl<input autoFocus type="url" required placeholder="https://…" value={values.apiUrl} onChange={event => setValues({ ...values, apiUrl: event.target.value })} /></label>
        <label className="field">idInstance<input required inputMode="numeric" autoComplete="off" placeholder="Введите ID инстанса" value={values.idInstance} onChange={event => setValues({ ...values, idInstance: event.target.value })} /></label>
        <label className="field">apiTokenInstance<input type="password" required autoComplete="off" placeholder="Введите токен" value={values.apiTokenInstance} onChange={event => setValues({ ...values, apiTokenInstance: event.target.value })} /></label>
      </> : <label className="field">Номер получателя<input autoFocus type="tel" required placeholder="+7 999 123-45-67" value={phone} onChange={event => { setPhone(event.target.value); setError('') }} /></label>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary-button form-submit" type="submit">{isConnection ? 'Сохранить данные' : 'Создать чат'}</button>
    </form>
    {isConnection && <p className="form-note">На этом этапе данные хранятся только в памяти вкладки. Подключение к API пока не выполняется.</p>}
  </section>
}
