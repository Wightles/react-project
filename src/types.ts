export interface Message {
  id: string
  text: string
  direction: 'incoming' | 'outgoing'
  createdAt: string
  status?: 'queued'
}

export interface Chat {
  id: string
  recipient: string
  messages: Message[]
}

export interface ConnectionSettings {
  apiUrl: string
  idInstance: string
  apiTokenInstance: string
}
