import { describe, it, expect } from 'vitest'
import { MockTranslator } from './translator'

describe('MockTranslator', () => {
  const t = new MockTranslator()

  it('returns text unchanged when source equals target', async () => {
    const r = await t.translate({ text: 'hello', sourceLang: 'en', targetLang: 'en' })
    expect(r.text).toBe('hello')
    expect(r.sourceLang).toBe('en')
    expect(r.targetLang).toBe('en')
  })

  it('translates known dictionary phrases id->en', async () => {
    const r = await t.translate({ text: 'terima kasih', sourceLang: 'id', targetLang: 'en' })
    expect(r.text).toBe('thank you')
  })

  it('translates known dictionary phrases en->id', async () => {
    const r = await t.translate({ text: 'thank you', sourceLang: 'en', targetLang: 'id' })
    expect(r.text).toBe('terima kasih')
  })

  it('falls back to a tagged passthrough for unknown phrases', async () => {
    const r = await t.translate({ text: 'quantum', sourceLang: 'en', targetLang: 'id' })
    expect(r.text).toBe('[id] quantum')
  })

  it('is case-insensitive for dictionary lookups', async () => {
    const r = await t.translate({ text: 'Terima Kasih', sourceLang: 'id', targetLang: 'en' })
    expect(r.text).toBe('thank you')
  })
})
