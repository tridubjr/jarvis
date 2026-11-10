import type { AskHandlers, Msg } from './anthropic'

let active: AbortController | null = null

type CloudReply = { text?: string; tools?: string[]; error?: string }

/** The hosted Worker owns the Gemini key. The browser only talks to this app's own origin. */
export async function ask(
  prompt: string,
  history: Msg[],
  handlers: AskHandlers,
): Promise<{ text: string; tools: string[] }> {
  active?.abort()
  const controller = new AbortController()
  active = controller

  const safeHistory = history
    .slice(-20)
    .filter((message) => typeof message.content === 'string')
    .map((message) => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      content: message.content as string,
    }))

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt, history: safeHistory }),
      signal: controller.signal,
    })

    let result: CloudReply
    try {
      result = (await response.json()) as CloudReply
    } catch {
      throw new Error('JARVIS received an unreadable response from the cloud service.')
    }

    if (!response.ok) {
      throw new Error(result.error || 'JARVIS could not reach his cloud brain.')
    }

    const text = typeof result.text === 'string' ? result.text : ''
    if (!text) throw new Error('Gemini returned an empty response.')

    if (!controller.signal.aborted) handlers.onText(text)
    return { text, tools: Array.isArray(result.tools) ? result.tools : [] }
  } catch (error) {
    if (controller.signal.aborted) return { text: '', tools: [] }
    throw error
  } finally {
    if (active === controller) active = null
  }
}

export function cancel(): void {
  active?.abort()
  active = null
}

export async function warm(): Promise<void> {
  const response = await fetch('/api/health', { cache: 'no-store' })
  if (!response.ok) throw new Error('JARVIS cloud service is not responding.')
  const health = (await response.json()) as { configured?: boolean }
  if (!health.configured) {
    throw new Error('JARVIS cloud brain is not configured yet. The Gemini key has not been added to the secure server.')
  }
}
