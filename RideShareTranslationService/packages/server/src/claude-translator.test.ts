import { describe, it, expect, vi } from 'vitest'
import { createClaudeTranslate, type MessageClient } from './claude-translator'

function fakeClient(reply: string): { client: MessageClient; calls: any[] } {
  const calls: any[] = []
  const client: MessageClient = {
    messages: {
      create: vi.fn(async (body: unknown) => {
        calls.push(body)
        return { content: [{ type: 'text', text: reply }] }
      }),
    },
  }
  return { client, calls }
}

describe('createClaudeTranslate', () => {
  it('returns the trimmed text from the first text block', async () => {
    const { client } = fakeClient('  thank you  ')
    const translate = createClaudeTranslate(client, 'claude-haiku-4-5')
    const out = await translate({ text: 'terima kasih', sourceLang: 'id', targetLang: 'en' })
    expect(out).toBe('thank you')
  })

  it('short-circuits without calling the API when languages match', async () => {
    const { client, calls } = fakeClient('unused')
    const translate = createClaudeTranslate(client, 'claude-haiku-4-5')
    const out = await translate({ text: 'hello', sourceLang: 'en', targetLang: 'en' })
    expect(out).toBe('hello')
    expect(calls).toHaveLength(0)
  })

  it('sends the configured model and the message inside the user turn', async () => {
    const { client, calls } = fakeClient('halo')
    const translate = createClaudeTranslate(client, 'claude-haiku-4-5')
    await translate({ text: 'hello', sourceLang: 'en', targetLang: 'id' })
    const body = calls[0]
    expect(body.model).toBe('claude-haiku-4-5')
    expect(body.messages[0].role).toBe('user')
    expect(body.messages[0].content).toContain('hello')
  })

  it('falls back to the original text when the response has no text block', async () => {
    const client: MessageClient = {
      messages: { create: async () => ({ content: [] }) },
    }
    const translate = createClaudeTranslate(client, 'claude-haiku-4-5')
    const out = await translate({ text: 'halo', sourceLang: 'id', targetLang: 'en' })
    expect(out).toBe('halo')
  })
})

describe('context-aware translate', () => {
  it('includes a register instruction and both language names in the system prompt', async () => {
    const { client, calls } = fakeClient('¿dónde te recojo?')
    const t = createClaudeTranslate(client, 'claude-haiku-4-5')
    const out = await t({ text: 'where should I pick you up', sourceLang: 'en', targetLang: 'es' })
    expect(out).toBe('¿dónde te recojo?')
    const sys = (calls[0].system as string).toLowerCase()
    expect(sys).toContain('english')
    expect(sys).toContain('spanish')
    expect(sys).toMatch(/casual|colloquial|natural|native/)
  })

  it('passes recent conversation context into the user message', async () => {
    const { client, calls } = fakeClient('ok')
    const t = createClaudeTranslate(client, 'claude-haiku-4-5')
    await t({
      text: 'here is fine',
      sourceLang: 'en',
      targetLang: 'id',
      context: [
        { role: 'driver', text: 'where to?' },
        { role: 'rider', text: 'the airport' },
      ],
    })
    const userContent = calls[0].messages[0].content as string
    expect(userContent).toContain('the airport')
    expect(userContent).toContain('here is fine')
  })
})
