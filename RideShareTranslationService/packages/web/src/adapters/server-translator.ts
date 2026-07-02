import type { GlossaryPair } from '@rst/core'
import type { ContextTurn } from '../lib/translation'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8787'

/**
 * Calls the server's context-aware /translate endpoint. Returns null when the
 * server has no translator (503) or is unreachable, so the caller can fall back
 * to the free client-side translator.
 */
export async function serverTranslate(
  text: string,
  sourceLang: string,
  targetLang: string,
  context: ContextTurn[],
  glossary: GlossaryPair[],
): Promise<string | null> {
  try {
    const res = await fetch(`${API_URL}/translate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, sourceLang, targetLang, context, glossary }),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { text?: string }
    return typeof data.text === 'string' && data.text.length > 0 ? data.text : null
  } catch {
    return null
  }
}
