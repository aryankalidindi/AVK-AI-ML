# OrderUp — Voice-to-DoorDash Ordering (Design)

**Date:** 2026-07-02
**Status:** Approved by user (this document formalizes the approved design)

## Summary

Say "Hey Siri, order one McChicken" to a native iOS app. A backend on the
user's Mac parses the request, builds a real cart on the user's own DoorDash
account via browser automation, and sends a notification. The user taps the
notification, reviews the order (restaurant, items, exact totals), and taps
Confirm. Only then is the order placed. Real food arrives.

Single-user, personal-use system. Total running cost: $0 plus Claude API
usage (pennies per order).

## Goals

- One-utterance voice ordering via Siri from a native iOS app.
- Real orders on the user's own DoorDash account (delivery to saved address,
  saved payment method).
- Checkout **never** happens without an explicit Confirm tap.
- High-confidence requests go straight to the confirmation review;
  low-confidence requests ask a clarifying question first.
- Zero subscription cost: free Apple ID signing, self-hosted ntfy push,
  Tailscale free tier.

## Non-Goals

- Multi-user support or App Store distribution (v1 is the user's phone only).
- Other services (Uber Eats, Grubhub, McDonald's app) — DoorDash only.
- Group orders, scheduled orders, promo-code hunting.
- Paid Apple Developer account features (APNs, permanent installs) — designed
  as swappable so they can be adopted later.

## Architecture

Three pieces:

### 1. iOS app — "OrderUp" (SwiftUI + App Intents, free-signed)

- **App Intent** `OrderFoodIntent` with a dictated-text parameter so
  "Hey Siri, order one McChicken" works in a single utterance. Siri passes the
  transcription; the intent POSTs it to the backend over Tailscale.
- **Screens:**
  - **Review** — restaurant, line items, subtotal / fees / tip / total,
    Confirm and Cancel buttons.
  - **Clarify** — a question with tappable choices (e.g., which of two nearby
    McDonald's).
  - **History** — past orders and live status of the in-flight order.
- **Deep links** via custom URL scheme `orderup://` (e.g.,
  `orderup://review/<orderId>`, `orderup://clarify/<orderId>`).
- **Auth:** app holds a shared bearer token; all backend calls require it.
- **Signing:** free Apple ID (7-day provisioning). AltStore on the Mac
  auto-refreshes the signature over Wi-Fi. No APNs (free signing blocks it) —
  push is handled by ntfy (below).

### 2. Backend (TypeScript/Node on the user's Mac)

Bound to the Tailscale interface only; every request requires the shared
bearer token.

- **Parser** — one Claude API call converts the utterance into strict JSON:
  `{ items: [{ name, quantity }], restaurant, confidence }`.
  Confidence threshold decides: high → build cart immediately;
  low → send clarification first. Initial threshold: 0.8, configurable,
  tuned against real utterances during implementation.
- **Order state machine** —
  `received → parsing → clarifying? → building_cart → awaiting_confirmation
  → placing → placed | failed | cancelled | expired`.
  - One in-flight order at a time.
  - `awaiting_confirmation` expires after 10 minutes → `expired`, cart
    abandoned.
- **DoorDash automation** — Playwright driving a persistent Chromium profile
  the user logs into once by hand. Four isolated, individually replaceable
  steps:
  1. `searchRestaurant` — find the store (nearest / order history preferred).
  2. `matchMenuItem` — fuzzy-match requested items to the live menu.
  3. `buildCart` — add items, read exact totals off the page. Stops here.
  4. `placeOrder` — the only step that spends money; runs only after Confirm.
  - Every step saves a screenshot (audit trail + debugging).
  - **Dry-run mode** (default in development): everything runs except
    `placeOrder`.
- **Notifier** — swappable interface. v1 implementation: self-hosted **ntfy**
  (runs on the Mac, inside the tailnet). Notifications carry a tap action
  that deep-links into the app (`orderup://review/<id>`). A future APNs
  implementation replaces ntfy without touching anything else.

### 3. Glue

- **Tailscale** connects iPhone ↔ Mac securely from anywhere; nothing is
  exposed to the public internet.
- Shared bearer token as a second layer inside the tailnet.
- Mac must be awake to order (caffeinate/Amphetamine).

## Flow

1. User: "Hey Siri, order one McChicken" → App Intent POSTs text to backend.
2. Claude parses with confidence score.
3. **High confidence:** backend builds the cart via Playwright, then ntfy
   push: *"McChicken ×1 from McDonald's (Main St) — $8.42 total. Review?"*
   → tap → Review screen → **Confirm** → `placeOrder` runs → "Order placed"
   notification; History shows status.
4. **Low confidence:** ntfy push with a question → tap → Clarify screen →
   user picks → cart builds → same review flow as (3).
5. No confirm within 10 minutes → order expires; user is notified.

## Guardrails

- Checkout never happens without an explicit Confirm tap. No exceptions.
- Dry-run mode is the development default; live checkout is opt-in per
  environment config.
- Configurable per-order spending cap (default $50). Orders over the cap
  require an extra confirmation step on the Review screen.
- One in-flight order at a time.
- Screenshots at every automation step; structured logs for every state
  transition.

## Error Handling

- **Selector rot** (DoorDash redesign): the failing step aborts, screenshot
  saved, user gets a "couldn't complete: <step>" notification. Never a
  silent failure or half-placed order. Step isolation allows swapping a
  broken step for an AI computer-use fallback later without rearchitecting.
- **DoorDash session expired:** "needs re-login" notification; user logs in
  manually on the Mac once.
- **Item unavailable / store closed:** surfaced as a clarification (pick an
  alternative) or a failure notification.
- **Backend unreachable** (Mac asleep, tailnet down): the app shows a clear
  error immediately at intent time.

## Testing

- **Unit:** parser output mapping, confidence thresholding, state machine
  transitions, notifier formatting.
- **Automation steps:** tested against saved HTML fixtures of DoorDash pages;
  live runs use dry-run mode. No test ever spends money.
- **iOS:** intent → request plumbing unit-tested; screens verified on device.

## Prerequisites & Costs

| Item | Cost |
|------|------|
| Free Apple ID signing (+ AltStore for auto-refresh) | $0 |
| ntfy (self-hosted) + ntfy iOS app | $0 |
| Tailscale (personal tier) | $0 |
| Anthropic API key | ~pennies per order |
| Mac awake when ordering | — |

## Accepted Risks

- **DoorDash ToS:** automating one's own account violates DoorDash's terms.
  Single-user, low-volume, residential-IP use makes flagging unlikely but
  possible; the user accepts this risk.
- **7-day signing expiry:** mitigated by AltStore auto-refresh; worst case is
  a 2-minute re-run from Xcode.
- **DOM brittleness:** accepted trade of Approach A (scripted automation)
  over slower/costlier AI-driven browsing; mitigated by step isolation.

## Decisions Log

- Realness: real orders, user's own phone/account (not a mock).
- Service: DoorDash.
- Phone side: native iOS app with App Intents (not a Shortcut), free-signed.
- Backend host: user's Mac + Tailscale.
- Ambiguity: ask a clarifying question when confidence is low; go straight
  to confirmation review when confidence is high.
- Automation approach: scripted Playwright steps (Approach A), structured so
  individual steps can later fall back to an AI agent.
- Push: self-hosted ntfy now; APNs-ready notifier interface for later.
