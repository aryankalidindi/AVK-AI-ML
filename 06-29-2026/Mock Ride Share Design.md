
# Mock Rideshare with Auto-Pairing — Design (Phase 1)

The Mock RideShare is just a base so we can test and create the [[6-29-2026 Live Speech Translation Design]].
what is up



**Date:** 2026-06-29
**Status:** Approved (design phase)
**Supersedes:** the room-code connection model from
`2026-06-29-live-speech-translation-rideshare-design.md`

## Problem

The previous POC connected two devices with a manually-typed room code. We're
replacing that with a believable mock rideshare flow: a rider and a driver are
**auto-paired** into a shared ride with no code. The rideshare framing exists
only to justify codeless pairing — the matching logic is intentionally trivial.

This is **Phase 1**: a mock rideshare app that works end-to-end (auto-pair →
ride → in-ride text chat) with a modern UI. **Phase 2** (separate spec) layers
speech-to-speech translation into the in-ride chat using a free API.

## Scope

**In scope (Phase 1)**
- Codeless auto-pairing: server pairs the next waiting rider with the next
  waiting driver into a Ride.
- Role selection (Rider / Driver) on launch.
- Ride lifecycle: requesting → matched → in-ride → ended, with explicit,
  visible states and no silent failures.
- Shared ride screen: other-party card (mock identity; driver shows car +
  plate), status line, a lightweight animated offline map, and in-ride **text**
  chat.
- Modern dark-premium UI built with the frontend-design skill.
- Disconnect handling: if a participant leaves, the ride ends and the partner
  is notified.

**Out of scope (Phase 1)**
- Real matching/dispatch logic, geolocation, real maps/tiles, payments, ratings.
- Translation of any kind (Phase 2 reintroduces it into the chat).
- Persistence / database (in-memory only).
- Authentication.

## Constraints

- No external API calls in Phase 1 (mock identities, offline stylized map).
- Follow the user's web rules: design tokens via CSS custom properties,
  semantic HTML, compositor-friendly animation, immutable data, small focused
  files, 80%+ test coverage.

## Architecture

Keep the TypeScript monorepo. Reuse `@rst/core`'s translation pipeline in Phase
2; it is dormant in Phase 1.

```
packages/
├── core/        ← unchanged; translation pipeline parked for Phase 2
├── server/      ← MatchingService (queues + rides) over WebSocket
└── web/         ← new modern UI: role select → requesting → ride + chat
```

### Server — MatchingService (replaces RoomRegistry)

- Two waiting queues keyed by role. On connect a client sends `join` with its
  `role`. The service pops a waiting counterpart and creates a `Ride` with a
  generated `rideId` and mock identities for both sides.
- Relays `chat` messages between the two participants of a ride.
- On disconnect: ends the ride, notifies the partner (`ride-ended`).
- Pure, testable core (`MatchingService`) separate from the WebSocket wiring,
  mirroring how `RoomRegistry` was structured.

Message envelope (server → client):

```ts
type ServerMessage =
  | { type: 'waiting' }                                   // queued, no match yet
  | { type: 'matched'; ride: RideView }                   // paired into a ride
  | { type: 'chat'; text: string; fromRole: Role; ts: number }
  | { type: 'ride-ended'; reason: 'partner-left' | 'completed' }
```

Client → server:

```ts
type ClientMessage =
  | { type: 'join'; role: Role }
  | { type: 'chat'; text: string }
  | { type: 'end-ride' }
```

`RideView` carries what the UI needs: `rideId`, `you` (role), and `partner`
(mock display name, and for a driver partner: car model + plate + ETA).

### Web — screens

1. **RoleSelect** — choose Rider or Driver.
2. **Requesting** — Rider: "Finding a driver…"; Driver: "Waiting for a request…".
   Shows a cancel action. Reflects `waiting` state.
3. **Ride** — partner card, ride status, animated offline map header, in-ride
   chat (text), and *End ride*.

Connection state (connecting / waiting / matched / ended / disconnected) is
explicit with visible feedback.

### Map

A self-contained stylized map: an SVG/CSS scene with a route line and a car
marker that animates along it (compositor-friendly `transform` only). No tiles,
no geolocation, no network.

### Mock identities

Generated server-side from small name/car/plate pools so each ride feels
populated (e.g., rider "Maya", driver "Budi · Toyota Avanza · B 1234 XYZ").

## Visual Direction

Dark premium: deep neutral background, a single confident accent, map-forward
layout, refined type pairing, purposeful motion (matching pulse, marker glide,
message rise). Built via the frontend-design skill. Honors reduced-motion.

## Testing

- **Unit (server, priority):** `MatchingService` — queueing, pairing order,
  partner lookup, ride teardown on leave.
- **Integration:** two mock WebSocket clients auto-pair and exchange a chat
  message through a real relay.
- **E2E (Playwright):** two browser contexts pick Rider/Driver, auto-connect
  (no code), and exchange a chat message; assert the matched + message states.

## Key Properties

1. **Codeless** — pairing is automatic; nothing is typed to connect.
2. **Believable but trivial** — realistic ride UX over deliberately minimal
   matching logic.
3. **Offline by default** — no external calls in Phase 1.
4. **Phase-2 ready** — the in-ride chat is the seam where speech-to-speech
   translation drops in next, reusing `@rst/core`.
