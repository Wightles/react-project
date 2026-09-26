import type { ReactNode } from 'react'

type IconName = 'plus' | 'search' | 'settings' | 'close' | 'send' | 'back' | 'chat'
const paths: Record<IconName, ReactNode> = {
  plus: <path d="M12 5v14M5 12h14" />,
  search: <><circle cx="10.8" cy="10.8" r="7.3" /><path d="m16 16 4.5 4.5" /></>,
  settings: <><path d="m9.5 3-.6 2.2-1.6.9-2.2-.6-2.5 4.3 1.6 1.6v1.9l-1.6 1.6 2.5 4.3 2.2-.6 1.6.9.6 2.2h5l.6-2.2 1.6-.9 2.2.6 2.5-4.3-1.6-1.6v-1.9l1.6-1.6L18.9 5l-2.2.6-1.6-.9-.6-2.2Z" /><circle cx="12" cy="12" r="3" /></>,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  send: <><path d="m21 3-7 18-4-7-7-4Z" /><path d="m10 14 11-11" /></>,
  back: <path d="m14 5-7 7 7 7" />,
  chat: <path d="M21 11.5a9 9 0 0 1-9 9 10 10 0 0 1-4-.9L3 21l1.4-4.8a9 9 0 1 1 16.6-4.7Z" />,
}

export function Icon({ name }: { name: IconName }) {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

export function Avatar() {
  return <span className="avatar" aria-hidden="true"><svg width="38" height="38" viewBox="0 0 40 40" fill="currentColor"><circle cx="20" cy="13" r="7" /><path d="M6 35v-3a14 11 0 0 1 28 0v3Z" /></svg></span>
}
