# Context-Aware Translation — Design (Phase 3)

**Date:** 2026-07-02
**Status:** Approved (design phase)
**Builds on:** the live speech + free-`gtx` translation from the prior phase.

## Problem

Machine translation (the current free `gtx` endpoint) is literal and
register-flat. It loses the *depth* of natural speech: "where should I pick you
up?" comes back as stiff, formal text instead of how a native speaker would
actually say it, and slang/idiom get mangled. In a live rideshare chat this
causes confusion on both sides.

The fix is **not** a bespoke trained model. An LLM (Claude), given the
conversation context plus a domain- and register-aware instruction, already does
context-sensitive, colloquial translation. We route translation through Claude
when a key is available, and keep the free `gtx` translator as a keyless
fallback.

## Scope

**In scope**
- A **context-aware translator** that translates the *intent and register* of a
  message, not the literal words: casual spoken tone, preserved meaning,
  localized idioms/slang, rideshare domain awareness.
- Uses **recent conversation context** (last ~6 messages) to disambiguate
  pronouns/deixis ("here", "it", "you").
- Runs **server-side** so the API key never reaches the browser: a `/translate`
  HTTP endpoint on the existing WS server.
- **Claude when `ANTHROPIC_API_KEY` is set** (`claude-haiku-4-5` by default for
  low latency); **free `gtx` fallback** when no key, preserving the zero-setup
  default and the no-surprise-API rule.
- Client points its translation at the server endpoint; **currency annotation
  and speech (STT/TTS) stay exactly as they are** and run after translation.

**Out of scope**
- Training/fine-tuning any model.
- Translating the currency amounts via the LLM (kept as the deterministic
  `CurrencyTransform`).
- Changing dispatch, ride lifecycle, or the on-device Whisper mic.

## Constraints

- API key is server-side only; never sent to or stored in the browser.
- Claude is invoked **only** when `ANTHROPIC_API_KEY` is present; otherwise no
  external LLM call happens at all.
- Use the official `@anthropic-ai/sdk` (already a server dependency) and current
  model IDs / params per the `claude-api` skill.
- Follow web + TS rules: typed boundaries, small files, graceful error handling,
  80%+ coverage on pure logic.

## Architecture

```
browser (recipient client)
  received chat message + last ~6 messages + sourceLang + targetLang
        │  POST /translate
        ▼
server (@rst/server)
  ContextTranslator
    ├─ Claude (claude-haiku-4-5)  ← when ANTHROPIC_API_KEY set
    └─ gtx fallback               ← when no key OR Claude errors
        │  { text }
        ▼
browser: CurrencyTransform annotates Rp→USD, render + TTS  (unchanged)
```

### Server — `/translate` endpoint + `ContextTranslator`

- The existing WS server also serves HTTP (as an earlier phase did): add
  `POST /translate` with CORS.
- Request body:
  ```ts
  interface TranslateRequest {
    text: string
    sourceLang: string   // ISO code, e.g. 'en'
    targetLang: string   // ISO code, e.g. 'es'
    context?: Array<{ role: 'driver' | 'rider'; text: string }>  // recent turns, oldest→newest
  }
  ```
- Response: `{ text: string }`.
- `ContextTranslator` is a pure-ish unit (Claude client injected) that builds the
  prompt and returns translated text. Tested with a fake client.

### Prompt strategy (Claude)

- **System:** the engine's job — translate a live rideshare driver↔rider
  conversation from `<source>` to `<target>`. Convey the speaker's *intent* the
  way a native `<target>` speaker would naturally say it in this situation:
  casual spoken register, contractions, localized idioms/slang; never word-for-
  word or overly formal. Preserve names, numbers, and currency amounts verbatim.
  Output ONLY the translation — no quotes, no notes.
- **Context:** prior turns rendered as `driver:`/`rider: ` lines so pronouns and
  deixis resolve.
- **User turn:** the message to translate.
- No thinking needed (latency-sensitive); `max_tokens` modest.

### Client

- Replace the direct `gtx` call in `lib/translation.ts` with a call to the
  server `/translate` endpoint, passing the last ~6 chat messages as context.
- If the endpoint is unreachable, fall back to the original text (as today).
- `useRide` already holds the message list; it supplies the context slice.

## Fallback & failure behavior

- No key → server uses `gtx` (current quality) transparently.
- Claude error/timeout → server falls back to `gtx`, then to original text.
- Endpoint unreachable → client shows original text. Chat never blocks or breaks.

## Testing

- **Unit (server):** `ContextTranslator` with a fake Claude client — builds a
  prompt containing source/target + context lines; returns the model's text;
  falls back on error. `gtx` fallback selection when no key.
- **Integration:** `POST /translate` returns `{ text }` for a request (mock
  translate fn); validates body; CORS preflight.
- **E2E:** unchanged happy-path stays green (English↔English needs no network).
- Manual/scripted cross-language check remains the acceptance proof for quality.

## Key Properties

1. **Context-aware & colloquial** — intent + register, not literal words.
2. **Key stays server-side** — browser never sees it.
3. **Free by default** — `gtx` fallback keeps zero-setup working.
4. **Composable** — currency + speech unchanged; translation is one swappable stage.
