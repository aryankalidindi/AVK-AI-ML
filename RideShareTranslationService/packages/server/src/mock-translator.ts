// Offline fallback used when ANTHROPIC_API_KEY is not set. Intentionally a small
// self-contained phrasebook (not imported from @rst/core) so the server stays
// runnable directly by Node's strip-types loader, which needs explicit file
// extensions that the core source does not use.

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

export function mockTranslate(input: {
  text: string
  sourceLang: string
  targetLang: string
}): string {
  const { text, sourceLang, targetLang } = input
  if (sourceLang === targetLang) return text
  const table = PHRASES[`${sourceLang}->${targetLang}`]
  const hit = table?.[text.trim().toLowerCase()]
  return hit ?? `[${targetLang}] ${text}`
}
