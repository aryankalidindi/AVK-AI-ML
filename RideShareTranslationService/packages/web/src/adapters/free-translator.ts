import type { Translator, TranslationRequest, TranslationResult } from '@rst/core'

// Google's public gtx endpoint: free, keyless, high quality, and — crucially —
// sends `access-control-allow-origin: *`, so it is callable from the browser.
const ENDPOINT = 'https://translate.googleapis.com/translate_a/single'

export class FreeTranslator implements Translator {
  async translate(input: TranslationRequest): Promise<TranslationResult> {
    const { text, sourceLang, targetLang } = input
    if (sourceLang === targetLang || text.trim().length === 0) {
      return { text, sourceLang, targetLang }
    }
    try {
      const url =
        `${ENDPOINT}?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`
      const res = await fetch(url)
      if (!res.ok) throw new Error(`translate ${res.status}`)
      const data = (await res.json()) as unknown
      const translated = parseGtx(data)
      return { text: translated || text, sourceLang, targetLang }
    } catch {
      // Graceful fallback: show the original so the chat never breaks.
      return { text, sourceLang, targetLang }
    }
  }
}

// gtx returns [[["translated","source",...],...], ...]; join every segment[0].
function parseGtx(data: unknown): string {
  if (!Array.isArray(data) || !Array.isArray(data[0])) return ''
  return (data[0] as unknown[])
    .map((seg) => (Array.isArray(seg) && typeof seg[0] === 'string' ? seg[0] : ''))
    .join('')
}
