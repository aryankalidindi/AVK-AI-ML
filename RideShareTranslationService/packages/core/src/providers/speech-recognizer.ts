export type RecognitionCallback = (text: string, isFinal: boolean) => void

export interface SpeechRecognizer {
  start(onResult: RecognitionCallback): void
  stop(): void
}

/** Emits a fixed queue of phrases. Useful for offline demos and tests. */
export class MockSpeechRecognizer implements SpeechRecognizer {
  private stopped = false
  private readonly phrases: string[]

  constructor(phrases: string[] = []) {
    this.phrases = phrases
  }

  start(onResult: RecognitionCallback): void {
    if (this.stopped) return
    for (const phrase of this.phrases) onResult(phrase, true)
  }

  stop(): void {
    this.stopped = true
  }
}
