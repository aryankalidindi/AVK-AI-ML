# Context-Aware Translation Implementation Plan (Phase 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** Make in-ride translation context- and register-aware (colloquial, intent-preserving, slang-savvy) by routing it through Claude on the server when a key is present, with the free `gtx` translator as a robust client-side fallback.

**Architecture:** The WS server also serves `POST /translate`, backed by a `ContextTranslator` that calls Claude (`claude-haiku-4-5`) with the rideshare domain, a register instruction, and the last few turns as context. The web client tries the server endpoint first (passing recent messages) and falls back to the existing browser `gtx` translator on any failure — so the keyless experience is unchanged.

**Tech Stack:** TypeScript, `@anthropic-ai/sdk`, Node `ws` + http, Vite/React, Vitest.

---

## Task 1: Server — context-aware Claude translator (TDD)

**Files:**
- Modify: `packages/server/src/claude-translator.ts`
- Modify: `packages/server/src/claude-translator.test.ts`

- [ ] **Step 1: Extend the failing tests** — append to `claude-translator.test.ts`:

```ts
import { describe as describe2, it as it2, expect as expect2, vi as vi2 } from 'vitest'

describe2('context-aware translate', () => {
  function fake(reply: string) {
    const calls: any[] = []
    const client = { messages: { create: vi2.fn(async (b: any) => { calls.push(b); return { content: [{ type: 'text', text: reply }] } }) } }
    return { client, calls }
  }

  it2('includes register instruction + both language names in the system prompt', async () => {
    const { client, calls } = fake('¿dónde te recojo?')
    const t = createClaudeTranslate(client, 'claude-haiku-4-5')
    const out = await t({ text: 'where should I pick you up', sourceLang: 'en', targetLang: 'es' })
    expect2(out).toBe('¿dónde te recojo?')
    const sys = calls[0].system as string
    expect2(sys.toLowerCase()).toContain('english')
    expect2(sys.toLowerCase()).toContain('spanish')
    expect2(sys.toLowerCase()).toMatch(/casual|colloquial|natural|native/)
  })

  it2('passes recent conversation context into the user message', async () => {
    const { client, calls } = fake('ok')
    const t = createClaudeTranslate(client, 'claude-haiku-4-5')
    await t({
      text: 'here is fine',
      sourceLang: 'en',
      targetLang: 'id',
      context: [{ role: 'driver', text: 'where to?' }, { role: 'rider', text: 'the airport' }],
    })
    const userContent = calls[0].messages[0].content as string
    expect2(userContent).toContain('the airport')
    expect2(userContent).toContain('here is fine')
  })
})
```

- [ ] **Step 2: Run — expect FAIL** (`context` unsupported / prompt lacks register words)

Run: `npm test -- claude-translator`

- [ ] **Step 3: Rewrite `claude-translator.ts`**

```ts
import Anthropic from '@anthropic-ai/sdk'

export interface ContextMessage {
  role: 'driver' | 'rider'
  text: string
}

export interface TranslateInput {
  text: string
  sourceLang: string
  targetLang: string
  context?: ContextMessage[]
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
    `localizing idioms, slang, and politeness to sound natural — never word-for-word ` +
    `or stiffly formal. Keep it as short as the original.\n\n` +
    `Use the recent conversation only to resolve references (pronouns, "here", "it", ` +
    `implied subjects). Do not translate, repeat, or answer it.\n\n` +
    `Preserve names, numbers, and currency amounts exactly as written. Output ONLY the ` +
    `translation — no quotes, no notes, no preamble.`
  )
}

function buildUser(input: TranslateInput): string {
  const parts: string[] = []
  if (input.context && input.context.length > 0) {
    const lines = input.context.map((m) => `${m.role}: ${m.text}`).join('\n')
    parts.push(`Recent conversation (context only):\n${lines}\n`)
  }
  parts.push(`Message to translate:\n${input.text}`)
  return parts.join('\n')
}

/**
 * Context- and register-aware Claude translator. Model defaults to a fast one
 * (translation is latency-sensitive, not a reasoning task) so no thinking/effort.
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
```

- [ ] **Step 4: Run — expect PASS.** `npm test -- claude-translator`
- [ ] **Step 5: Commit.** `git add packages/server/src/claude-translator.* && git commit -m "feat(server): context- and register-aware Claude translator"`

---

## Task 2: Server — /translate HTTP endpoint alongside WS

**Files:**
- Rewrite: `packages/server/src/server.ts` (add http server + CORS + /translate; keep dispatcher WS)

- [ ] **Step 1: Rewrite `server.ts`** to serve HTTP and attach the WS server to it:

```ts
import { createServer, ServerResponse } from 'node:http'
import { WebSocketServer, WebSocket } from 'ws'
import { randomUUID } from 'node:crypto'
import type { ClientMessage, ServerMessage } from '@rst/core'
import { Dispatcher } from './dispatcher.ts'
import {
  createClaudeTranslate,
  createAnthropicClient,
  type TranslateFn,
  type ContextMessage,
} from './claude-translator.ts'

const PORT = Number(process.env.PORT ?? 8787)
const apiKey = process.env.ANTHROPIC_API_KEY
const model = process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5'

let translate: TranslateFn | null = null
if (apiKey) {
  translate = createClaudeTranslate(createAnthropicClient(apiKey), model)
  console.log(`translation: Claude context-aware (${model})`)
} else {
  console.log('translation: none server-side — clients use the free fallback')
}

function cors(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'content-type')
}

interface TranslateBody { text: string; sourceLang: string; targetLang: string; context?: ContextMessage[] }
function isBody(v: unknown): v is TranslateBody {
  const o = v as Record<string, unknown>
  return !!o && typeof o.text === 'string' && typeof o.sourceLang === 'string' && typeof o.targetLang === 'string'
}

const server = createServer((req, res) => {
  if (req.method === 'OPTIONS') { cors(res); res.writeHead(204); res.end(); return }
  if (req.method === 'POST' && req.url === '/translate') {
    if (!translate) { cors(res); res.writeHead(503); res.end(JSON.stringify({ error: 'no translator' })); return }
    let raw = ''
    req.on('data', (c) => (raw += c))
    req.on('end', async () => {
      cors(res)
      let parsed: unknown
      try { parsed = JSON.parse(raw) } catch { res.writeHead(400); res.end(JSON.stringify({ error: 'invalid json' })); return }
      if (!isBody(parsed)) { res.writeHead(400); res.end(JSON.stringify({ error: 'bad body' })); return }
      try {
        const text = await translate!(parsed)
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ text }))
      } catch (err) {
        console.error('translate failed:', err)
        res.writeHead(502); res.end(JSON.stringify({ error: 'translate failed' }))
      }
    })
    return
  }
  cors(res); res.writeHead(404); res.end()
})

// --- WS dispatcher (unchanged behavior) sharing the same HTTP server ---
const dispatcher = new Dispatcher()
const sockets = new Map<string, WebSocket>()
const wss = new WebSocketServer({ server })

function send(clientId: string, msg: ServerMessage): void {
  const ws = sockets.get(clientId)
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg))
}
function offerTo(driverId: string, riderId: string): void {
  const v = dispatcher.viewForOffer(riderId, driverId)
  if (v) send(driverId, { type: 'offer', details: v.details, rider: v.rider })
}

wss.on('connection', (ws) => {
  const clientId = randomUUID()
  sockets.set(clientId, ws)
  ws.on('message', (rawMsg) => {
    let msg: ClientMessage
    try { msg = JSON.parse(rawMsg.toString()) } catch { return }
    if (msg.type === 'go-online') {
      const r = dispatcher.goOnline(clientId)
      if (r.offeredTo && r.riderId) offerTo(r.offeredTo, r.riderId)
    } else if (msg.type === 'request') {
      const r = dispatcher.request(clientId, msg.details)
      send(clientId, { type: 'waiting' })
      if (r.offeredDriverId) offerTo(r.offeredDriverId, clientId)
    } else if (msg.type === 'accept') {
      const r = dispatcher.accept(clientId)
      if (r.matched && r.riderId && r.driverId) {
        const rv = dispatcher.viewFor(r.riderId); const dv = dispatcher.viewFor(r.driverId)
        if (rv) send(r.riderId, { type: 'matched', ride: rv })
        if (dv) send(r.driverId, { type: 'matched', ride: dv })
      }
    } else if (msg.type === 'decline') {
      const r = dispatcher.decline(clientId)
      if (r.reofferedTo && r.riderId) offerTo(r.reofferedTo, r.riderId)
    } else if (msg.type === 'advance') {
      const r = dispatcher.advance(clientId, msg.phase)
      if (r.phase) { send(clientId, { type: 'phase', phase: r.phase }); if (r.partnerId) send(r.partnerId, { type: 'phase', phase: r.phase }) }
    } else if (msg.type === 'cancel') {
      const r = dispatcher.cancel(clientId)
      if (r.partnerId) send(r.partnerId, { type: 'phase', phase: 'cancelled' })
      if (r.withdrawnDriverId) send(r.withdrawnDriverId, { type: 'offer-withdrawn' })
    } else if (msg.type === 'chat') {
      const view = dispatcher.viewFor(clientId); const partnerId = dispatcher.partnerOf(clientId)
      if (view && partnerId) send(partnerId, { type: 'chat', text: msg.text, fromRole: view.you, ts: Date.now(), sourceLang: msg.lang })
    }
  })
  ws.on('close', () => {
    const r = dispatcher.leave(clientId)
    sockets.delete(clientId)
    if (r.partnerId) send(r.partnerId, { type: 'ride-ended', reason: 'partner-left' })
    if (r.withdrawnDriverId) send(r.withdrawnDriverId, { type: 'offer-withdrawn' })
  })
})

server.listen(PORT, () => {
  console.log(`server listening on http://localhost:${PORT} (ws dispatch + POST /translate)`)
})
```

- [ ] **Step 2: Verify** — `npm test` (dispatcher/integration still green), `npx tsc -p packages/server/tsconfig.json --noEmit`, boot on alt port and curl:
  - `PORT=8802 node --experimental-strip-types packages/server/src/server.ts` → prints listening line
  - With no key: `curl -s -X POST localhost:8802/translate -d '{"text":"hi","sourceLang":"en","targetLang":"es"}'` → 503
- [ ] **Step 3: Commit.** `git add packages/server/src/server.ts && git commit -m "feat(server): add /translate endpoint sharing the dispatch server"`

---

## Task 3: Web — server translator with gtx fallback + context wiring

**Files:**
- Create: `packages/web/src/adapters/server-translator.ts`
- Modify: `packages/web/src/lib/translation.ts`
- Modify: `packages/web/src/transport/useRide.ts`

- [ ] **Step 1: Create `server-translator.ts`**

```ts
import type { ContextTurn } from '../lib/translation'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8787'

/** Calls the server's context-aware /translate. Returns null if unavailable so
 *  the caller can fall back to the free client-side translator. */
export async function serverTranslate(
  text: string,
  sourceLang: string,
  targetLang: string,
  context: ContextTurn[],
): Promise<string | null> {
  try {
    const res = await fetch(`${API_URL}/translate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, sourceLang, targetLang, context }),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { text?: string }
    return typeof data.text === 'string' && data.text.length > 0 ? data.text : null
  } catch {
    return null
  }
}
```

- [ ] **Step 2: Update `lib/translation.ts`** to try the server first, then gtx:

```ts
import { CurrencyTransform } from '@rst/core'
import { FreeTranslator } from '../adapters/free-translator'
import { FxRateProvider } from '../adapters/fx-rate-provider'
import { serverTranslate } from '../adapters/server-translator'

export interface ContextTurn { role: 'driver' | 'rider'; text: string }

export const fxRates = new FxRateProvider()
const translator = new FreeTranslator()
const currency = new CurrencyTransform(fxRates)

/**
 * Translate an incoming message into the recipient's language, then annotate any
 * Rupiah amounts with a USD estimate. Prefers the server's context-aware Claude
 * translator; falls back to the free gtx translator when it is unavailable.
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
    translated =
      (await serverTranslate(text, sourceLang, targetLang, context)) ??
      (await translator.translate({ text, sourceLang, targetLang })).text
  }
  return currency.apply(translated, { recipient: { role: 'rider', language: targetLang } })
}
```

- [ ] **Step 3: Wire context in `useRide.ts`** — keep a rolling history ref and pass it to `translateMessage`. In the hook body add:

```ts
  const historyRef = useRef<{ role: Role; text: string }[]>([])
  const pushHistory = (role: Role, text: string) => {
    historyRef.current = [...historyRef.current, { role, text }].slice(-6)
  }
```

  In `receiveChat`, capture context BEFORE adding the new turn, pass it, then record:

```ts
  const receiveChat = useCallback((text: string, sourceLang: string, fromRole: Role) => {
    const id = nextId.current++
    const context = historyRef.current.slice(-6)
    setMessages((prev) => [...prev, { id, original: text, translated: text, fromRole, mine: false, ts: Date.now() }])
    void translateMessage(text, sourceLang, langRef.current, context).then((translated) => {
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, translated } : m)))
      void synth.current?.speak(translated, speechCode(langRef.current)).catch(() => {})
    })
    pushHistory(fromRole, text)
  }, [])
```

  In `sendChat`, after sending, record the outgoing turn: `pushHistory(myRole, trimmed)`.
  Reset `historyRef.current = []` inside `reset()` and at the start of `chooseRole`.
  Update the `translateMessage` import to the new signature (context arg) — already covered.

- [ ] **Step 4: Verify** — `npx tsc -p packages/web/tsconfig.json --noEmit` clean; `npm -w @rst/web run build` succeeds.
- [ ] **Step 5: Commit.** `git add packages/web/src && git commit -m "feat(web): route translation through server (context-aware) with gtx fallback"`

---

## Task 4: Verify + docs

- [ ] **Step 1: Full sweep** — `npm test` (all green), all three `tsc --noEmit` clean, `RELAY_PORT=8801 WEB_PORT=5183 npm run test:e2e` green (English↔English needs no translation).
- [ ] **Step 2: Optional live check (if a key is provided)** — export `ANTHROPIC_API_KEY`, boot server, `curl` /translate with an EN→ES colloquial example and confirm a natural, non-literal result.
- [ ] **Step 3: README** — note that setting `ANTHROPIC_API_KEY` upgrades translation to context-aware Claude (`claude-haiku-4-5` by default; `ANTHROPIC_MODEL` to override); without it, the free `gtx` fallback is used. Update `packages/server/.env.example` default model to `claude-haiku-4-5`.
- [ ] **Step 4: Commit.** `git add -A && git commit -m "docs: document context-aware Claude translation"`

---

## Self-Review Notes

- **Spec coverage:** context-aware/colloquial prompt (Task 1) ✓; recent-context passing (Tasks 1,3) ✓; server-side key (Task 2) ✓; Claude-when-key + gtx fallback (Tasks 2,3) ✓; currency/speech untouched (Task 3 keeps CurrencyTransform + TTS) ✓; tests (Tasks 1,4) ✓.
- **Type consistency:** `TranslateInput`/`ContextMessage` (server) ↔ `/translate` body ↔ `ContextTurn` (web) all carry `{role,text}` + `text/sourceLang/targetLang`. `createClaudeTranslate(client, model)` signature unchanged (context is per-call input), so existing Task-earlier tests still compile.
- **Fallback intent:** spec said "server falls back to gtx"; implemented as **client-side** gtx fallback (more robust: also covers server-down), which satisfies the free-by-default property.
- **Model:** `claude-haiku-4-5`, plain `messages.create` (no `thinking`/`effort` — unsupported on Haiku and unneeded for translation).
