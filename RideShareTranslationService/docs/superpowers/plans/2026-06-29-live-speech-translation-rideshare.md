# Live Speech Translation Rideshare POC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a web POC where two participants (driver/rider) hold a live, bidirectional speech-translated conversation, with all speech/translation/currency logic behind swappable provider interfaces and a 100% offline mock default build.

**Architecture:** A platform-agnostic TypeScript `core` package (pipeline + provider interfaces + mocks, no DOM/no network), a `web` React app that wires browser mic/speakers into the core, and a dumb Node WebSocket `server` that relays session messages between two clients in a room. Translation happens receiver-side; the same pipeline runs symmetrically on both ends. Currency conversion is an optional pipeline transform.

**Tech Stack:** TypeScript, npm workspaces, Vite + React, Node + `ws`, Vitest, Playwright.

---

## File Structure

```
package.json                         ← workspace root
tsconfig.base.json                   ← shared TS config
vitest.config.ts                     ← root test config (core + server)
packages/
├── core/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── session/
│       │   ├── types.ts             ← Role, Language, SessionMessage, etc.
│       │   └── messages.ts          ← createSessionMessage()
│       ├── providers/
│       │   ├── speech-recognizer.ts ← SpeechRecognizer interface + MockSpeechRecognizer
│       │   ├── translator.ts        ← Translator interface + types + MockTranslator
│       │   ├── speech-synthesizer.ts← SpeechSynthesizer interface + MockSpeechSynthesizer
│       │   ├── rate-provider.ts     ← RateProvider interface + MockRateProvider
│       │   └── streaming.ts         ← StreamingTranslationProvider interface (forward-looking)
│       ├── transforms/
│       │   ├── types.ts             ← Transform interface, PipelineContext
│       │   └── currency-transform.ts← CurrencyTransform
│       ├── pipeline/
│       │   └── pipeline.ts          ← TranslationPipeline
│       └── index.ts                 ← public exports
├── server/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── rooms.ts                 ← RoomRegistry (pure, testable)
│       └── server.ts                ← WebSocket relay wiring
└── web/
    ├── package.json
    ├── tsconfig.json
    ├── index.html
    ├── vite.config.ts
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── transport/useSession.ts  ← WebSocket client hook
        ├── adapters/web-speech.ts    ← WebSpeechRecognizer/WebSpeechSynthesizer (opt-in)
        ├── components/
        │   ├── Lobby.tsx             ← create/join room, pick role+language
        │   ├── Conversation.tsx      ← transcript + mic button
        │   └── conversation.css
        └── styles/tokens.css
e2e/
├── playwright.config.ts
└── conversation.spec.ts
```

---

## Task 1: Workspace scaffolding

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `vitest.config.ts`, `.gitignore` (exists, verify)

- [ ] **Step 1: Create root `package.json`**

```json
{
  "name": "rideshare-translation",
  "private": true,
  "type": "module",
  "workspaces": ["packages/*"],
  "scripts": {
    "test": "vitest run",
    "dev:server": "npm -w @rst/server run dev",
    "dev:web": "npm -w @rst/web run dev"
  },
  "devDependencies": {
    "typescript": "^5.5.4",
    "vitest": "^2.0.5",
    "@types/node": "^22.5.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "resolveJsonModule": true
  }
}
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['packages/{core,server}/src/**/*.test.ts'],
    coverage: { provider: 'v8', include: ['packages/{core,server}/src/**/*.ts'] },
  },
})
```

- [ ] **Step 4: Install and verify**

Run: `npm install`
Expected: completes without error, creates `node_modules/`.

- [ ] **Step 5: Commit**

```bash
git add package.json tsconfig.base.json vitest.config.ts package-lock.json
git commit -m "chore: scaffold npm workspace"
```

---

## Task 2: Core session types

**Files:**
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/src/session/types.ts`
- Test: `packages/core/src/session/messages.test.ts` (next task)

- [ ] **Step 1: Create `packages/core/package.json`**

```json
{
  "name": "@rst/core",
  "version": "0.0.0",
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts"
}
```

- [ ] **Step 2: Create `packages/core/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `packages/core/src/session/types.ts`**

```ts
export type Role = 'driver' | 'rider'

/** BCP-47-ish language code, e.g. 'en', 'id'. */
export type Language = string

export interface Participant {
  readonly role: Role
  readonly language: Language
}

/** A recognized utterance, sent over the wire in the SENDER's language. */
export interface SessionMessage {
  readonly sessionId: string
  readonly senderRole: Role
  readonly sourceLang: Language
  readonly text: string
  readonly timestamp: number
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/core/package.json packages/core/tsconfig.json packages/core/src/session/types.ts
git commit -m "feat(core): add session types"
```

---

## Task 3: Session message factory (TDD)

**Files:**
- Create: `packages/core/src/session/messages.ts`
- Test: `packages/core/src/session/messages.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/session/messages.test.ts
import { describe, it, expect } from 'vitest'
import { createSessionMessage } from './messages'

describe('createSessionMessage', () => {
  it('builds an immutable message with a fixed clock', () => {
    const msg = createSessionMessage(
      { sessionId: 'abc', senderRole: 'rider', sourceLang: 'en', text: 'hello' },
      () => 1000,
    )
    expect(msg).toEqual({
      sessionId: 'abc',
      senderRole: 'rider',
      sourceLang: 'en',
      text: 'hello',
      timestamp: 1000,
    })
  })

  it('trims surrounding whitespace from text', () => {
    const msg = createSessionMessage(
      { sessionId: 'abc', senderRole: 'driver', sourceLang: 'id', text: '  halo  ' },
      () => 0,
    )
    expect(msg.text).toBe('halo')
  })

  it('throws on empty text after trim', () => {
    expect(() =>
      createSessionMessage(
        { sessionId: 'abc', senderRole: 'driver', sourceLang: 'id', text: '   ' },
        () => 0,
      ),
    ).toThrow('text must not be empty')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- messages`
Expected: FAIL — cannot find module `./messages`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/core/src/session/messages.ts
import type { Role, Language, SessionMessage } from './types'

export interface NewMessageInput {
  sessionId: string
  senderRole: Role
  sourceLang: Language
  text: string
}

export type Clock = () => number

export function createSessionMessage(
  input: NewMessageInput,
  clock: Clock = Date.now,
): SessionMessage {
  const text = input.text.trim()
  if (text.length === 0) throw new Error('text must not be empty')
  return {
    sessionId: input.sessionId,
    senderRole: input.senderRole,
    sourceLang: input.sourceLang,
    text,
    timestamp: clock(),
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- messages`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/session/messages.ts packages/core/src/session/messages.test.ts
git commit -m "feat(core): add session message factory"
```

---

## Task 4: Translator interface + MockTranslator (TDD)

**Files:**
- Create: `packages/core/src/providers/translator.ts`
- Test: `packages/core/src/providers/translator.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/providers/translator.test.ts
import { describe, it, expect } from 'vitest'
import { MockTranslator } from './translator'

describe('MockTranslator', () => {
  const t = new MockTranslator()

  it('returns text unchanged when source equals target', async () => {
    const r = await t.translate({ text: 'hello', sourceLang: 'en', targetLang: 'en' })
    expect(r.text).toBe('hello')
    expect(r.sourceLang).toBe('en')
    expect(r.targetLang).toBe('en')
  })

  it('translates known dictionary phrases id->en', async () => {
    const r = await t.translate({ text: 'terima kasih', sourceLang: 'id', targetLang: 'en' })
    expect(r.text).toBe('thank you')
  })

  it('translates known dictionary phrases en->id', async () => {
    const r = await t.translate({ text: 'thank you', sourceLang: 'en', targetLang: 'id' })
    expect(r.text).toBe('terima kasih')
  })

  it('falls back to a tagged passthrough for unknown phrases', async () => {
    const r = await t.translate({ text: 'quantum', sourceLang: 'en', targetLang: 'id' })
    expect(r.text).toBe('[id] quantum')
  })

  it('is case-insensitive for dictionary lookups', async () => {
    const r = await t.translate({ text: 'Terima Kasih', sourceLang: 'id', targetLang: 'en' })
    expect(r.text).toBe('thank you')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- translator`
Expected: FAIL — cannot find module `./translator`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/core/src/providers/translator.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- translator`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/providers/translator.ts packages/core/src/providers/translator.test.ts
git commit -m "feat(core): add Translator interface and MockTranslator"
```

---

## Task 5: RateProvider + CurrencyTransform (TDD)

**Files:**
- Create: `packages/core/src/providers/rate-provider.ts`, `packages/core/src/transforms/types.ts`, `packages/core/src/transforms/currency-transform.ts`
- Test: `packages/core/src/transforms/currency-transform.test.ts`

- [ ] **Step 1: Create the RateProvider + transform types (no test yet — interfaces)**

```ts
// packages/core/src/providers/rate-provider.ts
export interface RateProvider {
  /** Units of `from` currency per 1 unit of `to` currency. */
  rateToUsd(from: string): Promise<number | undefined>
}

/** Static demo rates: how many of X equal 1 USD. */
const USD_RATES: Record<string, number> = {
  IDR: 16100, // ~1 USD = 16,100 IDR
}

export class MockRateProvider implements RateProvider {
  async rateToUsd(from: string): Promise<number | undefined> {
    return USD_RATES[from.toUpperCase()]
  }
}
```

```ts
// packages/core/src/transforms/types.ts
import type { Participant } from '../session/types'

export interface PipelineContext {
  /** The local participant receiving/translating the message. */
  recipient: Participant
}

export interface Transform {
  apply(text: string, ctx: PipelineContext): Promise<string>
}
```

- [ ] **Step 2: Write the failing test**

```ts
// packages/core/src/transforms/currency-transform.test.ts
import { describe, it, expect } from 'vitest'
import { CurrencyTransform } from './currency-transform'
import { MockRateProvider } from '../providers/rate-provider'

const ctx = { recipient: { role: 'rider' as const, language: 'en' } }

describe('CurrencyTransform', () => {
  const transform = new CurrencyTransform(new MockRateProvider())

  it('annotates "Rp50.000" with a USD conversion', async () => {
    const out = await transform.apply('berhenti, Rp50.000', ctx)
    expect(out).toBe('berhenti, Rp50.000 (~$3.11 USD)')
  })

  it('annotates "50000 rupiah" phrasing', async () => {
    const out = await transform.apply('it costs 50000 rupiah', ctx)
    expect(out).toBe('it costs 50000 rupiah (~$3.11 USD)')
  })

  it('leaves text without money untouched', async () => {
    const out = await transform.apply('turn left here', ctx)
    expect(out).toBe('turn left here')
  })

  it('passes through unchanged when the rate is unknown', async () => {
    const empty = new CurrencyTransform({ rateToUsd: async () => undefined })
    const out = await empty.apply('Rp50.000', ctx)
    expect(out).toBe('Rp50.000')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- currency-transform`
Expected: FAIL — cannot find module `./currency-transform`.

- [ ] **Step 4: Write minimal implementation**

```ts
// packages/core/src/transforms/currency-transform.ts
import type { RateProvider } from '../providers/rate-provider'
import type { PipelineContext, Transform } from './types'

/**
 * Detects Indonesian Rupiah amounts and appends a USD estimate.
 * Matches "Rp50.000", "Rp 50.000", "50000 rupiah" (case-insensitive).
 */
const RP_PREFIX = /Rp\s?([\d.,]+)/gi
const RP_SUFFIX = /([\d.,]+)\s?rupiah/gi

export class CurrencyTransform implements Transform {
  constructor(private readonly rates: RateProvider) {}

  async apply(text: string, _ctx: PipelineContext): Promise<string> {
    const amounts = this.extractAmounts(text)
    if (amounts.length === 0) return text

    const rate = await this.rates.rateToUsd('IDR')
    if (rate === undefined) return text

    let result = text
    for (const { raw, value } of amounts) {
      const usd = (value / rate).toFixed(2)
      result = result.replace(raw, `${raw} (~$${usd} USD)`)
    }
    return result
  }

  private extractAmounts(text: string): Array<{ raw: string; value: number }> {
    const found: Array<{ raw: string; value: number }> = []
    for (const re of [RP_PREFIX, RP_SUFFIX]) {
      re.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = re.exec(text)) !== null) {
        const raw = m[0]
        const digits = m[1].replace(/[.,]/g, '')
        const value = Number(digits)
        if (Number.isFinite(value) && value > 0) found.push({ raw, value })
      }
    }
    return found
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- currency-transform`
Expected: PASS (4 tests). Note: 50000 / 16100 = 3.1055… → "3.11".

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/providers/rate-provider.ts packages/core/src/transforms/
git commit -m "feat(core): add RateProvider and CurrencyTransform"
```

---

## Task 6: Speech provider interfaces + mocks (TDD)

**Files:**
- Create: `packages/core/src/providers/speech-recognizer.ts`, `packages/core/src/providers/speech-synthesizer.ts`, `packages/core/src/providers/streaming.ts`
- Test: `packages/core/src/providers/speech.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/providers/speech.test.ts
import { describe, it, expect, vi } from 'vitest'
import { MockSpeechRecognizer } from './speech-recognizer'
import { MockSpeechSynthesizer } from './speech-synthesizer'

describe('MockSpeechRecognizer', () => {
  it('emits queued phrases as final results when start() is called', () => {
    const rec = new MockSpeechRecognizer(['halo', 'terima kasih'])
    const results: Array<{ text: string; isFinal: boolean }> = []
    rec.start((text, isFinal) => results.push({ text, isFinal }))
    expect(results).toEqual([
      { text: 'halo', isFinal: true },
      { text: 'terima kasih', isFinal: true },
    ])
  })

  it('does not emit after stop()', () => {
    const rec = new MockSpeechRecognizer(['halo'])
    rec.stop()
    const cb = vi.fn()
    rec.start(cb)
    expect(cb).not.toHaveBeenCalled()
  })
})

describe('MockSpeechSynthesizer', () => {
  it('records spoken text and language', async () => {
    const synth = new MockSpeechSynthesizer()
    await synth.speak('hello', 'en')
    expect(synth.spoken).toEqual([{ text: 'hello', lang: 'en' }])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- speech`
Expected: FAIL — cannot find module `./speech-recognizer`.

- [ ] **Step 3: Write minimal implementations**

```ts
// packages/core/src/providers/speech-recognizer.ts
export type RecognitionCallback = (text: string, isFinal: boolean) => void

export interface SpeechRecognizer {
  start(onResult: RecognitionCallback): void
  stop(): void
}

/** Emits a fixed queue of phrases. Useful for offline demos and tests. */
export class MockSpeechRecognizer implements SpeechRecognizer {
  private stopped = false
  constructor(private readonly phrases: string[] = []) {}

  start(onResult: RecognitionCallback): void {
    if (this.stopped) return
    for (const phrase of this.phrases) onResult(phrase, true)
  }

  stop(): void {
    this.stopped = true
  }
}
```

```ts
// packages/core/src/providers/speech-synthesizer.ts
import type { Language } from '../session/types'

export interface SpeechSynthesizer {
  speak(text: string, lang: Language): Promise<void>
}

/** No-op synthesizer that records calls for assertions. */
export class MockSpeechSynthesizer implements SpeechSynthesizer {
  readonly spoken: Array<{ text: string; lang: Language }> = []
  async speak(text: string, lang: Language): Promise<void> {
    this.spoken.push({ text, lang })
  }
}
```

```ts
// packages/core/src/providers/streaming.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- speech`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/providers/speech-recognizer.ts packages/core/src/providers/speech-synthesizer.ts packages/core/src/providers/streaming.ts packages/core/src/providers/speech.test.ts
git commit -m "feat(core): add speech provider interfaces and mocks"
```

---

## Task 7: TranslationPipeline (TDD)

**Files:**
- Create: `packages/core/src/pipeline/pipeline.ts`
- Test: `packages/core/src/pipeline/pipeline.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/pipeline/pipeline.test.ts
import { describe, it, expect } from 'vitest'
import { TranslationPipeline } from './pipeline'
import { MockTranslator } from '../providers/translator'
import { MockSpeechSynthesizer } from '../providers/speech-synthesizer'
import { CurrencyTransform } from '../transforms/currency-transform'
import { MockRateProvider } from '../providers/rate-provider'
import type { SessionMessage } from '../session/types'

const incoming = (text: string, sourceLang = 'id'): SessionMessage => ({
  sessionId: 's1',
  senderRole: 'driver',
  sourceLang,
  text,
  timestamp: 1,
})

describe('TranslationPipeline', () => {
  it('translates an incoming message into the recipient language and speaks it', async () => {
    const synth = new MockSpeechSynthesizer()
    const pipeline = new TranslationPipeline({
      translator: new MockTranslator(),
      synthesizer: synth,
      transforms: [],
    })
    const result = await pipeline.receive(incoming('terima kasih'), {
      recipient: { role: 'rider', language: 'en' },
    })
    expect(result.translatedText).toBe('thank you')
    expect(result.sourceText).toBe('terima kasih')
    expect(synth.spoken).toEqual([{ text: 'thank you', lang: 'en' }])
  })

  it('applies transforms after translation', async () => {
    const synth = new MockSpeechSynthesizer()
    const pipeline = new TranslationPipeline({
      translator: new MockTranslator(),
      synthesizer: synth,
      transforms: [new CurrencyTransform(new MockRateProvider())],
    })
    const result = await pipeline.receive(incoming('Rp50.000'), {
      recipient: { role: 'rider', language: 'en' },
    })
    expect(result.translatedText).toBe('[en] Rp50.000 (~$3.11 USD)')
  })

  it('skips synthesis when speak is disabled', async () => {
    const synth = new MockSpeechSynthesizer()
    const pipeline = new TranslationPipeline({
      translator: new MockTranslator(),
      synthesizer: synth,
      transforms: [],
      speak: false,
    })
    await pipeline.receive(incoming('halo'), { recipient: { role: 'rider', language: 'en' } })
    expect(synth.spoken).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- pipeline`
Expected: FAIL — cannot find module `./pipeline`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/core/src/pipeline/pipeline.ts
import type { Translator } from '../providers/translator'
import type { SpeechSynthesizer } from '../providers/speech-synthesizer'
import type { Transform, PipelineContext } from '../transforms/types'
import type { SessionMessage } from '../session/types'

export interface PipelineDeps {
  translator: Translator
  synthesizer: SpeechSynthesizer
  transforms: Transform[]
  /** Speak the translated text aloud on delivery. Default true. */
  speak?: boolean
}

export interface DeliveredMessage {
  sourceText: string
  translatedText: string
  sourceLang: string
  targetLang: string
}

export class TranslationPipeline {
  constructor(private readonly deps: PipelineDeps) {}

  async receive(
    message: SessionMessage,
    ctx: PipelineContext,
  ): Promise<DeliveredMessage> {
    const targetLang = ctx.recipient.language

    const translated = await this.deps.translator.translate({
      text: message.text,
      sourceLang: message.sourceLang,
      targetLang,
    })

    let finalText = translated.text
    for (const transform of this.deps.transforms) {
      finalText = await transform.apply(finalText, ctx)
    }

    if (this.deps.speak !== false) {
      await this.deps.synthesizer.speak(finalText, targetLang)
    }

    return {
      sourceText: message.text,
      translatedText: finalText,
      sourceLang: message.sourceLang,
      targetLang,
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- pipeline`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/pipeline/
git commit -m "feat(core): add TranslationPipeline"
```

---

## Task 8: Core public exports

**Files:**
- Create: `packages/core/src/index.ts`

- [ ] **Step 1: Create the barrel export**

```ts
// packages/core/src/index.ts
export * from './session/types'
export * from './session/messages'
export * from './providers/translator'
export * from './providers/speech-recognizer'
export * from './providers/speech-synthesizer'
export * from './providers/rate-provider'
export * from './providers/streaming'
export * from './transforms/types'
export * from './transforms/currency-transform'
export * from './pipeline/pipeline'
```

- [ ] **Step 2: Verify the whole core builds and tests pass**

Run: `npm test`
Expected: PASS — all core suites green.

Run: `npx tsc -p packages/core/tsconfig.json --noEmit`
Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/index.ts
git commit -m "feat(core): add public barrel exports"
```

---

## Task 9: Server room registry (TDD)

**Files:**
- Create: `packages/server/package.json`, `packages/server/tsconfig.json`, `packages/server/src/rooms.ts`
- Test: `packages/server/src/rooms.test.ts`

- [ ] **Step 1: Create `packages/server/package.json`**

```json
{
  "name": "@rst/server",
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "node --experimental-strip-types src/server.ts",
    "start": "node --experimental-strip-types src/server.ts"
  },
  "dependencies": { "ws": "^8.18.0" },
  "devDependencies": { "@types/ws": "^8.5.12" }
}
```

- [ ] **Step 2: Create `packages/server/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "include": ["src"]
}
```

- [ ] **Step 3: Write the failing test**

```ts
// packages/server/src/rooms.test.ts
import { describe, it, expect } from 'vitest'
import { RoomRegistry } from './rooms'

describe('RoomRegistry', () => {
  it('creates a room and returns a code; first peer joins it', () => {
    const reg = new RoomRegistry(() => 'ABCD')
    const code = reg.create('peerA')
    expect(code).toBe('ABCD')
    expect(reg.peers(code)).toEqual(['peerA'])
  })

  it('lets a second peer join an existing room', () => {
    const reg = new RoomRegistry(() => 'ABCD')
    const code = reg.create('peerA')
    const ok = reg.join(code, 'peerB')
    expect(ok).toBe(true)
    expect(reg.peers(code)).toEqual(['peerA', 'peerB'])
  })

  it('rejects joining a full room', () => {
    const reg = new RoomRegistry(() => 'ABCD')
    const code = reg.create('peerA')
    reg.join(code, 'peerB')
    expect(reg.join(code, 'peerC')).toBe(false)
  })

  it('rejects joining an unknown room', () => {
    const reg = new RoomRegistry(() => 'ABCD')
    expect(reg.join('ZZZZ', 'peerB')).toBe(false)
  })

  it('returns the other peer for relaying', () => {
    const reg = new RoomRegistry(() => 'ABCD')
    const code = reg.create('peerA')
    reg.join(code, 'peerB')
    expect(reg.otherPeer(code, 'peerA')).toBe('peerB')
    expect(reg.otherPeer(code, 'peerB')).toBe('peerA')
  })

  it('removes a peer and deletes empty rooms', () => {
    const reg = new RoomRegistry(() => 'ABCD')
    const code = reg.create('peerA')
    reg.leave('peerA')
    expect(reg.peers(code)).toEqual([])
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm test -- rooms`
Expected: FAIL — cannot find module `./rooms`.

- [ ] **Step 5: Write minimal implementation**

```ts
// packages/server/src/rooms.ts
export type CodeGenerator = () => string

interface Room {
  code: string
  peers: string[]
}

const MAX_PEERS = 2

export class RoomRegistry {
  private rooms = new Map<string, Room>()
  private peerToRoom = new Map<string, string>()

  constructor(private readonly genCode: CodeGenerator = defaultCode) {}

  create(peerId: string): string {
    let code = this.genCode()
    while (this.rooms.has(code)) code = this.genCode()
    this.rooms.set(code, { code, peers: [peerId] })
    this.peerToRoom.set(peerId, code)
    return code
  }

  join(code: string, peerId: string): boolean {
    const room = this.rooms.get(code)
    if (!room || room.peers.length >= MAX_PEERS) return false
    room.peers.push(peerId)
    this.peerToRoom.set(peerId, code)
    return true
  }

  peers(code: string): string[] {
    return this.rooms.get(code)?.peers.slice() ?? []
  }

  otherPeer(code: string, peerId: string): string | undefined {
    return this.rooms.get(code)?.peers.find((p) => p !== peerId)
  }

  roomOf(peerId: string): string | undefined {
    return this.peerToRoom.get(peerId)
  }

  leave(peerId: string): void {
    const code = this.peerToRoom.get(peerId)
    if (!code) return
    this.peerToRoom.delete(peerId)
    const room = this.rooms.get(code)
    if (!room) return
    room.peers = room.peers.filter((p) => p !== peerId)
    if (room.peers.length === 0) this.rooms.delete(code)
  }
}

function defaultCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  let out = ''
  for (let i = 0; i < 4; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return out
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- rooms`
Expected: PASS (6 tests).

- [ ] **Step 7: Install ws and commit**

```bash
npm install
git add packages/server/package.json packages/server/tsconfig.json packages/server/src/rooms.ts packages/server/src/rooms.test.ts package-lock.json
git commit -m "feat(server): add room registry"
```

---

## Task 10: WebSocket relay server

**Files:**
- Create: `packages/server/src/server.ts`

- [ ] **Step 1: Write the relay wiring**

```ts
// packages/server/src/server.ts
import { WebSocketServer, WebSocket } from 'ws'
import { randomUUID } from 'node:crypto'
import { RoomRegistry } from './rooms.ts'

const PORT = Number(process.env.PORT ?? 8787)

const registry = new RoomRegistry()
const sockets = new Map<string, WebSocket>()
const wss = new WebSocketServer({ port: PORT })

type ClientMsg =
  | { type: 'create' }
  | { type: 'join'; code: string }
  | { type: 'utterance'; payload: unknown }

function send(peerId: string, msg: unknown): void {
  const ws = sockets.get(peerId)
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg))
}

wss.on('connection', (ws) => {
  const peerId = randomUUID()
  sockets.set(peerId, ws)

  ws.on('message', (raw) => {
    let msg: ClientMsg
    try {
      msg = JSON.parse(raw.toString())
    } catch {
      send(peerId, { type: 'error', error: 'invalid json' })
      return
    }

    if (msg.type === 'create') {
      const code = registry.create(peerId)
      send(peerId, { type: 'created', code })
      return
    }

    if (msg.type === 'join') {
      const ok = registry.join(msg.code, peerId)
      if (!ok) {
        send(peerId, { type: 'error', error: 'room full or not found' })
        return
      }
      send(peerId, { type: 'joined', code: msg.code })
      const other = registry.otherPeer(msg.code, peerId)
      if (other) {
        send(other, { type: 'peer-joined' })
        send(peerId, { type: 'peer-joined' })
      }
      return
    }

    if (msg.type === 'utterance') {
      const code = registry.roomOf(peerId)
      if (!code) return
      const other = registry.otherPeer(code, peerId)
      if (other) send(other, { type: 'utterance', payload: msg.payload })
      return
    }
  })

  ws.on('close', () => {
    const code = registry.roomOf(peerId)
    const other = code ? registry.otherPeer(code, peerId) : undefined
    registry.leave(peerId)
    sockets.delete(peerId)
    if (other) send(other, { type: 'peer-left' })
  })
})

console.log(`relay listening on ws://localhost:${PORT}`)
```

- [ ] **Step 2: Manually verify the server boots**

Run: `node --experimental-strip-types packages/server/src/server.ts`
Expected: prints `relay listening on ws://localhost:8787`. Stop with Ctrl-C.

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/server.ts
git commit -m "feat(server): add websocket relay"
```

---

## Task 11: Integration test — two clients through the relay (TDD)

**Files:**
- Create: `packages/server/src/relay.integration.test.ts`

- [ ] **Step 1: Write the failing integration test**

```ts
// packages/server/src/relay.integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { WebSocketServer } from 'ws'
import WebSocket from 'ws'
import { RoomRegistry } from './rooms'
import { randomUUID } from 'node:crypto'

// Minimal in-test relay mirroring server.ts, on an ephemeral port.
function startRelay(port: number) {
  const registry = new RoomRegistry()
  const sockets = new Map<string, WebSocket>()
  const wss = new WebSocketServer({ port })
  const send = (id: string, m: unknown) => {
    const ws = sockets.get(id)
    if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(m))
  }
  wss.on('connection', (ws) => {
    const id = randomUUID()
    sockets.set(id, ws as unknown as WebSocket)
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString())
      if (msg.type === 'create') send(id, { type: 'created', code: registry.create(id) })
      else if (msg.type === 'join') {
        if (registry.join(msg.code, id)) {
          send(id, { type: 'joined' })
          const other = registry.otherPeer(msg.code, id)
          if (other) send(other, { type: 'peer-joined' })
        } else send(id, { type: 'error' })
      } else if (msg.type === 'utterance') {
        const code = registry.roomOf(id)!
        const other = registry.otherPeer(code, id)
        if (other) send(other, { type: 'utterance', payload: msg.payload })
      }
    })
  })
  return wss
}

const PORT = 8911
let wss: WebSocketServer

beforeAll(() => {
  wss = startRelay(PORT)
})
afterAll(() => {
  wss.close()
})

function connect(): Promise<WebSocket> {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://localhost:${PORT}`)
    ws.on('open', () => resolve(ws))
  })
}

function next(ws: WebSocket): Promise<any> {
  return new Promise((resolve) => ws.once('message', (m) => resolve(JSON.parse(m.toString()))))
}

describe('relay integration', () => {
  it('relays an utterance from creator to joiner', async () => {
    const a = await connect()
    a.send(JSON.stringify({ type: 'create' }))
    const created = await next(a)
    expect(created.type).toBe('created')

    const b = await connect()
    b.send(JSON.stringify({ type: 'join', code: created.code }))
    await next(b) // joined
    await next(a) // peer-joined

    const relayed = next(b)
    a.send(JSON.stringify({ type: 'utterance', payload: { text: 'terima kasih', sourceLang: 'id' } }))
    const got = await relayed
    expect(got.type).toBe('utterance')
    expect(got.payload).toEqual({ text: 'terima kasih', sourceLang: 'id' })

    a.close()
    b.close()
  })
})
```

- [ ] **Step 2: Run test to verify it fails, then passes**

Run: `npm test -- relay.integration`
Expected: PASS (1 test). If it fails on missing `ws` types, ensure Task 9 install ran.

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/relay.integration.test.ts
git commit -m "test(server): add relay integration test"
```

---

## Task 12: Web app scaffold

**Files:**
- Create: `packages/web/package.json`, `packages/web/tsconfig.json`, `packages/web/vite.config.ts`, `packages/web/index.html`, `packages/web/src/main.tsx`, `packages/web/src/styles/tokens.css`

- [ ] **Step 1: Create `packages/web/package.json`**

```json
{
  "name": "@rst/web",
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@rst/core": "*",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.1",
    "vite": "^5.4.2",
    "@types/react": "^18.3.4",
    "@types/react-dom": "^18.3.0"
  }
}
```

- [ ] **Step 2: Create `packages/web/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "jsx": "react-jsx", "lib": ["ES2022", "DOM", "DOM.Iterable"] },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `packages/web/vite.config.ts`**

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
})
```

- [ ] **Step 4: Create `packages/web/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Rideshare Live Translation</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Create `packages/web/src/styles/tokens.css`**

```css
:root {
  --color-surface: oklch(98% 0 0);
  --color-surface-raised: oklch(100% 0 0);
  --color-text: oklch(20% 0.02 260);
  --color-muted: oklch(55% 0.02 260);
  --color-accent: oklch(62% 0.19 250);
  --color-driver: oklch(64% 0.16 160);
  --color-rider: oklch(62% 0.19 250);

  --text-base: clamp(1rem, 0.92rem + 0.4vw, 1.125rem);
  --text-title: clamp(1.5rem, 1.1rem + 1.6vw, 2.25rem);

  --space-sm: 0.5rem;
  --space-md: 1rem;
  --space-lg: 1.75rem;

  --radius: 14px;
  --duration-fast: 150ms;
  --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
}

* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: system-ui, -apple-system, sans-serif;
  color: var(--color-text);
  background: var(--color-surface);
}
```

- [ ] **Step 6: Create `packages/web/src/main.tsx`**

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles/tokens.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

- [ ] **Step 7: Install and commit**

```bash
npm install
git add packages/web/ package-lock.json
git commit -m "chore(web): scaffold vite react app"
```

---

## Task 13: Web speech adapters (opt-in)

**Files:**
- Create: `packages/web/src/adapters/web-speech.ts`

- [ ] **Step 1: Implement browser adapters honoring the core interfaces**

```ts
// packages/web/src/adapters/web-speech.ts
// OPT-IN ONLY. WebSpeechRecognizer streams audio to the browser vendor's
// servers (Chrome -> Google). Never the default. MockSpeechRecognizer is default.
import type {
  SpeechRecognizer,
  RecognitionCallback,
  SpeechSynthesizer,
  Language,
} from '@rst/core'

export class WebSpeechRecognizer implements SpeechRecognizer {
  private recognition: any
  constructor(private readonly lang: Language) {
    const Ctor =
      (globalThis as any).SpeechRecognition ??
      (globalThis as any).webkitSpeechRecognition
    if (!Ctor) throw new Error('Web Speech API not available in this browser')
    this.recognition = new Ctor()
    this.recognition.lang = lang
    this.recognition.interimResults = true
    this.recognition.continuous = true
  }

  start(onResult: RecognitionCallback): void {
    this.recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i]
        onResult(res[0].transcript, res.isFinal)
      }
    }
    this.recognition.start()
  }

  stop(): void {
    this.recognition.stop()
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
```

- [ ] **Step 2: Type-check**

Run: `npx tsc -p packages/web/tsconfig.json --noEmit`
Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/adapters/web-speech.ts
git commit -m "feat(web): add opt-in web speech adapters"
```

---

## Task 14: Session transport hook

**Files:**
- Create: `packages/web/src/transport/useSession.ts`

- [ ] **Step 1: Implement the WebSocket client hook**

```ts
// packages/web/src/transport/useSession.ts
import { useCallback, useEffect, useRef, useState } from 'react'
import type { SessionMessage } from '@rst/core'

const RELAY_URL = import.meta.env.VITE_RELAY_URL ?? 'ws://localhost:8787'

export type ConnState = 'idle' | 'connecting' | 'waiting' | 'active' | 'peer-left'

export interface SessionApi {
  state: ConnState
  code: string | null
  create: () => void
  join: (code: string) => void
  sendUtterance: (msg: SessionMessage) => void
  onUtterance: (cb: (msg: SessionMessage) => void) => void
}

export function useSession(): SessionApi {
  const ws = useRef<WebSocket | null>(null)
  const utteranceCb = useRef<(msg: SessionMessage) => void>(() => {})
  const [state, setState] = useState<ConnState>('idle')
  const [code, setCode] = useState<string | null>(null)

  const ensureSocket = useCallback((): WebSocket => {
    if (ws.current && ws.current.readyState <= WebSocket.OPEN) return ws.current
    const socket = new WebSocket(RELAY_URL)
    socket.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      switch (msg.type) {
        case 'created':
          setCode(msg.code)
          setState('waiting')
          break
        case 'joined':
          setState('active')
          break
        case 'peer-joined':
          setState('active')
          break
        case 'peer-left':
          setState('peer-left')
          break
        case 'utterance':
          utteranceCb.current(msg.payload as SessionMessage)
          break
      }
    }
    socket.onclose = () => setState('peer-left')
    ws.current = socket
    return socket
  }, [])

  const waitOpen = (socket: WebSocket, fn: () => void) => {
    if (socket.readyState === WebSocket.OPEN) fn()
    else socket.addEventListener('open', fn, { once: true })
  }

  const create = useCallback(() => {
    setState('connecting')
    const socket = ensureSocket()
    waitOpen(socket, () => socket.send(JSON.stringify({ type: 'create' })))
  }, [ensureSocket])

  const join = useCallback(
    (joinCode: string) => {
      setState('connecting')
      const socket = ensureSocket()
      waitOpen(socket, () =>
        socket.send(JSON.stringify({ type: 'join', code: joinCode })),
      )
      setCode(joinCode)
    },
    [ensureSocket],
  )

  const sendUtterance = useCallback((msg: SessionMessage) => {
    ws.current?.send(JSON.stringify({ type: 'utterance', payload: msg }))
  }, [])

  const onUtterance = useCallback((cb: (msg: SessionMessage) => void) => {
    utteranceCb.current = cb
  }, [])

  useEffect(() => () => ws.current?.close(), [])

  return { state, code, create, join, sendUtterance, onUtterance }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc -p packages/web/tsconfig.json --noEmit`
Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/transport/useSession.ts
git commit -m "feat(web): add session transport hook"
```

---

## Task 15: Lobby + Conversation components

**Files:**
- Create: `packages/web/src/components/Lobby.tsx`, `packages/web/src/components/Conversation.tsx`, `packages/web/src/components/conversation.css`, `packages/web/src/App.tsx`

- [ ] **Step 1: Create `packages/web/src/components/Lobby.tsx`**

```tsx
import { useState } from 'react'
import type { Role, Language } from '@rst/core'

interface LobbyProps {
  onStart: (config: { role: Role; language: Language; mode: 'create' | 'join'; code?: string }) => void
}

const LANGS: Array<{ code: Language; label: string }> = [
  { code: 'en', label: 'English' },
  { code: 'id', label: 'Bahasa Indonesia' },
]

export function Lobby({ onStart }: LobbyProps) {
  const [role, setRole] = useState<Role>('rider')
  const [language, setLanguage] = useState<Language>('en')
  const [joinCode, setJoinCode] = useState('')

  return (
    <section aria-labelledby="lobby-heading" className="lobby">
      <h1 id="lobby-heading">Live Ride Translation</h1>

      <fieldset>
        <legend>I am the</legend>
        {(['rider', 'driver'] as Role[]).map((r) => (
          <label key={r} className={role === r ? 'chip chip--on' : 'chip'}>
            <input type="radio" name="role" value={r} checked={role === r}
              onChange={() => setRole(r)} />
            {r}
          </label>
        ))}
      </fieldset>

      <label className="field">
        My language
        <select value={language} onChange={(e) => setLanguage(e.target.value)}>
          {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
        </select>
      </label>

      <div className="lobby__actions">
        <button className="btn btn--primary"
          onClick={() => onStart({ role, language, mode: 'create' })}>
          Start a ride
        </button>
        <div className="join">
          <input aria-label="Room code" placeholder="CODE" value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())} maxLength={4} />
          <button className="btn"
            disabled={joinCode.length !== 4}
            onClick={() => onStart({ role, language, mode: 'join', code: joinCode })}>
            Join
          </button>
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Create `packages/web/src/components/Conversation.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react'
import {
  MockSpeechRecognizer,
  MockSpeechSynthesizer,
  MockTranslator,
  MockRateProvider,
  CurrencyTransform,
  TranslationPipeline,
  createSessionMessage,
  type Role,
  type Language,
  type SessionMessage,
} from '@rst/core'
import type { SessionApi } from '../transport/useSession'

interface Line {
  id: number
  fromRole: Role
  original: string
  translated: string
  mine: boolean
}

interface ConversationProps {
  session: SessionApi
  role: Role
  language: Language
}

// Demo phrases a participant can "speak" (mock STT). In a real build this is
// replaced by WebSpeechRecognizer or a streaming provider.
const DEMO_PHRASES: Record<Language, string[]> = {
  en: ['hello', 'turn left', 'stop here', 'how much'],
  id: ['halo', 'terima kasih', 'berhenti di sini, Rp50.000'],
}

export function Conversation({ session, role, language }: ConversationProps) {
  const [lines, setLines] = useState<Line[]>([])
  const nextId = useRef(0)
  const pipeline = useRef(
    new TranslationPipeline({
      translator: new MockTranslator(),
      synthesizer: new MockSpeechSynthesizer(),
      transforms: [new CurrencyTransform(new MockRateProvider())],
    }),
  )

  useEffect(() => {
    session.onUtterance(async (msg: SessionMessage) => {
      const delivered = await pipeline.current.receive(msg, {
        recipient: { role, language },
      })
      setLines((prev) => [
        ...prev,
        {
          id: nextId.current++,
          fromRole: msg.senderRole,
          original: delivered.sourceText,
          translated: delivered.translatedText,
          mine: false,
        },
      ])
    })
  }, [session, role, language])

  const speak = (phrase: string) => {
    const recognizer = new MockSpeechRecognizer([phrase])
    recognizer.start((text, isFinal) => {
      if (!isFinal) return
      const msg = createSessionMessage({
        sessionId: session.code ?? 'local',
        senderRole: role,
        sourceLang: language,
        text,
      })
      session.sendUtterance(msg)
      setLines((prev) => [
        ...prev,
        { id: nextId.current++, fromRole: role, original: text, translated: text, mine: true },
      ])
    })
  }

  const phrases = DEMO_PHRASES[language] ?? []

  return (
    <section aria-labelledby="convo-heading" className="convo">
      <header className="convo__bar">
        <h2 id="convo-heading">Ride chat</h2>
        <span className="convo__status" data-state={session.state}>{session.state}</span>
        {session.code && <code className="convo__code">{session.code}</code>}
      </header>

      <ol className="transcript" aria-live="polite">
        {lines.map((line) => (
          <li key={line.id} className={line.mine ? 'line line--mine' : 'line line--theirs'}
            data-role={line.fromRole}>
            <span className="line__translated">{line.translated}</span>
            {line.original !== line.translated && (
              <span className="line__original">{line.original}</span>
            )}
          </li>
        ))}
      </ol>

      <div className="mic" role="group" aria-label="Speak a phrase">
        {phrases.map((p) => (
          <button key={p} className="mic__phrase" onClick={() => speak(p)}>
            🎙 {p}
          </button>
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 3: Create `packages/web/src/components/conversation.css`**

```css
.lobby, .convo { max-width: 32rem; margin: 0 auto; padding: var(--space-lg); }
.lobby h1 { font-size: var(--text-title); }
.chip { display: inline-flex; gap: 6px; padding: 8px 14px; margin-right: 8px;
  border-radius: var(--radius); background: var(--color-surface-raised);
  border: 1px solid oklch(90% 0 0); cursor: pointer; text-transform: capitalize; }
.chip--on { border-color: var(--color-accent); box-shadow: 0 0 0 2px var(--color-accent); }
.chip input { display: none; }
.field { display: flex; flex-direction: column; gap: 6px; margin: var(--space-md) 0; }
.lobby__actions { display: flex; flex-direction: column; gap: var(--space-md); }
.join { display: flex; gap: 8px; }
.join input { flex: 1; text-transform: uppercase; letter-spacing: 0.3em; }
.btn { padding: 10px 18px; border-radius: var(--radius); border: 1px solid oklch(88% 0 0);
  background: var(--color-surface-raised); cursor: pointer;
  transition: transform var(--duration-fast) var(--ease-out-expo); }
.btn:hover { transform: translateY(-1px); }
.btn:active { transform: translateY(0); }
.btn--primary { background: var(--color-accent); color: white; border-color: transparent; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.convo__bar { display: flex; align-items: center; gap: var(--space-md); }
.convo__status { font-size: 0.8rem; padding: 2px 8px; border-radius: 999px;
  background: oklch(92% 0 0); color: var(--color-muted); }
.convo__status[data-state="active"] { background: oklch(90% 0.1 150); color: oklch(40% 0.1 150); }
.convo__code { margin-left: auto; font-weight: 700; letter-spacing: 0.2em; }
.transcript { list-style: none; padding: 0; display: flex; flex-direction: column;
  gap: var(--space-sm); min-height: 40vh; }
.line { padding: 10px 14px; border-radius: var(--radius); max-width: 80%;
  background: var(--color-surface-raised); border: 1px solid oklch(92% 0 0);
  animation: rise var(--duration-fast) var(--ease-out-expo); }
.line--mine { align-self: flex-end; background: var(--color-rider); color: white; }
.line--theirs { align-self: flex-start; }
.line__translated { display: block; font-size: var(--text-base); }
.line__original { display: block; font-size: 0.8rem; opacity: 0.7; margin-top: 2px; }
.mic { display: flex; flex-wrap: wrap; gap: 8px; margin-top: var(--space-md); }
.mic__phrase { padding: 8px 12px; border-radius: var(--radius); cursor: pointer;
  border: 1px solid var(--color-accent); background: transparent; }
@keyframes rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
```

- [ ] **Step 4: Create `packages/web/src/App.tsx`**

```tsx
import { useState } from 'react'
import type { Role, Language } from '@rst/core'
import { useSession } from './transport/useSession'
import { Lobby } from './components/Lobby'
import { Conversation } from './components/Conversation'
import './components/conversation.css'

interface ActiveConfig { role: Role; language: Language }

export function App() {
  const session = useSession()
  const [config, setConfig] = useState<ActiveConfig | null>(null)

  if (!config) {
    return (
      <main>
        <Lobby
          onStart={({ role, language, mode, code }) => {
            setConfig({ role, language })
            if (mode === 'create') session.create()
            else if (code) session.join(code)
          }}
        />
      </main>
    )
  }

  return (
    <main>
      <Conversation session={session} role={config.role} language={config.language} />
    </main>
  )
}
```

- [ ] **Step 5: Type-check the web package**

Run: `npx tsc -p packages/web/tsconfig.json --noEmit`
Expected: no type errors.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/components/ packages/web/src/App.tsx
git commit -m "feat(web): add lobby and conversation UI"
```

---

## Task 16: Manual two-device smoke test

**Files:** none (manual verification)

- [ ] **Step 1: Start the relay**

Run: `npm run dev:server`
Expected: `relay listening on ws://localhost:8787`.

- [ ] **Step 2: Start the web app (separate terminal)**

Run: `npm run dev:web`
Expected: Vite serves on `http://localhost:5173`.

- [ ] **Step 3: Exercise the flow**

1. Open `http://localhost:5173` in two browser windows.
2. Window A: role = rider, language = English, click "Start a ride" → note the 4-char code, status shows `waiting`.
3. Window B: role = driver, language = Bahasa Indonesia, enter the code, click "Join" → both show `active`.
4. Window B: click "🎙 berhenti di sini, Rp50.000".
5. Expected in Window A: a line reading `stop here (~$3.11 USD)` (translated to English + currency annotated), with the original `berhenti di sini, Rp50.000` shown beneath.
6. Window A: click "🎙 how much" → Window B shows `berapa harganya`.

- [ ] **Step 4: Commit a short verification note (optional)**

```bash
git commit --allow-empty -m "chore: verified two-device translation smoke test"
```

---

## Task 17: E2E test (Playwright)

**Files:**
- Create: `e2e/playwright.config.ts`, `e2e/conversation.spec.ts`
- Modify: root `package.json` (add `@playwright/test` devDep + `test:e2e` script)

- [ ] **Step 1: Add Playwright to root `package.json`**

Add to `devDependencies`: `"@playwright/test": "^1.47.0"`.
Add to `scripts`: `"test:e2e": "playwright test"`.

Run: `npm install && npx playwright install chromium`
Expected: browser downloaded.

- [ ] **Step 2: Create `e2e/playwright.config.ts`**

```ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  use: { baseURL: 'http://localhost:5173' },
  webServer: [
    { command: 'npm run dev:server', port: 8787, reuseExistingServer: true },
    { command: 'npm run dev:web', port: 5173, reuseExistingServer: true },
  ],
})
```

- [ ] **Step 3: Write the E2E test**

```ts
// e2e/conversation.spec.ts
import { test, expect } from '@playwright/test'

test('two participants exchange a translated, currency-annotated message', async ({ browser }) => {
  const rider = await browser.newPage()
  const driver = await browser.newPage()

  // Rider creates the room.
  await rider.goto('/')
  await rider.getByRole('button', { name: 'Start a ride' }).click()
  const code = await rider.locator('.convo__code').innerText()
  expect(code).toHaveLength(4)

  // Driver joins as Bahasa Indonesia.
  await driver.goto('/')
  await driver.getByRole('radio', { name: 'driver' }).check()
  await driver.locator('select').selectOption('id')
  await driver.getByLabel('Room code').fill(code)
  await driver.getByRole('button', { name: 'Join' }).click()

  await expect(rider.locator('.convo__status')).toHaveAttribute('data-state', 'active')

  // Driver speaks an Indonesian phrase containing a price.
  await driver.getByRole('button', { name: /Rp50\.000/ }).click()

  // Rider sees English translation + USD annotation.
  await expect(rider.locator('.line--theirs .line__translated')).toContainText('$3.11 USD')
})
```

- [ ] **Step 4: Run the E2E test**

Run: `npm run test:e2e`
Expected: PASS (1 test). Playwright auto-starts the relay + web server.

- [ ] **Step 5: Commit**

```bash
git add e2e/ package.json package-lock.json
git commit -m "test(e2e): add two-participant translation flow"
```

---

## Task 18: README + final verification

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write `README.md`**

```markdown
# Rideshare Live Translation POC

Two-party, real-time, bidirectional speech translation for a rideshare context.
Driver and rider each speak their own language; the other receives translated
text + spoken audio. All speech/translation/currency logic sits behind provider
interfaces with **offline mock defaults** — no external API calls in this build.

## Packages
- `@rst/core` — platform-agnostic pipeline, provider interfaces, mocks (no DOM/network)
- `@rst/server` — dumb WebSocket relay (rooms + message forwarding)
- `@rst/web` — React app wiring browser mic/speakers into the core

## Run
```bash
npm install
npm run dev:server   # ws://localhost:8787
npm run dev:web      # http://localhost:5173
```
Open two windows, create a ride in one, join with the code in the other.

## Swapping in real providers later
- Translation: implement `Translator`, replace `MockTranslator`.
- Speech-to-text: use the included opt-in `WebSpeechRecognizer`, or implement `SpeechRecognizer`.
- FX rates: implement `RateProvider`, replace `MockRateProvider`.
- Streaming APIs: implement `StreamingTranslationProvider` to replace several stages at once.

> Note: `WebSpeechRecognizer` streams audio to the browser vendor's servers and is opt-in only.

## Test
```bash
npm test          # unit + integration
npm run test:e2e  # Playwright
```
```

- [ ] **Step 2: Full verification sweep**

Run: `npm test`
Expected: all unit + integration suites PASS.

Run: `npx tsc -p packages/core/tsconfig.json --noEmit && npx tsc -p packages/web/tsconfig.json --noEmit && npx tsc -p packages/server/tsconfig.json --noEmit`
Expected: no type errors in any package.

Run: `npm run test:e2e`
Expected: E2E PASS.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add project README"
```

---

## Self-Review Notes

- **Spec coverage:** platform-agnostic core (Tasks 2–8) ✓; STT/translate/TTS interfaces + mocks (Tasks 4, 6) ✓; streaming provider interface (Task 6) ✓; receiver-side translation pipeline (Task 7) ✓; currency transform + RateProvider (Task 5) ✓; WebSocket relay + rooms + message envelope (Tasks 9–11) ✓; web app create/join + transcript + TTS (Tasks 12–15) ✓; connection states with visible feedback (Task 14/15 `data-state`) ✓; unit/integration/E2E testing (Tasks 3–11, 17) ✓; no external API in default build (mocks default; web speech opt-in, Task 13) ✓.
- **Type consistency:** `SessionMessage`, `TranslationRequest/Result`, `Transform.apply(text, ctx)`, `PipelineContext.recipient`, `TranslationPipeline.receive`, `SessionApi` methods are used consistently across tasks.
- **Currency math:** 50000 / 16100 = 3.1055 → `.toFixed(2)` = "3.11", asserted identically in Tasks 5, 7, 16, 17.
```
