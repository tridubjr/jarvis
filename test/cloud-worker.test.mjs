import assert from 'node:assert/strict'
import { test } from 'node:test'
import worker from '../worker/index.mjs'

test('health reports whether the server-side Gemini key is configured', async () => {
  const response = await worker.fetch(
    new Request('https://jarvis.example/api/health'),
    { GEMINI_API_KEY: 'server-only-test-key' },
  )
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    ok: true,
    brain: 'gemini',
    configured: true,
  })
})

test('chat rejects requests from an unexpected origin', async () => {
  const response = await worker.fetch(
    new Request('https://jarvis.example/api/chat', {
      method: 'POST',
      headers: {
        Origin: 'https://attacker.example',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt: 'Hello' }),
    }),
    { GEMINI_API_KEY: 'server-only-test-key' },
  )
  assert.equal(response.status, 403)
})

test('chat sends the Gemini key in a server-side header, not the URL', async () => {
  const originalFetch = globalThis.fetch
  let requestUrl = ''
  let requestHeaders
  globalThis.fetch = async (url, init = {}) => {
    requestUrl = String(url)
    requestHeaders = new Headers(init.headers)
    return new Response(
      JSON.stringify({
        candidates: [{ content: { parts: [{ text: 'Good afternoon.' }] } }],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  }

  try {
    const response = await worker.fetch(
      new Request('https://jarvis.example/api/chat', {
        method: 'POST',
        headers: {
          Origin: 'https://jarvis.example',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: 'Hello, Jarvis.',
          history: [{ role: 'user', content: 'Are you online?' }],
        }),
      }),
      { GEMINI_API_KEY: 'server-only-test-key' },
    )
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { text: 'Good afternoon.', tools: [] })
    assert.equal(requestHeaders.get('x-goog-api-key'), 'server-only-test-key')
    assert.equal(requestUrl.includes('server-only-test-key'), false)
  } finally {
    globalThis.fetch = originalFetch
  }
})
