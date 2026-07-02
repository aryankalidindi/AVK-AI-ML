# OrderUp Backend

Voice-to-DoorDash ordering backend. Say it → parse (Claude) → cart (Playwright
on your logged-in DoorDash session) → ntfy notification → you confirm → placed.

Spec: `../docs/superpowers/specs/2026-07-02-voice-doordash-ordering-design.md`

## Setup

1. `npm install && npx playwright install chromium`
2. `cp .env.example .env` — set `AUTH_TOKEN` (long random string) and `ANTHROPIC_API_KEY`
3. `brew install ntfy && ntfy serve --listen-http :8090` (subscribe to topic `orderup` in the ntfy app over Tailscale)
4. `npm run login` — log in to DoorDash once; the browser profile persists
5. `npm run dev`

## Safety

- `DRY_RUN=true` (the default) never checks out. Real ordering is opt-in.
- Checkout only happens on `POST /orders/:id/confirm`, and the state machine
  makes `placing` unreachable except from `awaiting_confirmation`.
- `MAX_ORDER_CENTS` (default $50) requires `acknowledgeOverCap: true` above the cap.
- Every automation step saves a screenshot to `./screenshots/`.

## API (all routes require `Authorization: Bearer $AUTH_TOKEN`)

| Route | Effect |
|---|---|
| `POST /orders {utterance}` | Start an order (202; one in flight at a time) |
| `GET /orders` / `GET /orders/:id` | History / status polling |
| `POST /orders/:id/choose {choiceId}` | Answer a clarify question or pick a suggestion |
| `POST /orders/:id/confirm {acknowledgeOverCap?}` | Place the order (dry-run aware) |
| `POST /orders/:id/cancel` | Cancel |

## When DoorDash changes their site

Selectors live only in `src/doordash/selectors.ts`. Read the failure
notification (it names the step), open the screenshot, fix the selector,
re-run the dry-run verification flow (plan Task 14).
