import { afterEach, mock, test } from 'node:test'
import assert from 'node:assert/strict'
import { checkConnection, GreenApiError, resolveChat, sendText, validateSettings } from '../src/api/greenApi.ts'

const settings = {
  apiUrl: 'https://4100.api.green-api.com',
  idInstance: '4100000001',
  apiTokenInstance: 'test-token-not-real',
}

afterEach(() => mock.restoreAll())

function respond(data, status = 200) {
  return mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify(data), { status }))
}

test('connection calls the documented GET endpoint and requires authorized state', async () => {
  const fetch = respond({ stateInstance: 'authorized' })
  await checkConnection(settings)
  const [url, options] = fetch.mock.calls[0].arguments
  assert.equal(url, 'https://4100.api.green-api.com/waInstance4100000001/getStateInstance/test-token-not-real')
  assert.equal(options.method, 'GET')
  assert.equal(options.body, undefined)
  assert.equal(options.credentials, 'omit')
  assert.equal(options.redirect, 'error')
})

for (const state of ['notAuthorized', 'starting', 'blocked', 'suspended', 'pendingPassword', 'unexpected']) {
  test(`connection rejects ${state}`, async () => {
    respond({ stateInstance: state })
    await assert.rejects(checkConnection(settings), GreenApiError)
  })
}

test('validates the server before sending a token', async () => {
  const fetch = respond({ stateInstance: 'authorized' })
  for (const apiUrl of [
    'http://4100.api.green-api.com', 'https://evil.test',
    'https://api.green-api.com.evil.test', 'https://fakegreen-api.com',
    'https://user:pass@api.green-api.com', 'https://api.green-api.com/path',
    'https://api.green-api.com?token=secret',
  ]) {
    await assert.rejects(checkConnection({ ...settings, apiUrl }), GreenApiError)
  }
  assert.equal(fetch.mock.callCount(), 0)
  assert.deepEqual(validateSettings({ ...settings, apiUrl: `${settings.apiUrl}/` }), settings)
})

test('phone lookup returns the canonical Telegram chat ID', async () => {
  const fetch = respond({ exist: true, chatId: '10000000', fromCache: true })
  assert.equal(await resolveChat(settings, '79991234567'), '10000000')
  const [url, options] = fetch.mock.calls[0].arguments
  assert.ok(url.includes('/checkAccount/'))
  assert.equal(options.method, 'POST')
  assert.deepEqual(JSON.parse(options.body), { phoneNumber: 79991234567 })
})

test('does not create a chat for a missing account or a logical API error', async () => {
  let data = { exist: false, chatId: '' }
  mock.method(globalThis, 'fetch', async () => Response.json(data))
  await assert.rejects(resolveChat(settings, '79991234567'), /не нашёл аккаунт/)
  data = { status: false, data: { status: 'fail', reason: 'rate_limit_exceeded', retryAfter: 11930619 } }
  await assert.rejects(resolveChat(settings, '79991234567'), /ограничил поиск/)
  data = { exist: true, chatId: null }
  await assert.rejects(resolveChat(settings, '79991234567'), /идентификатор/)
})

test('rejects unsupported phone formats without a network request', async () => {
  const fetch = respond({ exist: true, chatId: '10000000' })
  for (const phone of ['123', '1234567890123456', '0123456789', '12+3456789', '@', '@user name', 'https://t.me/username']) {
    await assert.rejects(resolveChat(settings, phone), GreenApiError)
  }
  assert.equal(fetch.mock.callCount(), 0)
  for (const phone of ['375291234567', '447911123456', '12025550123', '+49 151 23456789']) {
    await resolveChat(settings, phone)
  }
  assert.equal(fetch.mock.callCount(), 4)
})

test('sends multiline Unicode text to the canonical chat ID and returns the message ID', async () => {
  const fetch = respond({ idMessage: '1763115112345' })
  const message = 'Привет! 👋\nВторая строка'
  assert.equal(await sendText(settings, '10000000', message), '1763115112345')
  const [url, options] = fetch.mock.calls[0].arguments
  assert.ok(url.includes('/sendMessage/'))
  assert.equal(options.method, 'POST')
  assert.equal(options.headers['Content-Type'], 'application/json')
  assert.deepEqual(JSON.parse(options.body), { chatId: '10000000', message })
})

test('enforces the 4096 character limit and rejects whitespace', async () => {
  const fetch = respond({ idMessage: 'message-id' })
  await assert.rejects(sendText(settings, '10000000', ' \n '), GreenApiError)
  await assert.rejects(sendText(settings, '10000000', 'а'.repeat(4097)), GreenApiError)
  assert.equal(fetch.mock.callCount(), 0)
  await sendText(settings, '10000000', 'а'.repeat(4096))
  assert.equal(fetch.mock.callCount(), 1)
})

for (const status of [400, 401, 403, 404, 429, 469, 500]) {
  test(`HTTP ${status} is not treated as success and is never retried`, async () => {
    const fetch = respond({ error: settings.apiTokenInstance }, status)
    await assert.rejects(sendText(settings, '10000000', 'Привет'), error => {
      assert.ok(error instanceof GreenApiError)
      assert.equal(error.message.includes(settings.apiTokenInstance), false)
      assert.equal(error.uncertain, status >= 500)
      return true
    })
    assert.equal(fetch.mock.callCount(), 1)
  })
}

test('a lost response is reported as uncertain without leaking the request URL', async () => {
  const fetch = mock.method(globalThis, 'fetch', async () => { throw new TypeError(`Network error ${settings.apiTokenInstance}`) })
  await assert.rejects(sendText(settings, '10000000', 'Привет'), error => {
    assert.equal(error.uncertain, true)
    assert.equal(error.message.includes(settings.apiTokenInstance), false)
    return true
  })
  assert.equal(fetch.mock.callCount(), 1)
})

test('success without idMessage is uncertain', async () => {
  respond({})
  await assert.rejects(sendText(settings, '10000000', 'Привет'), error => error.uncertain === true)
})

test('malformed JSON is not accepted as a sent message', async () => {
  mock.method(globalThis, 'fetch', async () => new Response('<html>Error</html>'))
  await assert.rejects(sendText(settings, '10000000', 'Привет'), error => error.uncertain === true)
})

test('cancelling a completed request still prevents a stale result', async () => {
  const controller = new AbortController()
  mock.method(globalThis, 'fetch', async () => {
    controller.abort()
    return Response.json({ stateInstance: 'authorized' })
  })
  await assert.rejects(checkConnection(settings, controller.signal), error => error.name === 'AbortError')
})

test('timeout is bounded and does not automatically resend', async () => {
  const controller = new AbortController()
  mock.method(AbortSignal, 'timeout', milliseconds => {
    assert.equal(milliseconds, 20_000)
    controller.abort(new DOMException('Timeout', 'TimeoutError'))
    return controller.signal
  })
  const fetch = mock.method(globalThis, 'fetch', async (_url, options) => {
    options.signal.throwIfAborted()
  })
  await assert.rejects(sendText(settings, '10000000', 'Привет'), error => error.uncertain && error.message.includes('20 секунд'))
  assert.equal(fetch.mock.callCount(), 1)
})


test('username lookup sends only username and normalizes case', async () => {
  const fetch = respond({ exist: true, chatId: '10000000', username: '@sample_user' })
  assert.equal(await resolveChat(settings, ' @Sample_User '), '10000000')
  const [, options] = fetch.mock.calls[0].arguments
  assert.deepEqual(JSON.parse(options.body), { username: '@sample_user' })
})

test('international phone lookup sends digits without imposing MAX country restrictions', async () => {
  const fetch = respond({ exist: true, chatId: '10000000' })
  await resolveChat(settings, '+44 (7911) 123456')
  assert.deepEqual(JSON.parse(fetch.mock.calls[0].arguments[1].body), { phoneNumber: 447911123456 })
})

test('missing account error explains Telegram phone privacy', async () => {
  respond({ exist: false, chatId: '' })
  await assert.rejects(resolveChat(settings, '12025550123'), /приватности.*@username/)
})

test('a group or channel cannot be opened as a personal chat', async () => {
  respond({ exist: true, chatId: '-10000000001' })
  await assert.rejects(resolveChat(settings, '@sample_channel'), /Группы и каналы не поддерживаются/)
})
