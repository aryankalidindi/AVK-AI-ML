import { CurrencyTransform, glossaryPairs, enforceGlossary } from '@rst/core'
import { FreeTranslator } from '../adapters/free-translator'
import { FxRateProvider } from '../adapters/fx-rate-provider'
import { serverTranslate } from '../adapters/server-translator'

export interface ContextTurn {
  role: 'driver' | 'rider'
  text: string
}

// Shared instances: one FX provider (cached) feeds both the currency transform
// (chat annotations) and the fare's USD display.
export const fxRates = new FxRateProvider()
const translator = new FreeTranslator()
const currency = new CurrencyTransform(fxRates)

/**
 * Translate an incoming message into the recipient's language, then annotate any
 * Rupiah amounts with a USD estimate. Prefers the server's context-aware Claude
 * translator (natural, colloquial, uses recent turns); falls back to the free
 * gtx translator when the server has no key or is unreachable.
 */
export async function translateMessage(
  text: string,
  sourceLang: string,
  targetLang: string,
  context: ContextTurn[] = [],
): Promise<string> {
  let translated: string
  if (sourceLang === targetLang) {
    translated = text
  } else {
    const glossary = glossaryPairs(sourceLang, targetLang)
    translated =
      (await serverTranslate(text, sourceLang, targetLang, context, glossary)) ??
      (await translator.translate({ text, sourceLang, targetLang })).text
    // Safety net: fix any glossary term the engine left untranslated.
    translated = enforceGlossary(translated, glossary)
  }
  return currency.apply(translated, { recipient: { role: 'rider', language: targetLang } })
}
