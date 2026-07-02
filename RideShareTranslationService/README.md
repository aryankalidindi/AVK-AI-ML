# RideLingo — Mock Rideshare (Uber/Grab-style)

A mock rideshare app: a rider books a trip (pickup, destination, ride type +
fare), a driver receives and **accepts** the request, and the trip plays out
through a full lifecycle, ending in a receipt/earnings. **No codes** — dispatch
is automatic. Modern dark UI.

**Phase 2** (next) layers **speech-to-speech translation** into the in-ride chat
using a free API. The translation pipeline for that already lives in `@rst/core`.

## Packages

- `@rst/core` — types, preset places, fare math, and the (parked) translation pipeline
- `@rst/server` — WebSocket **Dispatcher**: routes requests → offers → rides and
  drives the lifecycle; relays chat
- `@rst/web` — React app: role select → book / go online → ride (map, partner, chat) → receipt

## Flow

Open two windows. Each person picks the language **they speak**. In one, choose
**Driver** and go online; in the other, choose **Rider**, pick pickup/destination
+ a ride type (with a live fare, shown in local **and** your own currency), and
**Request**. The driver **Accepts**, then drives the lifecycle
(**Arrived → Start trip → Complete**). No codes — dispatch is automatic.

## Live translation

In the ride, tap the 🎙 mic (or type). Each message is **translated into the
other person's language in real time**, spoken aloud, and any Rupiah amount is
annotated with a USD estimate.

Speech recognition runs **fully on-device** with Whisper via `transformers.js`
(WASM in a Web Worker) — no cloud speech service, so it works in any browser
regardless of Google/Apple availability. The model (~40 MB) is fetched once from
the Hugging Face CDN on first mic use, then cached. FX rates come from
`open.er-api.com`, and text-to-speech uses the browser's local voices.

### Translation quality

Translation prefers a **context-aware Claude** engine and falls back to a free
one:

- **Set `ANTHROPIC_API_KEY` on the server** → messages are translated by Claude
  (`claude-haiku-4-5` by default; `ANTHROPIC_MODEL` to override) via the server's
  `/translate` endpoint. It's prompted to convey *intent and register* — natural,
  colloquial phrasing, localized idioms/slang — and it's given the **last few
  turns** as context to resolve "here", "it", pronouns, etc. The key stays
  server-side; the browser never sees it.
- **No key** → the client falls back to Google's free public `gtx` endpoint
  (keyless, literal but serviceable). Same fallback if the server is unreachable.

No API keys are required to run the app; the Claude path is an opt-in quality
upgrade.

### Glossary & original text

- A small **glossary** (`packages/core/src/rideshare/glossary.ts`) pins app terms
  and Bali place names to canonical translations (or keeps them verbatim). It's
  fed to Claude as a hint and enforced on the machine-translated output as a
  safety net. Pure and local — **no key, no network**.
- Every translated message has a **Show original** toggle to reveal the exact
  words the other person said, then hide it again.

## Run

```bash
npm install
npm run dev:server   # ws://localhost:8787  (dispatch + chat)
npm run dev:web      # http://localhost:5173
```

## Test

```bash
npm test          # unit + integration (Vitest)
npm run test:e2e  # full ride happy path across two browsers (Playwright)
```

Ports are overridable for isolated E2E runs: `RELAY_PORT=8801 WEB_PORT=5183 npm run test:e2e`.

## Design docs

- Spec: `docs/superpowers/specs/2026-06-29-mock-rideshare-autopair-design.md`
- Plan: `docs/superpowers/plans/2026-06-29-mock-rideshare-autopair.md`
