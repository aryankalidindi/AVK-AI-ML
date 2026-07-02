import { describe, it, expect } from 'vitest'
import { createSessionMessage } from './messages'

describe('createSessionMessage', () => {
  it('builds an immutable message with a fixed clock', () => {
    const msg = createSessionMessage(
      { sessionId: 'abc', senderRole: 'rider', sourceLang: 'en', text: 'hello' },
      () => 1000,
    )
    expect(msg).toEqual({
      sessionId: 'abc',
      senderRole: 'rider',
      sourceLang: 'en',
      text: 'hello',
      timestamp: 1000,
    })
  })

  it('trims surrounding whitespace from text', () => {
    const msg = createSessionMessage(
      { sessionId: 'abc', senderRole: 'driver', sourceLang: 'id', text: '  halo  ' },
      () => 0,
    )
    expect(msg.text).toBe('halo')
  })

  it('throws on empty text after trim', () => {
    expect(() =>
      createSessionMessage(
        { sessionId: 'abc', senderRole: 'driver', sourceLang: 'id', text: '   ' },
        () => 0,
      ),
    ).toThrow('text must not be empty')
  })
})
