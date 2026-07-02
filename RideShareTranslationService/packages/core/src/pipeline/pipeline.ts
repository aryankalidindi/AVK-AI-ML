import type { Translator } from '../providers/translator'
import type { SpeechSynthesizer } from '../providers/speech-synthesizer'
import type { Transform, PipelineContext } from '../transforms/types'
import type { SessionMessage } from '../session/types'

export interface PipelineDeps {
  translator: Translator
  synthesizer: SpeechSynthesizer
  transforms: Transform[]
  /** Speak the translated text aloud on delivery. Default true. */
  speak?: boolean
}

export interface DeliveredMessage {
  sourceText: string
  translatedText: string
  sourceLang: string
  targetLang: string
}

export class TranslationPipeline {
  private readonly deps: PipelineDeps

  constructor(deps: PipelineDeps) {
    this.deps = deps
  }

  async receive(
    message: SessionMessage,
    ctx: PipelineContext,
  ): Promise<DeliveredMessage> {
    const targetLang = ctx.recipient.language

    const translated = await this.deps.translator.translate({
      text: message.text,
      sourceLang: message.sourceLang,
      targetLang,
    })

    let finalText = translated.text
    for (const transform of this.deps.transforms) {
      finalText = await transform.apply(finalText, ctx)
    }

    if (this.deps.speak !== false) {
      await this.deps.synthesizer.speak(finalText, targetLang)
    }

    return {
      sourceText: message.text,
      translatedText: finalText,
      sourceLang: message.sourceLang,
      targetLang,
    }
  }
}
