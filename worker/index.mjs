const SYSTEM_PROMPT = `You are JARVIS, a capable personal assistant with a calm, precise, lightly witty British manner. Speak naturally and concisely because your replies will be read aloud. Do not claim to have performed actions unless a connected tool has actually performed them. In this first cloud build, you have no external tools yet: you can answer questions and help plan, but you cannot access the user's calendar, phone, files, or other accounts. Never ask the user to paste passwords, API keys, or verification codes.`

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  })
}

function validHistory(history) {
  if (!Array.isArray(history)) return []
  return history
    .slice(-20)
    .filter(
      (message) =>
        message &&
        (message.role === 'user' || message.role === 'model') &&
        typeof message.content === 'string' &&
        message.content.length <= 4000,
    )
    .map((message) => ({
      role: message.role,
      parts: [{ text: message.content }],
    }))
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    if (url.pathname === '/api/health' && request.method === 'GET') {
      return json({ ok: true, brain: 'gemini', configured: Boolean(env.GEMINI_API_KEY) })
    }

    if (url.pathname === '/api/chat' && request.method === 'POST') {
      // This endpoint is same-origin only. Cloudflare Access must also protect
      // the deployed site before it is made public; Origin checks alone are
      // not an authentication system.
      const origin = request.headers.get('Origin')
      if (!origin || origin !== url.origin) {
        return json({ error: 'Request origin not allowed.' }, 403)
      }

      if (!env.GEMINI_API_KEY) {
        return json({ error: 'JARVIS is not configured yet. The Gemini key is missing.' }, 503)
      }

      const declaredLength = Number(request.headers.get('Content-Length') || 0)
      if (declaredLength > 24_000) {
        return json({ error: 'That request is too large.' }, 413)
      }

      let body
      try {
        const raw = await request.text()
        if (raw.length > 24_000) return json({ error: 'That request is too large.' }, 413)
        body = JSON.parse(raw)
      } catch {
        return json({ error: 'I could not read that request.' }, 400)
      }

      if (!body || typeof body.prompt !== 'string' || !body.prompt.trim() || body.prompt.length > 4000) {
        return json({ error: 'Please send a message under 4,000 characters.' }, 400)
      }

      const contents = validHistory(body.history)
      contents.push({ role: 'user', parts: [{ text: body.prompt.trim() }] })

      const model = env.GEMINI_MODEL || 'gemini-2.5-flash'
      let upstream
      try {
        upstream = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
              contents,
              generationConfig: { temperature: 0.7, maxOutputTokens: 500 },
            }),
          },
        )
      } catch {
        return json({ error: 'I could not reach the Gemini service. Please try again.' }, 502)
      }

      if (!upstream.ok) {
        // Do not forward upstream response bodies: they can contain account,
        // request, or configuration details that should not reach the browser.
        const status = upstream.status === 429 ? 429 : 502
        return json({
          error:
            upstream.status === 429
              ? 'Gemini is at its free usage limit for now. Please try again later.'
              : 'Gemini could not complete that request. Please try again shortly.',
        }, status)
      }

      let result
      try {
        result = await upstream.json()
      } catch {
        return json({ error: 'Gemini returned an unreadable response.' }, 502)
      }

      const answer = result?.candidates?.[0]?.content?.parts
        ?.map((part) => (typeof part.text === 'string' ? part.text : ''))
        .join('')
        .trim()

      if (!answer) {
        return json({ error: 'Gemini did not return a response. Please try again.' }, 502)
      }

      return json({ text: answer, tools: [] })
    }

    // Static frontend assets are served by Cloudflare Workers Assets.
    return env.ASSETS.fetch(request)
  },
}
