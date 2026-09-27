import { afterEach, mock, test } from 'node:test'
import assert from 'node:assert/strict'
import { checkReceivingSettings, receiveNotification, deleteNotification } from '../src/api/greenApi.ts'
import { parseNotification, NotificationFormatError } from '../src/api/notifications.ts'
import { chatsReducer, initialChatsState } from '../src/state/chats.ts'
import { runNotificationLoop, waitForPoll } from '../src/api/notificationLoop.ts'

const settings = { apiUrl: 'https://4100.api.green-api.com', idInstance: '4100000001', apiTokenInstance: 'test-token-not-real' }
const receivingSettings = { webhookUrl: '', incomingWebhook: 'yes' }
function incoming(overrides = {}) {
  return {
    typeWebhook: 'incomingMessageReceived', timestamp: 1770000000, idMessage: 'message-1',
    senderData: { chatId: '1001', chatType: 'user', chatName: 'Анна', senderPhoneNumber: 0 },
    messageData: { typeMessage: 'textMessage', textMessageData: { textMessage: 'Привет!\nКак дела?' } },
    ...overrides,
  }
}
function envelope(body = incoming(), receiptId = 10) { return { receiptId, body } }
function stub(data) { return mock.method(globalThis, 'fetch', async () => Response.json(data)) }
afterEach(() => mock.restoreAll())

test('empty queue is a normal null response with five second long polling', async () => {
  const fetch = stub(null)
  assert.equal(await receiveNotification(settings), null)
  const [url, options] = fetch.mock.calls[0].arguments
  assert.equal(url, `${settings.apiUrl}/waInstance4100000001/receiveNotification/test-token-not-real?receiveTimeout=5`)
  assert.equal(options.method, 'GET')
})

test('receipt envelope is validated before acknowledging', async () => {
  let data = envelope()
  mock.method(globalThis, 'fetch', async () => Response.json(data))
  assert.deepEqual(await receiveNotification(settings), data)
  for (const invalid of [{receiptId: '10', body: {}}, {receiptId: -1, body: {}}, {receiptId: 10, body: null}]) {
    data = invalid
    await assert.rejects(receiveNotification(settings), /некорректное уведомление/)
  }
})

test('acknowledgement is DELETE with the receipt ID and no request body', async () => {
  const fetch = stub({ result: true })
  assert.equal(await deleteNotification(settings, 123), true)
  const [url, options] = fetch.mock.calls[0].arguments
  assert.equal(url, `${settings.apiUrl}/waInstance4100000001/deleteNotification/test-token-not-real/123`)
  assert.equal(options.method, 'DELETE')
  assert.equal(options.body, undefined)
})

test('already removed receipt is accepted, but a malformed acknowledgement is not', async () => {
  let data = {result: false}
  const fetch = mock.method(globalThis, 'fetch', async () => Response.json(data))
  assert.equal(await deleteNotification(settings, 10), false)
  data = {}
  await assert.rejects(deleteNotification(settings, 10), /не подтвердил/)
  await assert.rejects(deleteNotification(settings, NaN), /идентификатор/)
  assert.equal(fetch.mock.callCount(), 2)
})

test('receiving settings are read only and explain missing configuration', async () => {
  let data = receivingSettings
  const fetch = mock.method(globalThis, 'fetch', async () => Response.json(data))
  await checkReceivingSettings(settings)
  data = { ...receivingSettings, webhookUrl: 'https://example.com/webhook' }
  await assert.rejects(checkReceivingSettings(settings), /Очистите webhookUrl/)
  data = { ...receivingSettings, incomingWebhook: 'no' }
  await assert.rejects(checkReceivingSettings(settings), /Включите/)
  assert.ok(fetch.mock.calls.every(call => call.arguments[1].method === 'GET'))
})

test('incoming text preserves content, sender chat ID and server timestamp', () => {
  const event = parseNotification(incoming())
  assert.equal(event.type, 'message')
  assert.equal(event.chatId, '1001')
  assert.equal(event.recipient, 'Анна')
  assert.equal(event.message.text, 'Привет!\nКак дела?')
  assert.equal(event.message.direction, 'incoming')
  assert.equal(Date.parse(event.message.createdAt), 1770000000000)
})

test('extended text extracts text without interpreting HTML or loading media', () => {
  const event = parseNotification(incoming({ messageData: { typeMessage: 'extendedTextMessage', extendedTextMessageData: { text: '<script>alert(1)</script> https://example.com', jpegThumbnail: 'not-loaded' } } }))
  assert.equal(event.message.text, '<script>alert(1)</script> https://example.com')
})

test('unsupported media, groups and unknown events are deliberately skipped', () => {
  assert.equal(parseNotification(incoming({ messageData: {typeMessage:'imageMessage'} })), null)
  assert.equal(parseNotification(incoming({ senderData: {chatId:'-1001', chatType:'supergroup'} })), null)
  assert.equal(parseNotification({typeWebhook:'unknown'}), null)
})

test('malformed recognized text cannot be silently acknowledged', () => {
  assert.throws(() => parseNotification(incoming({ messageData: {typeMessage:'textMessage', textMessageData:{}} })), NotificationFormatError)
  assert.throws(() => parseNotification(incoming({ timestamp: NaN })), NotificationFormatError)
})

test('incoming and outgoing events deduplicate within their chat and direction', () => {
  const event = parseNotification(incoming())
  let state = chatsReducer(initialChatsState, event)
  state = chatsReducer(state, event)
  assert.equal(state.chats[0].messages.length, 1)
  state = chatsReducer(state, { ...event, chatId: '1002' })
  assert.equal(state.chats.length, 2)
  const outbound = parseNotification(incoming({ typeWebhook:'outgoingAPIMessageReceived' }))
  state = chatsReducer(state, outbound)
  assert.equal(state.chats.find(chat => chat.id === '1001').messages.length, 2)
})

test('canonical chat ID joins incoming phone information to a manually created username chat', () => {
  let state = chatsReducer(initialChatsState, {type:'create', chatId:'1001', recipient:'@anna'})
  state = chatsReducer(state, parseNotification(incoming()))
  assert.equal(state.chats.length, 1)
  assert.equal(state.chats[0].recipient, '@anna')
})

test('incoming-only chat can be replied to without a phone number', () => {
  const state = chatsReducer(initialChatsState, parseNotification(incoming()))
  assert.equal(state.chats[0].id, '1001')
  assert.equal(state.chats[0].recipient, 'Анна')
})

test('read status arriving before send response is retained and never downgraded', () => {
  const status = parseNotification({typeWebhook:'outgoingMessageStatus', chatId:'1001', idMessage:'message-1', status:'read'})
  let state = chatsReducer(initialChatsState, status)
  const sent = parseNotification(incoming({typeWebhook:'outgoingAPIMessageReceived'}))
  state = chatsReducer(state, { ...sent, message: {...sent.message, status:'queued'} })
  state = chatsReducer(state, sent)
  state = chatsReducer(state, {...status, status:'delivered'})
  assert.equal(state.chats[0].messages.length, 1)
  assert.equal(state.chats[0].messages[0].status, 'read')
  assert.deepEqual(state.pendingStatuses, {})
})

test('delivery failure without a message ID does not mark an arbitrary message failed', () => {
  let state = chatsReducer(initialChatsState, parseNotification(incoming({typeWebhook:'outgoingAPIMessageReceived'})))
  const event = parseNotification({typeWebhook:'outgoingMessageStatus', chatId:'1001', status:'failed'})
  state = chatsReducer(state, event)
  assert.ok(state.chats[0].deliveryError.includes('без указания сообщения'))
  assert.equal(state.chats[0].messages[0].status, undefined)
})

test('noAccount maps to failure, and session reset clears pending statuses', () => {
  const event = parseNotification({typeWebhook:'outgoingMessageStatus', chatId:'1001', idMessage:'message-1', status:'noAccount'})
  assert.equal(event.status, 'failed')
  const state = chatsReducer(initialChatsState, event)
  assert.deepEqual(chatsReducer(state, {type:'reset'}), initialChatsState)
})

test('messages are chronological even when the queue contains older events', () => {
  let state = chatsReducer(initialChatsState, parseNotification(incoming()))
  state = chatsReducer(state, parseNotification(incoming({idMessage:'older', timestamp:1760000000})))
  assert.deepEqual(state.chats[0].messages.map(message => message.id), ['older', 'message-1'])
})

test('poller processes before DELETE and retries the same receipt without repeating receive or processing', {timeout:2000}, async () => {
  const controller = new AbortController()
  const operations = []
  const waits = []
  let deletes = 0
  mock.method(globalThis, 'fetch', async (url, options) => {
    if (url.includes('/getSettings/')) return Response.json(receivingSettings)
    if (url.includes('/receiveNotification/')) { operations.push('receive'); return Response.json(envelope()) }
    assert.equal(options.method, 'DELETE')
    operations.push('delete')
    if (++deletes === 1) throw new TypeError('connection lost')
    return Response.json({result:false})
  })
  await runNotificationLoop(settings, controller.signal, () => operations.push('process'), () => {}, async milliseconds => {
    waits.push(milliseconds)
    if (deletes === 2) controller.abort()
  })
  assert.deepEqual(operations, ['receive', 'process', 'delete', 'delete'])
  assert.deepEqual(waits, [1000, 250])
})

test('empty queue is paced, never acknowledged and does not create messages', {timeout:2000}, async () => {
  const controller = new AbortController()
  const calls = []
  mock.method(globalThis, 'fetch', async url => { calls.push(url); return Response.json(url.includes('/getSettings/') ? receivingSettings : null) })
  await runNotificationLoop(settings, controller.signal, () => assert.fail('No message expected'), () => {}, async milliseconds => {
    assert.equal(milliseconds, 250)
    controller.abort()
  })
  assert.equal(calls.length, 2)
  assert.ok(calls.every(url => !url.includes('/deleteNotification/')))
})

test('non-text event is acknowledged so the next text is not blocked', {timeout:2000}, async () => {
  const controller = new AbortController()
  const deletes = []
  mock.method(globalThis, 'fetch', async (url, options) => {
    if (url.includes('/getSettings/')) return Response.json(receivingSettings)
    if (url.includes('/receiveNotification/')) return Response.json(envelope(incoming({messageData:{typeMessage:'imageMessage'}})))
    deletes.push(options.method)
    return Response.json({result:true})
  })
  await runNotificationLoop(settings, controller.signal, () => assert.fail('No media expected'), () => {}, async () => controller.abort())
  assert.deepEqual(deletes, ['DELETE'])
})

test('malformed text stops the loop without deleting it', {timeout:2000}, async () => {
  const controller = new AbortController()
  const calls = []
  const states = []
  mock.method(globalThis, 'fetch', async url => { calls.push(url); return Response.json(url.includes('/getSettings/') ? receivingSettings : envelope(incoming({idMessage:null}))) })
  await runNotificationLoop(settings, controller.signal, () => assert.fail('Invalid event'), state => states.push(state))
  assert.equal(states.at(-1).status, 'paused')
  assert.ok(calls.every(url => !url.includes('/deleteNotification/')))
})

test('retry delays increase up to 30 seconds on repeated network errors', {timeout:2000}, async () => {
  const controller = new AbortController()
  const delays = []
  mock.method(globalThis, 'fetch', async () => { throw new TypeError('offline') })
  await runNotificationLoop(settings, controller.signal, () => {}, () => {}, async milliseconds => {
    delays.push(milliseconds)
    if (delays.length === 7) controller.abort()
  })
  assert.deepEqual(delays, [1000,2000,4000,8000,16000,30000,30000])
})

test('invalid credentials pause polling without automatic retries', {timeout:2000}, async () => {
  const states = []
  const fetch = mock.method(globalThis, 'fetch', async () => Response.json({}, {status:401}))
  await runNotificationLoop(settings, new AbortController().signal, () => {}, state => states.push(state))
  assert.equal(fetch.mock.callCount(), 1)
  assert.equal(states.at(-1).status, 'paused')
})

test('disconnect discards an in-flight receive and never acknowledges it', {timeout:2000}, async () => {
  const controller = new AbortController()
  const calls = []
  mock.method(globalThis, 'fetch', async url => {
    calls.push(url)
    if (url.includes('/getSettings/')) return Response.json(receivingSettings)
    controller.abort()
    return Response.json(envelope())
  })
  await runNotificationLoop(settings, controller.signal, () => assert.fail('Stale message'), () => {})
  assert.equal(calls.length, 2)
})

test('instance authorization loss is acknowledged then pauses the loop', {timeout:2000}, async () => {
  const states = []
  mock.method(globalThis, 'fetch', async url => {
    if (url.includes('/getSettings/')) return Response.json(receivingSettings)
    if (url.includes('/receiveNotification/')) return Response.json(envelope({typeWebhook:'stateInstanceChanged', stateInstance:'notAuthorized'}))
    return Response.json({result:true})
  })
  await runNotificationLoop(settings, new AbortController().signal, () => {}, state => states.push(state))
  assert.equal(states.at(-1).status, 'paused')
})

test('abort interrupts a retry timer immediately', {timeout:1000}, async () => {
  const controller = new AbortController()
  const waiting = waitForPoll(30_000, controller.signal)
  controller.abort()
  await waiting
})
