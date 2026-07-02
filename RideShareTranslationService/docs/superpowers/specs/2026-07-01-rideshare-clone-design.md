# Uber/Grab-Style Rideshare Clone — Design (Phase 1.5)

**Date:** 2026-07-01
**Status:** Approved (design phase)
**Builds on:** `2026-06-29-mock-rideshare-autopair-design.md` (auto-pairing, chat, dark UI)

## Problem

Phase 1 gave us codeless auto-pairing + in-ride chat. We now want it to *feel*
like a real Uber/Grab: booking with pickup/destination and fare, a driver who
receives and accepts a request, a full ride lifecycle, and end-of-trip
receipt/earnings. Speech-to-speech translation comes after this (Phase 2), and
plugs into the in-ride chat seam.

## Scope

**In scope**
- **Rider booking:** choose pickup + destination (preset places), pick a ride
  type (Bike / Economy / Premium), see a computed **fare estimate + ETA**, request.
- **Driver dispatch:** go online → receive an **incoming request** (pickup,
  destination, fare) → **Accept / Decline**. Declines re-route to another online
  driver (or wait for one).
- **Ride lifecycle** (driver-controlled): `searching → accepted → arrived →
  in_progress → completed`, plus `cancelled`. Rider may cancel before the trip
  starts. State stays in sync on both devices.
- **Ride screen:** phase-aware status, animated map, partner card, in-ride chat.
- **End:** rider sees a **fare receipt + star rating**; driver sees **earnings**.
- Dark premium UI throughout; reduced-motion honored.

**Out of scope**
- Real geolocation/maps/tiles, real routing, payments, persistence, auth.
- Translation (Phase 2 — the chat is the seam).

## Constraints

- No external API calls (preset places, computed fares, offline map).
- Fare/places/lifecycle logic that is pure lives in `@rst/core` (shared, tested);
  the Node server imports **types only** from core (runtime import of core source
  breaks Node's strip-types loader).
- Follow the user's web rules: CSS tokens, semantic HTML, compositor-friendly
  motion, immutable data, small files, 80%+ coverage.

## Domain model (in `@rst/core`)

- **Places:** a preset list, each with a position on a line; `distanceKm(a,b)` =
  `max(1, |posA − posB|)`. (e.g., Airport 0, Kuta 3, Seminyak 6, Sanur 8, Canggu
  10, Ubud 18.)
- **Ride types:** Bike / Economy / Premium, each `{ base, perKm, emoji }`.
- **Fare:** `estimateFare(distanceKm, typeId) → { fare, etaPickupMins, tripMins }`,
  fare in **IDR** rounded to the nearest 500 (ties into Phase 2 currency
  conversion). `formatIDR(n)` → `"Rp 45.000"`.

**The rider computes the fare client-side and sends it in the request**, so the
server carries ride details as opaque data (no core runtime import server-side).

## Protocol (extends `rideshare/protocol.ts`)

```ts
type RideTypeId = 'bike' | 'economy' | 'premium'
interface RideDetails { pickup; destination; rideType: RideTypeId; fare; distanceKm; etaPickupMins; tripMins }
type RidePhase = 'searching' | 'accepted' | 'arrived' | 'in_progress' | 'completed' | 'cancelled'

interface RideView { rideId; you: Role; partner: PartnerView; details: RideDetails; phase: RidePhase }

type ClientMessage =
  | { type: 'go-online' }
  | { type: 'request'; details: RideDetails }
  | { type: 'accept' } | { type: 'decline' }
  | { type: 'advance'; phase: RidePhase }
  | { type: 'cancel' }
  | { type: 'chat'; text: string }

type ServerMessage =
  | { type: 'waiting' }
  | { type: 'offer'; details: RideDetails; rider: PartnerView }
  | { type: 'matched'; ride: RideView }
  | { type: 'phase'; phase: RidePhase }
  | { type: 'chat'; text; fromRole: Role; ts }
  | { type: 'ride-ended'; reason: 'partner-left' }
```

## Server — Dispatcher (replaces MatchingService)

Holds: online-driver pool, pending rider requests, outstanding offers
(`driverId → {riderId, details}`), active rides (with `details` + `phase`),
and generated identities.

- `request(riderId, details)` → offer to a waiting driver, else queue.
- `goOnline(driverId)` → take a pending request as an offer, else pool.
- `accept(driverId)` → create ride (phase `accepted`), notify both `matched`.
- `decline(driverId)` → re-offer the request to another driver (or re-queue);
  the decliner returns to the online pool.
- `advance(driverId, phase)` → update ride phase, relay `phase` to both.
- `cancel(clientId)` → phase `cancelled`, relay, teardown.
- `leave(clientId)` → clean pools/offers; if in a ride, `ride-ended` to partner.
- `viewFor(clientId)` → `RideView` with partner, details, current phase.

Pure and unit-tested, separate from the WebSocket wiring.

## Web — screens

1. **RoleSelect** (existing).
2. **Rider / Book:** pickup + destination selectors, ride-type cards with live
   fare, *Request ride*.
3. **Rider / Searching:** "Finding your driver" (radar).
4. **Driver / Online:** "You're online"; an **incoming request card** with
   Accept / Decline when an offer arrives.
5. **Ride (shared, phase-aware):** map + partner card + status line that reads
   per phase ("Budi is on the way" / "arrived" / "On trip") + chat. Driver has
   the phase button (Arrived → Start trip → Complete); rider has Cancel pre-trip.
6. **Completed:** rider receipt (fare, route, rating stars); driver earnings.
7. **Ended / Cancelled** notices with return-to-start.

Driven by an expanded `useRide` state machine.

## Testing

- **Unit (core):** `distanceKm`, `estimateFare`, `formatIDR`.
- **Unit (server, priority):** Dispatcher — request/offer/accept, decline
  re-route, phase advance, cancel, leave teardown.
- **Integration:** driver online → rider request → offer → accept → phase
  advance → chat over a real relay.
- **E2E (Playwright):** full happy path across two browsers — driver online,
  rider books + requests, driver accepts, arrived → start → complete, receipt
  shows the fare.

## Key Properties

1. **Feels like Uber/Grab** — booking, fare, accept, lifecycle, receipt.
2. **Codeless** — dispatch routes automatically; the only tap is Accept.
3. **Offline** — no external calls; fares/places/map are local.
4. **Phase-2 ready** — the in-ride chat remains the translation seam.
