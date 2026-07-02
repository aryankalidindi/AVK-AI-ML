import type { Language } from '../session/types'

export interface TranslationRequest {
  text: string
  sourceLang: Language
  targetLang: Language
}

export interface TranslationResult {
  text: string
  sourceLang: Language
  targetLang: Language
}

export interface Translator {
  translate(input: TranslationRequest): Promise<TranslationResult>
}

/** Small bidirectional phrase book for offline demos. Keys are lowercase. */
const PHRASES: Record<string, Record<string, string>> = {
  'en->id': {
    'thank you': 'terima kasih',
    'hello': 'halo',
    'turn left': 'belok kiri',
    'turn right': 'belok kanan',
    'stop here': 'berhenti di sini',
    'how much': 'berapa harganya',
  },
  'id->en': {
    'terima kasih': 'thank you',
    'halo': 'hello',
    'belok kiri': 'turn left',
    'belok kanan': 'turn right',
    'berhenti di sini': 'stop here',
    'berapa harganya': 'how much',
  },
}

export class MockTranslator implements Translator {
  async translate(input: TranslationRequest): Promise<TranslationResult> {
    const { text, sourceLang, targetLang } = input
    if (sourceLang === targetLang) {
      return { text, sourceLang, targetLang }
    }
    const table = PHRASES[`${sourceLang}->${targetLang}`]
    const hit = table?.[text.trim().toLowerCase()]
    return {
      text: hit ?? `[${targetLang}] ${text}`,
      sourceLang,
      targetLang,
    }
  }
}
