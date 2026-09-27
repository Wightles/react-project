import { useCallback, useEffect, useRef, useState } from 'react'
import type { Dispatch } from 'react'
import type { ConnectionSettings } from '../types'
import type { ChatsAction } from '../state/chats'
import { runNotificationLoop } from '../api/notificationLoop'
import type { ReceivingState } from '../api/notificationLoop'

const initialState: ReceivingState = { status: 'checking', message: 'Проверка получения сообщений…' }

export function useNotifications(settings: ConnectionSettings | null, dispatch: Dispatch<ChatsAction>) {
  const [state, setState] = useState<ReceivingState>(initialState)
  const [attempt, setAttempt] = useState(0)
  const controllerRef = useRef<AbortController | null>(null)

  const stop = useCallback(() => controllerRef.current?.abort(), [])
  const retry = useCallback(() => {
    controllerRef.current?.abort()
    setAttempt(value => value + 1)
  }, [])

  useEffect(() => {
    if (!settings) return
    const controller = new AbortController()
    controllerRef.current = controller
    void runNotificationLoop(settings, controller.signal, event => {
      if (!controller.signal.aborted) dispatch(event)
    }, nextState => {
      if (!controller.signal.aborted) setState(nextState)
    })
    return () => controller.abort()
  }, [settings, dispatch, attempt])

  return { ...state, stop, retry }
}
