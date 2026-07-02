import { describe, it, expect, vi } from 'vitest'
import { MockSpeechRecognizer } from './speech-recognizer'
import { MockSpeechSynthesizer } from './speech-synthesizer'

describe('MockSpeechRecognizer', () => {
  it('emits queued phrases as final results when start() is called', () => {
    const rec = new MockSpeechRecognizer(['halo', 'terima kasih'])
    const results: Array<{ text: string; isFinal: boolean }> = []
    rec.start((text, isFinal) => results.push({ text, isFinal }))
    expect(results).toEqual([
      { text: 'halo', isFinal: true },
      { text: 'terima kasih', isFinal: true },
    ])
  })

  it('does not emit after stop()', () => {
    const rec = new MockSpeechRecognizer(['halo'])
    rec.stop()
    const cb = vi.fn()
    rec.start(cb)
    expect(cb).not.toHaveBeenCalled()
  })
})

describe('MockSpeechSynthesizer', () => {
  it('records spoken text and language', async () => {
    const synth = new MockSpeechSynthesizer()
    await synth.speak('hello', 'en')
    expect(synth.spoken).toEqual([{ text: 'hello', lang: 'en' }])
  })
})
