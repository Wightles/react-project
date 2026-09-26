import { useEffect, useRef, useState } from 'react'
import type { SubmitEvent } from 'react'
import { errorMessage, validateSettings } from '../api/greenApi'
import type { ConnectionSettings } from '../types'
import { normalizeRecipient } from '../utils/format'
import { Icon } from './Icon'

interface Props {
  mode: 'connection' | 'chat'
  settings: ConnectionSettings | null
  sending: boolean
  onConnect: (settings: ConnectionSettings, signal: AbortSignal) => Promise<void>
  onCreate: (recipient: string, signal: AbortSignal) => Promise<void>
  onDisconnect: () => void
  onClose: () => void
}

export function SidebarForm({ mode, settings, sending, onConnect, onCreate, onDisconnect, onClose }: Props) {
  const [recipient, setRecipient] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [values, setValues] = useState<ConnectionSettings>({ apiUrl: '', idInstance: '', apiTokenInstance: '' })
  const controllerRef = useRef<AbortController | null>(null)
  const isConnection = mode === 'connection'

  useEffect(() => () => controllerRef.current?.abort(), [])

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (controllerRef.current) return
    const controller = new AbortController()
    controllerRef.current = controller
    setError('')
    setBusy(true)

    try {
      if (isConnection) {
        await onConnect(validateSettings(values), controller.signal)
      } else {
        const normalized = normalizeRecipient(recipient)
        if (!normalized) {
          setError('Введите международный номер или @username получателя.')
          return
        }
        await onCreate(normalized, controller.signal)
      }
    } catch (error) {
      if (!controller.signal.aborted) setError(errorMessage(error))
    } finally {
      controllerRef.current = null
      if (!controller.signal.aborted) setBusy(false)
    }
  }

  return (
    <section className="sidebar-form" aria-labelledby="form-title" onKeyDown={event => {
      if (event.key === 'Escape') onClose()
    }}>
      <div className="sidebar-form__heading">
        <h2 id="form-title">{isConnection ? 'Подключение' : 'Новый чат'}</h2>
        <button type="button" className="icon-button" aria-label="Закрыть форму" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      {isConnection && settings ? (
        <div className="connection-details">
          <p className="connection-state">Telegram подключён</p>
          <p>Инстанс {settings.idInstance}</p>
          <p className="form-note">Отключение очистит переписку и данные подключения в этой вкладке.</p>
          <button type="button" className="secondary-button form-submit" disabled={sending} onClick={onDisconnect}>
            Отключиться
          </button>
          {sending && <p className="form-note">Дождитесь завершения отправки.</p>}
        </div>
      ) : (
        <>
          <p className="sidebar-form__description">
            {isConnection ? 'Данные инстанса Telegram из личного кабинета GREEN-API.' : 'Международный номер или @username получателя в Telegram.'}
          </p>
          <form onSubmit={submit} aria-busy={busy}>
            <fieldset disabled={busy}>
              {isConnection ? (
                <>
                  <label className="field">apiUrl
                    <input autoFocus type="url" required placeholder="https://4100.api.green-api.com" value={values.apiUrl}
                      onChange={event => setValues({ ...values, apiUrl: event.target.value })} />
                  </label>
                  <label className="field">idInstance
                    <input required inputMode="numeric" autoComplete="off" placeholder="Введите ID инстанса" value={values.idInstance}
                      onChange={event => setValues({ ...values, idInstance: event.target.value })} />
                  </label>
                  <label className="field">apiTokenInstance
                    <input type="password" required autoComplete="off" placeholder="Введите токен" value={values.apiTokenInstance}
                      onChange={event => setValues({ ...values, apiTokenInstance: event.target.value })} />
                  </label>
                </>
              ) : (
                <label className="field">Получатель
                  <input autoFocus type="text" required autoComplete="off" spellCheck={false} placeholder="+7 999 123-45-67 или @username" value={recipient}
                    onChange={event => { setRecipient(event.target.value); setError('') }} />
                </label>
              )}
            </fieldset>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="primary-button form-submit" type="submit" disabled={busy}>
              {busy ? (isConnection ? 'Подключение…' : 'Поиск получателя…') : (isConnection ? 'Подключиться' : 'Создать чат')}
            </button>
          </form>
          {isConnection && <p className="form-note">Данные подключения хранятся только в памяти вкладки.</p>}
        </>
      )}
    </section>
  )
}
