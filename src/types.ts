export interface Message {
  id: string
  text: string
  direction: 'incoming' | 'outgoing'
  createdAt: string
}

export interface Chat {
  id: string
  phone: string
  messages: Message[]
}

export interface ConnectionSettings {
  apiUrl: string
  idInstance: string
  apiTokenInstance: string
}
