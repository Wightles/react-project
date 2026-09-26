import type { Chat } from '../types'

function at(hours: number, minutes: number, daysAgo = 0) {
  const date = new Date()
  date.setDate(date.getDate() - daysAgo)
  date.setHours(hours, minutes, 0, 0)
  return date.toISOString()
}

export function createDemoChats(): Chat[] {
  return [
    {
      id: '79991234567', phone: '79991234567',
      messages: [
        { id: 'demo-1', text: 'Здравствуйте! Это тестовое сообщение.', direction: 'outgoing', createdAt: at(12, 14) },
        { id: 'demo-2', text: 'Добрый день! Сообщение получено.', direction: 'incoming', createdAt: at(12, 14) },
        { id: 'demo-3', text: 'Проверяю интерфейс отправки и получения.', direction: 'outgoing', createdAt: at(12, 15) },
        { id: 'demo-4', text: 'Ответ отображается в чате корректно.', direction: 'incoming', createdAt: at(12, 16) },
      ],
    },
    { id: '79012345678', phone: '79012345678', messages: [{ id: 'demo-5', text: 'Хорошо, спасибо!', direction: 'incoming', createdAt: at(16, 30, 1) }] },
    { id: '79501112233', phone: '79501112233', messages: [{ id: 'demo-6', text: 'Тестовое сообщение', direction: 'incoming', createdAt: at(10, 20, 2) }] },
    { id: '79773334455', phone: '79773334455', messages: [{ id: 'demo-7', text: 'Да, всё верно.', direction: 'incoming', createdAt: at(9, 10, 4) }] },
  ]
}
