import Anthropic from '@anthropic-ai/sdk'

export interface ContextMessage {
  role: 'driver' | 'rider'
  text: string
}

export interface GlossaryPair {
  from: string
  to: string
}

export interface TranslateInput {
  text: string
  sourceLang: string
  targetLang: string
  context?: ContextMessage[]
  glossary?: GlossaryPair[]
}

export type TranslateFn = (input: TranslateInput) => Promise<string>

/** Minimal slice of the Anthropic SDK we depend on — keeps the translator testable. */
export interface MessageClient {
  messages: {
    create(body: unknown): Promise<{ content: Array<{ type: string; text?: string }> }>
  }
}

const LANG_NAMES: Record<string, string> = {
  en: 'English',
  id: 'Indonesian (Bahasa Indonesia)',
  es: 'Spanish',
  fr: 'French',
  ja: 'Japanese',
}

function langName(code: string): string {
  return LANG_NAMES[code] ?? code
}

function buildSystem(sourceLang: string, targetLang: string): string {
  const src = langName(sourceLang)
  const tgt = langName(targetLang)
  return (
    `You are the live translation engine inside a rideshare app, translating a ` +
    `real-time chat between a driver and a rider from ${src} to ${tgt}.\n\n` +
    `Translate what the speaker actually MEANS, phrased the way a native ${tgt} ` +
    `speaker would naturally say it in a quick spoken exchange with their driver or ` +
    `rider: casual and colloquial, using contractions and everyday register, and ` +
    `localizing idioms, slang, and politeness so it sounds natural — never ` +
    `word-for-word or stiffly formal. Keep it about as short as the original.\n\n` +
    `Use the recent conversation only to resolve references (pronouns, "here", "it", ` +
    `implied subjects). Do not translate, repeat, or answer it.\n\n` +
    `Preserve names, numbers, and currency amounts exactly as written. Output ONLY the ` +
    `translation — no quotes, no notes, no preamble.`
  )
}

function buildUser(input: TranslateInput): string {
  const parts: string[] = []
  if (input.glossary && input.glossary.length > 0) {
    const lines = input.glossary.map((g) => `"${g.from}" → "${g.to}"`).join('\n')
    parts.push(`Always translate these terms exactly as given:\n${lines}\n`)
  }
  if (input.context && input.context.length > 0) {
    const lines = input.context.map((m) => `${m.role}: ${m.text}`).join('\n')
    parts.push(`Recent conversation (context only):\n${lines}\n`)
  }
  parts.push(`Message to translate:\n${input.text}`)
  return parts.join('\n')
}

/**
 * Context- and register-aware Claude translator. The model defaults to a fast
 * one (translation is latency-sensitive, not a reasoning task), so no thinking
 * or effort parameters are used.
 */
export function createClaudeTranslate(client: MessageClient, model: string): TranslateFn {
  return async (input) => {
    if (input.sourceLang === input.targetLang) return input.text
    const response = await client.messages.create({
      model,
      max_tokens: 400,
      system: buildSystem(input.sourceLang, input.targetLang),
      messages: [{ role: 'user', content: buildUser(input) }],
    })
    const block = response.content.find((b) => b.type === 'text')
    const out = block?.text?.trim()
    return out && out.length > 0 ? out : input.text
  }
}

export function createAnthropicClient(apiKey: string): MessageClient {
  return new Anthropic({ apiKey }) as unknown as MessageClient
}
