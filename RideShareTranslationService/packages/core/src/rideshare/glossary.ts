// A small fixed glossary of rideshare/app terms and Bali place names that should
// translate a specific way (or stay verbatim). Pure and local — no network, no
// keys. Used to (a) hint the Claude translator and (b) enforce the term on the
// machine-translated output as a safety net.

export interface GlossaryPair {
  from: string
  to: string
}

interface GlossaryEntry {
  // A canonical term keyed by language code. Missing languages fall back to `en`.
  [lang: string]: string
}

// Place names are identical across languages (kept verbatim); app terms differ.
export const GLOSSARY: GlossaryEntry[] = [
  { en: 'pickup point', id: 'titik jemput', es: 'punto de recogida', fr: 'point de prise en charge', ja: '乗車地点' },
  { en: 'drop-off', id: 'titik turun', es: 'punto de bajada', fr: 'point de dépose', ja: '降車地点' },
  { en: 'surge pricing', id: 'tarif lonjakan', es: 'tarifa dinámica', fr: 'tarif majoré', ja: '割増料金' },
  { en: 'Ngurah Rai Airport', id: 'Ngurah Rai Airport', es: 'Ngurah Rai Airport', fr: 'Ngurah Rai Airport', ja: 'Ngurah Rai Airport' },
  { en: 'Kuta', id: 'Kuta', es: 'Kuta', fr: 'Kuta', ja: 'Kuta' },
  { en: 'Seminyak', id: 'Seminyak', es: 'Seminyak', fr: 'Seminyak', ja: 'Seminyak' },
  { en: 'Ubud', id: 'Ubud', es: 'Ubud', fr: 'Ubud', ja: 'Ubud' },
  { en: 'Canggu', id: 'Canggu', es: 'Canggu', fr: 'Canggu', ja: 'Canggu' },
  { en: 'Sanur', id: 'Sanur', es: 'Sanur', fr: 'Sanur', ja: 'Sanur' },
]

function termFor(entry: GlossaryEntry, lang: string): string | undefined {
  return entry[lang] ?? entry.en
}

/** The source→target term pairs relevant to a translation direction. */
export function glossaryPairs(sourceLang: string, targetLang: string): GlossaryPair[] {
  if (sourceLang === targetLang) return []
  const pairs: GlossaryPair[] = []
  for (const entry of GLOSSARY) {
    const from = termFor(entry, sourceLang)
    const to = termFor(entry, targetLang)
    if (from && to && from !== to) pairs.push({ from, to })
  }
  return pairs
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Replaces any lingering source glossary term in already-translated text with the
 * canonical target term. Catches the common case where a machine translator left
 * an app term or place name untranslated (or mistranslated). Longest terms first
 * so multi-word entries win over their substrings.
 */
export function enforceGlossary(text: string, pairs: GlossaryPair[]): string {
  const ordered = [...pairs].sort((a, b) => b.from.length - a.from.length)
  let result = text
  for (const { from, to } of ordered) {
    const re = new RegExp(`\\b${escapeRegExp(from)}\\b`, 'gi')
    result = result.replace(re, to)
  }
  return result
}
