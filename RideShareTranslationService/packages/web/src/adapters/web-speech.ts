// WebSpeechRecognizer streams audio to the browser vendor's speech service
// (Chrome -> Google). Requires a secure context (localhost or https) and mic
// permission. Not supported in Firefox.
import type {
  SpeechRecognizer,
  RecognitionCallback,
  SpeechSynthesizer,
  Language,
} from '@rst/core'

// Minimal typing for the (non-standard-lib) Web Speech API surface we use.
interface SpeechAlternative { transcript: string }
interface SpeechResult { 0: SpeechAlternative; isFinal: boolean }
interface SpeechResultList { length: number; [index: number]: SpeechResult }
interface SpeechResultEvent { resultIndex: number; results: SpeechResultList }
interface SpeechErrorEvent { error: string }
interface Recognition {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((e: SpeechResultEvent) => void) | null
  onerror: ((e: SpeechErrorEvent) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
}
type RecognitionCtor = new () => Recognition

export type RecognitionErrorCallback = (error: string) => void

export class WebSpeechRecognizer implements SpeechRecognizer {
  private recognition: Recognition

  constructor(lang: Language) {
    const g = globalThis as unknown as {
      SpeechRecognition?: RecognitionCtor
      webkitSpeechRecognition?: RecognitionCtor
    }
    const Ctor = g.SpeechRecognition ?? g.webkitSpeechRecognition
    if (!Ctor) throw new Error('unsupported')
    this.recognition = new Ctor()
    this.recognition.lang = lang
    this.recognition.interimResults = true
    // One utterance per press: stop after the first final result (push-to-talk).
    this.recognition.continuous = false
  }

  start(onResult: RecognitionCallback, onError?: RecognitionErrorCallback, onEnd?: () => void): void {
    this.recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i]
        if (res) onResult(res[0].transcript, res.isFinal)
      }
    }
    this.recognition.onerror = (e) => onError?.(e.error || 'error')
    this.recognition.onend = () => onEnd?.()
    try {
      this.recognition.start()
    } catch {
      onError?.('start-failed')
    }
  }

  stop(): void {
    try {
      this.recognition.stop()
    } catch {
      /* already stopped */
    }
  }
}

export class WebSpeechSynthesizer implements SpeechSynthesizer {
  async speak(text: string, lang: Language): Promise<void> {
    return new Promise((resolve) => {
      const utter = new SpeechSynthesisUtterance(text)
      utter.lang = lang
      utter.onend = () => resolve()
      utter.onerror = () => resolve()
      speechSynthesis.speak(utter)
    })
  }
}
