import type { Language } from '../session/types'

export interface SpeechSynthesizer {
  speak(text: string, lang: Language): Promise<void>
}

/** No-op synthesizer that records calls for assertions. */
export class MockSpeechSynthesizer implements SpeechSynthesizer {
  readonly spoken: Array<{ text: string; lang: Language }> = []
  async speak(text: string, lang: Language): Promise<void> {
    this.spoken.push({ text, lang })
  }
}
