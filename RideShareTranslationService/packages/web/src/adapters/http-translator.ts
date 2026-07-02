import type { Translator, TranslationRequest, TranslationResult } from '@rst/core'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8787'

/**
 * Sends translation requests to the relay server's /translate endpoint, which
 * holds the Anthropic API key (Claude) or falls back to the offline mock.
 * Falls back to a tagged passthrough if the server is unreachable so the UI
 * never breaks mid-conversation.
 */
export class HttpTranslator implements Translator {
  async translate(input: TranslationRequest): Promise<TranslationResult> {
    const { text, sourceLang, targetLang } = input
    if (sourceLang === targetLang) return { text, sourceLang, targetLang }

    try {
      const res = await fetch(`${API_URL}/translate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text, sourceLang, targetLang }),
      })
      if (!res.ok) throw new Error(`translate failed: ${res.status}`)
      const data = (await res.json()) as { text?: string }
      return {
        text: data.text ?? `[${targetLang}] ${text}`,
        sourceLang,
        targetLang,
      }
    } catch {
      return { text: `[${targetLang}] ${text}`, sourceLang, targetLang }
    }
  }
}
