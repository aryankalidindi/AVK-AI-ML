import { describe, it, expect } from 'vitest'
import { TranslationPipeline } from './pipeline'
import { MockTranslator } from '../providers/translator'
import { MockSpeechSynthesizer } from '../providers/speech-synthesizer'
import { CurrencyTransform } from '../transforms/currency-transform'
import { MockRateProvider } from '../providers/rate-provider'
import type { SessionMessage } from '../session/types'

const incoming = (text: string, sourceLang = 'id'): SessionMessage => ({
  sessionId: 's1',
  senderRole: 'driver',
  sourceLang,
  text,
  timestamp: 1,
})

describe('TranslationPipeline', () => {
  it('translates an incoming message into the recipient language and speaks it', async () => {
    const synth = new MockSpeechSynthesizer()
    const pipeline = new TranslationPipeline({
      translator: new MockTranslator(),
      synthesizer: synth,
      transforms: [],
    })
    const result = await pipeline.receive(incoming('terima kasih'), {
      recipient: { role: 'rider', language: 'en' },
    })
    expect(result.translatedText).toBe('thank you')
    expect(result.sourceText).toBe('terima kasih')
    expect(synth.spoken).toEqual([{ text: 'thank you', lang: 'en' }])
  })

  it('applies transforms after translation', async () => {
    const synth = new MockSpeechSynthesizer()
    const pipeline = new TranslationPipeline({
      translator: new MockTranslator(),
      synthesizer: synth,
      transforms: [new CurrencyTransform(new MockRateProvider())],
    })
    const result = await pipeline.receive(incoming('Rp50.000'), {
      recipient: { role: 'rider', language: 'en' },
    })
    expect(result.translatedText).toBe('[en] Rp50.000 (~$3.11 USD)')
  })

  it('skips synthesis when speak is disabled', async () => {
    const synth = new MockSpeechSynthesizer()
    const pipeline = new TranslationPipeline({
      translator: new MockTranslator(),
      synthesizer: synth,
      transforms: [],
      speak: false,
    })
    await pipeline.receive(incoming('halo'), { recipient: { role: 'rider', language: 'en' } })
    expect(synth.spoken).toHaveLength(0)
  })
})
