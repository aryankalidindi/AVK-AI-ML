// Forward-looking: a single real API may later replace STT+translate+TTS.
import type { Language } from '../session/types'

export interface StreamingConfig {
  sourceLang: Language
  targetLang: Language
}

export interface StreamingSession {
  pushAudio(chunk: Uint8Array): void
  onTranslatedText(cb: (text: string) => void): void
  onTranslatedAudio(cb: (chunk: Uint8Array) => void): void
  close(): void
}

export interface StreamingTranslationProvider {
  openSession(config: StreamingConfig): StreamingSession
}
