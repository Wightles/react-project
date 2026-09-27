export type MessageStatus = 'queued' | 'delivered' | 'read' | 'failed'

export interface Message {
  id: string
  text: string
  direction: 'incoming' | 'outgoing'
  createdAt: string
  status?: MessageStatus
}

export interface Chat {
  id: string
  recipient: string
  messages: Message[]
  deliveryError?: string
}

export interface ConnectionSettings {
  apiUrl: string
  idInstance: string
  apiTokenInstance: string
}
