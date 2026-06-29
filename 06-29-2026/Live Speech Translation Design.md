# Live Speech Translation Rideshare POC — Design

The Live Speech design will be integrated into the [[6-29-2026 Mock RideShare Design]]. However, the Live Speech is the main functionality that we are pursuing and testing.

**Date:** 2026-06-29
**Status:** Approved (design phase)

## Problem

When using rideshare apps (Grab, Uber) abroad, conversation between rider and
driver is lost in translation, and prices quoted by drivers/merchants require
manual currency conversion. The end goal is an add-on for existing rideshare
apps. This POC is a standalone rideshare-style app that proves out a
**real-time, two-party, bidirectional speech translation** experience, designed
so that real translation/speech APIs can be dropped in later with no
rearchitecting.

## Scope

**In scope**
- Live two-party speech translation: each participant speaks in their own
  language; the other receives translated **text + spoken audio** on their
  device. The same code runs on both ends — "driver" vs "rider" is just a role.
- Currency conversion as an **optional pluggable transform** in the translation
  pipeline (sets up the merchant/haggling use case without a separate mode).
- Provider interfaces for every stage (STT, translate, TTS) with **mock
  implementations** as the default, so the entire POC runs offline.
- A tiny WebSocket relay server enabling a genuine two-device demo.

**Out of scope (for now)**
- Real external translation / speech / FX APIs (interfaces only; real adapters
  added later — and never wired without explicit confirmation).
- A separate single-user "merchant mode" (the currency transform makes this a
  later config flag, not new architecture).
- Native mobile build (core is platform-agnostic so it can move to React Native
  later).

## Constraints

- **No external API calls in the default build.** The browser Web Speech API
  (which routes audio to Google/Apple servers) is available only as an opt-in
  adapter, never the default. Any real API (translation, FX rates, STT) is
  surfaced for confirmation before wiring.
- Follows the user's web rules: design tokens via CSS custom properties,
  semantic HTML, compositor-friendly animation, immutable data patterns,
  small focused files, 80%+ test coverage.

## Architecture & Module Boundaries

Three layers. Hard rule: **all speech/translation logic lives in a
platform-agnostic core with zero browser or network dependencies.**

```
packages/
├── core/          ← platform-agnostic, pure TypeScript, no DOM/no network
│   ├── pipeline   ← detect → translate → transform(s) → deliver
│   ├── providers  ← interfaces + mock implementations
│   └── session    ← session/role model, message types
├── web/           ← React app: mic UI, transcript, role selection, room code
└── server/        ← tiny Node WebSocket relay (dumb message router)
```

- **`core`** knows nothing about React, WebSockets, or microphones. Given text +
  language config, it produces translated results. This is what later drops into
  React Native.
- **`web`** is the "dumb terminal" — captures input, renders transcript, plays
  audio. It wires browser capabilities (mic, speakers) into the core's provider
  interfaces.
- **`server`** only relays messages between two clients in a room. It never sees
  translation logic.

The same pipeline runs for both participants. "Driver" and "rider" are just a
`role` label + a `language` preference; the pipeline is identical in both
directions.

## Provider Interfaces (the swappable heart)

Three stages, each behind an interface, each with a mock implementation now:

```ts
interface SpeechRecognizer {           // STT
  start(onResult: (text: string, isFinal: boolean) => void): void
  stop(): void
}

interface Translator {                 // text → text
  translate(input: TranslationRequest): Promise<TranslationResult>
}

interface SpeechSynthesizer {          // TTS
  speak(text: string, lang: string): Promise<void>
}
```

Forward-looking interface so a real streaming live-translation API can later
replace **several stages at once**:

```ts
interface StreamingTranslationProvider {
  // audio in → translated text + audio out, end to end
  openSession(config: StreamingConfig): StreamingSession
}
```

**Defaults for the POC**
- `MockSpeechRecognizer` — canned/typed phrases simulating "what was heard".
- `MockTranslator` — rule-based pseudo-translation, no network.
- `WebSpeechSynthesizer` — local OS voices (no network).
- `WebSpeechRecognizer` — real mic-to-text adapter, **opt-in only**.

Later, real implementations swap in without touching the pipeline, UI, or server.

## Translation Pipeline & Currency Transform

The core is a small composable pipeline. An incoming utterance flows through
ordered stages:

```
recognize → translate → [transforms...] → deliver(text + speak)
```

- **Translation happens receiver-side**: each client translates incoming
  messages into *its own* user's language. Symmetric logic — every client does
  the same thing — and a client only needs to know one target language (its own).
- **Transforms** are optional post-translation steps. `CurrencyTransform` is the
  first: it scans translated text for monetary amounts (e.g., "50,000 rupiah" /
  "Rp50.000") and annotates them with a USD conversion →
  "Rp50,000 (~$3.10 USD)". It uses a `RateProvider` interface with a
  `MockRateProvider` (static table) now; a real FX API drops in later (with
  confirmation before wiring).

The merchant/haggling use case later = run the same pipeline with the currency
transform enabled. No separate mode, no rearchitecting.

## Transport & Session Model

- Node WebSocket relay. One client **creates** a session → gets a short room
  code; the other **joins** with that code. Two participants per room.
- Message envelope (relayed verbatim; server stays dumb):

```ts
type SessionMessage = {
  sessionId: string
  senderRole: 'driver' | 'rider'
  sourceLang: string
  text: string          // recognized text in sender's language
  timestamp: number
}
```

- The sender transmits **recognized text in their own language**; the receiver
  runs translate + transforms locally. Translation work is distributed to each
  device; the wire stays simple.
- Connection states (connecting / waiting-for-peer / active / peer-left) are
  handled explicitly with visible UI feedback — no silent failures.

## Stack & Tooling

- **TypeScript** monorepo (npm/pnpm workspaces).
- **Vite + React** for `web`; **Node + `ws`** for `server`; **Vitest** for tests.
- Design tokens via CSS custom properties; semantic HTML; compositor-friendly
  animation only.
- No external API calls anywhere in the default build.

## Testing

Priority order, per web testing rules:

- **Unit (core — priority):** pipeline ordering, `MockTranslator`,
  `CurrencyTransform` detection/formatting, session message handling — pure
  functions, fully offline, easy to push past 80%.
- **Integration:** two mock clients through a real WebSocket relay; a phrase on
  side A arrives translated on side B.
- **E2E (Playwright):** two browser contexts create/join a room, simulate an
  utterance, assert translated transcript + a TTS call on the other side.

## Key Design Properties

1. **Pluggable everywhere** — STT, translate, TTS, and FX rates are all behind
   interfaces; the default build is 100% offline mocks.
2. **Symmetric** — identical pipeline runs on both participants; role is just a
   label.
3. **Composable** — currency conversion is a pipeline transform, not a special
   case; future transforms (profanity filtering, glossary substitution) slot in
   the same way.
4. **Platform-agnostic core** — no DOM/network in `core`, enabling a later
   React Native port.
5. **Future-proofed for streaming APIs** — `StreamingTranslationProvider` lets a
   single real API replace multiple stages without disturbing the pipeline shape.
