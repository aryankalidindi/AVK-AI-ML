import { describe, it, expect } from 'vitest'
import { mockTranslate } from './mock-translator'

describe('mockTranslate', () => {
  it('translates a known phrase id->en (case-insensitive)', () => {
    expect(mockTranslate({ text: 'Terima Kasih', sourceLang: 'id', targetLang: 'en' })).toBe('thank you')
  })

  it('returns a tagged passthrough for unknown phrases', () => {
    expect(mockTranslate({ text: 'quantum', sourceLang: 'en', targetLang: 'id' })).toBe('[id] quantum')
  })

  it('returns text unchanged when languages match', () => {
    expect(mockTranslate({ text: 'hello', sourceLang: 'en', targetLang: 'en' })).toBe('hello')
  })
})
