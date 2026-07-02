# Uber/Grab-Style Rideshare Clone Implementation Plan (Phase 1.5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the auto-pairing mock into an Uber/Grab-style flow: rider books (pickup/destination/type + fare), driver receives & accepts a request, a full ride lifecycle plays out, and the trip ends with a receipt/earnings.

**Architecture:** Pure fare/place logic in `@rst/core` (fare computed rider-side). A `Dispatcher` in the Node WS server routes requests → offers → rides and drives the lifecycle; it imports core **types only**. The React app gains Book (rider), Online/Offer (driver), a phase-aware Ride screen, and a receipt, driven by an expanded `useRide` state machine.

**Tech Stack:** TypeScript, npm workspaces, Vite + React, Node + `ws`, Vitest, Playwright.

---

## File Structure

```
packages/core/src/rideshare/
  places.ts          ← PLACES + distanceKm (NEW)
  fare.ts            ← RIDE_TYPES + estimateFare + formatIDR (NEW)
  protocol.ts        ← extended: RideDetails, RidePhase, RideView, messages (MODIFY)
  *.test.ts          ← places/fare unit tests (NEW)
packages/server/src/
  dispatcher.ts      ← Dispatcher (NEW, replaces matching.ts)
  dispatcher.test.ts ← unit tests (NEW)
  dispatcher.integration.test.ts ← online→request→accept→phase→chat (NEW)
  server.ts          ← rewritten to use Dispatcher (MODIFY)
  matching.ts        ← DELETED
  matching.test.ts / matching.integration.test.ts ← DELETED
packages/web/src/
  transport/useRide.ts   ← expanded state machine (MODIFY)
  components/Book.tsx     ← rider booking (NEW)
  components/DriverOnline.tsx ← online + incoming offer (NEW)
  components/Ride.tsx     ← phase-aware (MODIFY)
  components/Receipt.tsx  ← receipt + rating / earnings (NEW)
  components/RoleSelect.tsx / Requesting.tsx / MapScene.tsx / PartnerCard.tsx / Chat.tsx (reuse)
  components/rideshare.css ← add styles (MODIFY)
  App.tsx                 ← orchestrate new screens (MODIFY)
e2e/ride.spec.ts          ← full happy path (MODIFY)
```

---

## Task 1: Core — places + fare (TDD)

**Files:**
- Create: `packages/core/src/rideshare/places.ts`, `packages/core/src/rideshare/fare.ts`
- Test: `packages/core/src/rideshare/fare.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/rideshare/fare.test.ts
import { describe, it, expect } from 'vitest'
import { PLACES, distanceKm } from './places'
import { estimateFare, formatIDR, RIDE_TYPES } from './fare'

describe('places', () => {
  it('exposes preset places with unique ids', () => {
    const ids = PLACES.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(PLACES.length).toBeGreaterThanOrEqual(4)
  })

  it('computes distance as absolute position delta, min 1', () => {
    const airport = PLACES.find((p) => p.id === 'airport')!
    const ubud = PLACES.find((p) => p.id === 'ubud')!
    expect(distanceKm(airport, ubud)).toBe(18)
    expect(distanceKm(airport, airport)).toBe(1)
  })
})

describe('estimateFare', () => {
  it('computes fare = base + perKm * km, rounded to nearest 500', () => {
    const eco = RIDE_TYPES.find((t) => t.id === 'economy')!
    const r = estimateFare(10, 'economy')
    const raw = eco.base + eco.perKm * 10
    expect(r.fare).toBe(Math.round(raw / 500) * 500)
    expect(r.tripMins).toBeGreaterThan(0)
    expect(r.etaPickupMins).toBeGreaterThan(0)
  })

  it('premium costs more than bike for the same distance', () => {
    expect(estimateFare(10, 'premium').fare).toBeGreaterThan(estimateFare(10, 'bike').fare)
  })
})

describe('formatIDR', () => {
  it('formats with thousands dots and Rp prefix', () => {
    expect(formatIDR(45000)).toBe('Rp 45.000')
    expect(formatIDR(8000)).toBe('Rp 8.000')
    expect(formatIDR(1200000)).toBe('Rp 1.200.000')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- fare.test`
Expected: FAIL — cannot find module `./places`.

- [ ] **Step 3: Implement places + fare**

```ts
// packages/core/src/rideshare/places.ts
export interface Place {
  id: string
  name: string
  /** Position along a 1-D line (km). Distance is the absolute delta. */
  pos: number
}

export const PLACES: Place[] = [
  { id: 'airport', name: 'Ngurah Rai Airport', pos: 0 },
  { id: 'kuta', name: 'Kuta', pos: 3 },
  { id: 'seminyak', name: 'Seminyak', pos: 6 },
  { id: 'sanur', name: 'Sanur', pos: 8 },
  { id: 'canggu', name: 'Canggu', pos: 10 },
  { id: 'ubud', name: 'Ubud', pos: 18 },
]

export function placeByName(name: string): Place | undefined {
  return PLACES.find((p) => p.name === name)
}

export function distanceKm(a: Place, b: Place): number {
  return Math.max(1, Math.abs(a.pos - b.pos))
}
```

```ts
// packages/core/src/rideshare/fare.ts
export type RideTypeId = 'bike' | 'economy' | 'premium'

export interface RideType {
  id: RideTypeId
  label: string
  emoji: string
  base: number
  perKm: number
}

export const RIDE_TYPES: RideType[] = [
  { id: 'bike', label: 'Bike', emoji: '🏍️', base: 5000, perKm: 2500 },
  { id: 'economy', label: 'Economy', emoji: '🚗', base: 10000, perKm: 4500 },
  { id: 'premium', label: 'Premium', emoji: '🚙', base: 18000, perKm: 8000 },
]

export interface FareEstimate {
  fare: number
  etaPickupMins: number
  tripMins: number
}

export function estimateFare(distanceKm: number, typeId: RideTypeId): FareEstimate {
  const type = RIDE_TYPES.find((t) => t.id === typeId) ?? RIDE_TYPES[1]!
  const raw = type.base + type.perKm * distanceKm
  return {
    fare: Math.round(raw / 500) * 500,
    etaPickupMins: 3,
    tripMins: Math.max(2, Math.round(distanceKm * 2.5)),
  }
}

export function formatIDR(amount: number): string {
  const digits = Math.round(amount).toString()
  const withDots = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `Rp ${withDots}`
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- fare.test`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/rideshare/places.ts packages/core/src/rideshare/fare.ts packages/core/src/rideshare/fare.test.ts
git commit -m "feat(core): add rideshare places and fare estimation"
```

---

## Task 2: Core — extend the protocol

**Files:**
- Modify: `packages/core/src/rideshare/protocol.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Replace `packages/core/src/rideshare/protocol.ts`**

```ts
import type { Role } from '../session/types'
import type { RideTypeId } from './fare'

export interface PartnerView {
  role: Role
  displayName: string
  car?: { model: string; plate: string }
  etaMins?: number
}

export interface RideDetails {
  pickup: string
  destination: string
  rideType: RideTypeId
  fare: number
  distanceKm: number
  etaPickupMins: number
  tripMins: number
}

export type RidePhase =
  | 'searching'
  | 'accepted'
  | 'arrived'
  | 'in_progress'
  | 'completed'
  | 'cancelled'

export interface RideView {
  rideId: string
  you: Role
  partner: PartnerView
  details: RideDetails
  phase: RidePhase
}

export type ClientMessage =
  | { type: 'go-online' }
  | { type: 'request'; details: RideDetails }
  | { type: 'accept' }
  | { type: 'decline' }
  | { type: 'advance'; phase: RidePhase }
  | { type: 'cancel' }
  | { type: 'chat'; text: string }

export type RideEndedReason = 'partner-left'

export type ServerMessage =
  | { type: 'waiting' }
  | { type: 'offer'; details: RideDetails; rider: PartnerView }
  | { type: 'offer-withdrawn' }
  | { type: 'matched'; ride: RideView }
  | { type: 'phase'; phase: RidePhase }
  | { type: 'chat'; text: string; fromRole: Role; ts: number }
  | { type: 'ride-ended'; reason: RideEndedReason }
```

- [ ] **Step 2: Ensure the core barrel exports fare + places**

Add to `packages/core/src/index.ts`:

```ts
export * from './rideshare/places'
export * from './rideshare/fare'
```

(The existing `export * from './rideshare/protocol'` line stays.)

- [ ] **Step 3: Type-check core**

Run: `npx tsc -p packages/core/tsconfig.json --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/rideshare/protocol.ts packages/core/src/index.ts
git commit -m "feat(core): extend rideshare protocol with ride details and lifecycle"
```

---

## Task 3: Server — Dispatcher core (TDD)

**Files:**
- Create: `packages/server/src/dispatcher.ts`
- Test: `packages/server/src/dispatcher.test.ts`
- Delete: `packages/server/src/matching.ts`, `packages/server/src/matching.test.ts`, `packages/server/src/matching.integration.test.ts`

- [ ] **Step 1: Delete the old matching files**

```bash
git rm packages/server/src/matching.ts packages/server/src/matching.test.ts packages/server/src/matching.integration.test.ts
```

- [ ] **Step 2: Write the failing test**

```ts
// packages/server/src/dispatcher.test.ts
import { describe, it, expect } from 'vitest'
import { Dispatcher, type Identity } from './dispatcher'
import type { RideDetails } from '@rst/core'

const fixedId = () => 'ride-1'
const identity = (role: 'rider' | 'driver'): Identity =>
  role === 'driver'
    ? { displayName: 'Budi', car: { model: 'Toyota Avanza', plate: 'B 1 XYZ' }, etaMins: 3 }
    : { displayName: 'Maya' }

const details: RideDetails = {
  pickup: 'Kuta', destination: 'Ubud', rideType: 'economy',
  fare: 77500, distanceKm: 15, etaPickupMins: 3, tripMins: 38,
}

function make() { return new Dispatcher(fixedId, identity) }

describe('Dispatcher request/offer/accept', () => {
  it('queues a request when no driver is online', () => {
    const d = make()
    expect(d.request('rider-a', details)).toEqual({})
  })

  it('offers to an online driver when a rider requests', () => {
    const d = make()
    d.goOnline('driver-a')
    expect(d.request('rider-a', details)).toEqual({ offeredDriverId: 'driver-a' })
  })

  it('offers a queued request to a driver who comes online', () => {
    const d = make()
    d.request('rider-a', details)
    expect(d.goOnline('driver-a')).toEqual({ offeredTo: 'driver-a', riderId: 'rider-a' })
  })

  it('accept creates a ride and viewFor shows the partner + details + phase', () => {
    const d = make()
    d.goOnline('driver-a')
    d.request('rider-a', details)
    expect(d.accept('driver-a')).toEqual({ matched: true, rideId: 'ride-1', riderId: 'rider-a', driverId: 'driver-a' })

    const riderView = d.viewFor('rider-a')
    expect(riderView?.you).toBe('rider')
    expect(riderView?.partner.role).toBe('driver')
    expect(riderView?.partner.displayName).toBe('Budi')
    expect(riderView?.phase).toBe('accepted')
    expect(riderView?.details.destination).toBe('Ubud')
  })

  it('offer carries the rider partner view', () => {
    const d = make()
    d.goOnline('driver-a')
    d.request('rider-a', details)
    expect(d.partnerView('rider-a')).toEqual({ role: 'rider', displayName: 'Maya', car: undefined, etaMins: undefined })
  })
})
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm test -- dispatcher.test`
Expected: FAIL — cannot find module `./dispatcher`.

- [ ] **Step 4: Implement the Dispatcher (core methods)**

```ts
// packages/server/src/dispatcher.ts
import type { Role, RideDetails, RidePhase, RideView, PartnerView } from '@rst/core'

export interface Identity {
  displayName: string
  car?: { model: string; plate: string }
  etaMins?: number
}

export type IdGen = () => string
export type IdentityFactory = (role: Role) => Identity

interface Party { clientId: string; identity: Identity }
interface Ride {
  id: string
  rider: Party
  driver: Party
  details: RideDetails
  phase: RidePhase
}

export class Dispatcher {
  private onlineDrivers: string[] = []
  private pending: Array<{ riderId: string; details: RideDetails }> = []
  private offers = new Map<string, { riderId: string; details: RideDetails }>()
  private rides = new Map<string, Ride>()
  private clientToRide = new Map<string, string>()
  private roleOf = new Map<string, Role>()
  private identityOf = new Map<string, Identity>()
  private readonly genId: IdGen
  private readonly makeIdentity: IdentityFactory

  constructor(genId: IdGen = defaultId, makeIdentity: IdentityFactory = defaultIdentity) {
    this.genId = genId
    this.makeIdentity = makeIdentity
  }

  request(riderId: string, details: RideDetails): { offeredDriverId?: string } {
    this.roleOf.set(riderId, 'rider')
    this.identityOf.set(riderId, this.makeIdentity('rider'))
    const driverId = this.onlineDrivers.shift()
    if (driverId === undefined) {
      this.pending.push({ riderId, details })
      return {}
    }
    this.offers.set(driverId, { riderId, details })
    return { offeredDriverId: driverId }
  }

  goOnline(driverId: string): { offeredTo?: string; riderId?: string } {
    this.roleOf.set(driverId, 'driver')
    this.identityOf.set(driverId, this.makeIdentity('driver'))
    const next = this.pending.shift()
    if (next === undefined) {
      this.onlineDrivers.push(driverId)
      return {}
    }
    this.offers.set(driverId, next)
    return { offeredTo: driverId, riderId: next.riderId }
  }

  accept(driverId: string): { matched: boolean; rideId?: string; riderId?: string; driverId?: string } {
    const offer = this.offers.get(driverId)
    if (!offer) return { matched: false }
    this.offers.delete(driverId)
    const id = this.genId()
    const ride: Ride = {
      id,
      rider: { clientId: offer.riderId, identity: this.identityFor(offer.riderId, 'rider') },
      driver: { clientId: driverId, identity: this.identityFor(driverId, 'driver') },
      details: offer.details,
      phase: 'accepted',
    }
    this.rides.set(id, ride)
    this.clientToRide.set(offer.riderId, id)
    this.clientToRide.set(driverId, id)
    return { matched: true, rideId: id, riderId: offer.riderId, driverId }
  }

  partnerView(clientId: string): PartnerView | undefined {
    const role = this.roleOf.get(clientId)
    const identity = this.identityOf.get(clientId)
    if (!role || !identity) return undefined
    return { role, displayName: identity.displayName, car: identity.car, etaMins: identity.etaMins }
  }

  viewFor(clientId: string): RideView | undefined {
    const ride = this.rideForClient(clientId)
    if (!ride) return undefined
    const me = ride.rider.clientId === clientId ? ride.rider : ride.driver
    const other = ride.rider.clientId === clientId ? ride.driver : ride.rider
    const meRole: Role = ride.rider.clientId === clientId ? 'rider' : 'driver'
    const otherRole: Role = meRole === 'rider' ? 'driver' : 'rider'
    void me
    return {
      rideId: ride.id,
      you: meRole,
      partner: {
        role: otherRole,
        displayName: other.identity.displayName,
        car: other.identity.car,
        etaMins: other.identity.etaMins,
      },
      details: ride.details,
      phase: ride.phase,
    }
  }

  private identityFor(clientId: string, role: Role): Identity {
    const existing = this.identityOf.get(clientId)
    if (existing) return existing
    const created = this.makeIdentity(role)
    this.identityOf.set(clientId, created)
    return created
  }

  private rideForClient(clientId: string): Ride | undefined {
    const id = this.clientToRide.get(clientId)
    return id ? this.rides.get(id) : undefined
  }
}

const ID_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
function defaultId(): string {
  let out = 'ride_'
  for (let i = 0; i < 6; i++) out += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)]
  return out
}

const RIDER_NAMES = ['Maya', 'Arjun', 'Lena', 'Tomás', 'Aiko', 'Diego']
const DRIVER_NAMES = ['Budi', 'Sari', 'Eka', 'Putu', 'Wayan', 'Dewi']
const CARS = ['Toyota Avanza', 'Honda Brio', 'Daihatsu Xenia', 'Suzuki Ertiga']
const PLATES = ['B 1234 XYZ', 'D 5678 ABC', 'F 9012 JKL', 'B 3456 MNO']
function pick<T>(a: T[]): T { return a[Math.floor(Math.random() * a.length)] as T }
function defaultIdentity(role: Role): Identity {
  if (role === 'driver') {
    return { displayName: pick(DRIVER_NAMES), car: { model: pick(CARS), plate: pick(PLATES) }, etaMins: 2 + Math.floor(Math.random() * 5) }
  }
  return { displayName: pick(RIDER_NAMES) }
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npm test -- dispatcher.test`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/dispatcher.ts packages/server/src/dispatcher.test.ts
git commit -m "feat(server): add Dispatcher request/offer/accept + views"
```

---

## Task 4: Server — Dispatcher decline / advance / cancel / leave (TDD)

**Files:**
- Modify: `packages/server/src/dispatcher.ts`
- Modify: `packages/server/src/dispatcher.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `packages/server/src/dispatcher.test.ts`:

```ts
describe('Dispatcher lifecycle + teardown', () => {
  it('advance updates phase and reports the partner', () => {
    const d = make()
    d.goOnline('driver-a'); d.request('rider-a', details); d.accept('driver-a')
    expect(d.advance('driver-a', 'arrived')).toEqual({ partnerId: 'rider-a', phase: 'arrived' })
    expect(d.viewFor('rider-a')?.phase).toBe('arrived')
  })

  it('only the driver of a ride can advance it', () => {
    const d = make()
    d.goOnline('driver-a'); d.request('rider-a', details); d.accept('driver-a')
    expect(d.advance('rider-a', 'arrived')).toEqual({})
  })

  it('decline re-offers to another online driver', () => {
    const d = make()
    d.goOnline('driver-a')
    d.goOnline('driver-b')
    d.request('rider-a', details) // offered to driver-a
    expect(d.decline('driver-a')).toEqual({ reofferedTo: 'driver-b', riderId: 'rider-a' })
  })

  it('decline with no other driver re-queues the request', () => {
    const d = make()
    d.goOnline('driver-a')
    d.request('rider-a', details)
    expect(d.decline('driver-a')).toEqual({})
    // a second driver coming online now gets the queued request
    expect(d.goOnline('driver-b')).toEqual({ offeredTo: 'driver-b', riderId: 'rider-a' })
  })

  it('cancel tears down an active ride and reports the partner', () => {
    const d = make()
    d.goOnline('driver-a'); d.request('rider-a', details); d.accept('driver-a')
    expect(d.cancel('rider-a')).toEqual({ partnerId: 'driver-a' })
    expect(d.viewFor('driver-a')).toBeUndefined()
  })

  it('cancel while an offer is outstanding withdraws it from the driver', () => {
    const d = make()
    d.goOnline('driver-a')
    d.request('rider-a', details) // offered to driver-a
    expect(d.cancel('rider-a')).toEqual({ withdrawnDriverId: 'driver-a' })
  })

  it('leave ends an active ride and reports the partner', () => {
    const d = make()
    d.goOnline('driver-a'); d.request('rider-a', details); d.accept('driver-a')
    expect(d.leave('driver-a')).toEqual({ partnerId: 'rider-a' })
  })
})
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `npm test -- dispatcher.test`
Expected: FAIL — `advance`/`decline`/`cancel`/`leave` are not functions.

- [ ] **Step 3: Add the methods**

Add these methods inside the `Dispatcher` class (after `viewFor`):

```ts
  advance(driverId: string, phase: RidePhase): { partnerId?: string; phase?: RidePhase } {
    const ride = this.rideForClient(driverId)
    if (!ride || ride.driver.clientId !== driverId) return {}
    ride.phase = phase
    return { partnerId: ride.rider.clientId, phase }
  }

  decline(driverId: string): { reofferedTo?: string; riderId?: string } {
    const offer = this.offers.get(driverId)
    if (!offer) return {}
    this.offers.delete(driverId)
    const next = this.onlineDrivers.shift()
    this.onlineDrivers.push(driverId) // decliner returns to the pool (at the back)
    if (next !== undefined && next !== driverId) {
      this.offers.set(next, offer)
      return { reofferedTo: next, riderId: offer.riderId }
    }
    this.pending.push(offer)
    return {}
  }

  cancel(clientId: string): { partnerId?: string; withdrawnDriverId?: string } {
    const ride = this.rideForClient(clientId)
    if (ride) {
      ride.phase = 'cancelled'
      const partnerId = ride.rider.clientId === clientId ? ride.driver.clientId : ride.rider.clientId
      this.teardown(ride)
      return { partnerId }
    }
    // pre-match: remove any pending request or outstanding offer for this rider
    this.pending = this.pending.filter((r) => r.riderId !== clientId)
    for (const [dId, o] of this.offers) {
      if (o.riderId === clientId) {
        this.offers.delete(dId)
        this.onlineDrivers.push(dId)
        return { withdrawnDriverId: dId }
      }
    }
    return {}
  }

  leave(clientId: string): { partnerId?: string; withdrawnDriverId?: string } {
    this.onlineDrivers = this.onlineDrivers.filter((id) => id !== clientId)
    this.pending = this.pending.filter((r) => r.riderId !== clientId)

    // driver leaving with an outstanding offer → re-queue that rider's request
    const ownOffer = this.offers.get(clientId)
    if (ownOffer) {
      this.offers.delete(clientId)
      this.pending.push(ownOffer)
    }
    // rider leaving while offered to a driver → withdraw + return driver to pool
    let withdrawnDriverId: string | undefined
    for (const [dId, o] of this.offers) {
      if (o.riderId === clientId) {
        this.offers.delete(dId)
        this.onlineDrivers.push(dId)
        withdrawnDriverId = dId
      }
    }

    const ride = this.rideForClient(clientId)
    this.roleOf.delete(clientId)
    this.identityOf.delete(clientId)
    if (ride) {
      const partnerId = ride.rider.clientId === clientId ? ride.driver.clientId : ride.rider.clientId
      this.teardown(ride)
      return { partnerId }
    }
    return withdrawnDriverId ? { withdrawnDriverId } : {}
  }

  private teardown(ride: Ride): void {
    this.clientToRide.delete(ride.rider.clientId)
    this.clientToRide.delete(ride.driver.clientId)
    this.rides.delete(ride.id)
  }
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- dispatcher.test`
Expected: PASS (13 tests total).

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/dispatcher.ts packages/server/src/dispatcher.test.ts
git commit -m "feat(server): add Dispatcher decline, advance, cancel, leave"
```

---

## Task 5: Server — rewrite server.ts on the Dispatcher

**Files:**
- Rewrite: `packages/server/src/server.ts`

- [ ] **Step 1: Rewrite `packages/server/src/server.ts`**

```ts
import { WebSocketServer, WebSocket } from 'ws'
import { randomUUID } from 'node:crypto'
import type { ClientMessage, ServerMessage } from '@rst/core'
import { Dispatcher } from './dispatcher.ts'

const PORT = Number(process.env.PORT ?? 8787)

const dispatcher = new Dispatcher()
const sockets = new Map<string, WebSocket>()
const wss = new WebSocketServer({ port: PORT })

function send(clientId: string, msg: ServerMessage): void {
  const ws = sockets.get(clientId)
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg))
}

function offerTo(driverId: string, riderId: string): void {
  const view = dispatcher.viewForOffer(riderId, driverId)
  if (view) send(driverId, { type: 'offer', details: view.details, rider: view.rider })
}

wss.on('connection', (ws) => {
  const clientId = randomUUID()
  sockets.set(clientId, ws)

  ws.on('message', (raw) => {
    let msg: ClientMessage
    try {
      msg = JSON.parse(raw.toString())
    } catch {
      return
    }

    if (msg.type === 'go-online') {
      const r = dispatcher.goOnline(clientId)
      if (r.offeredTo && r.riderId) offerTo(r.offeredTo, r.riderId)
      return
    }

    if (msg.type === 'request') {
      const r = dispatcher.request(clientId, msg.details)
      send(clientId, { type: 'waiting' })
      if (r.offeredDriverId) offerTo(r.offeredDriverId, clientId)
      return
    }

    if (msg.type === 'accept') {
      const r = dispatcher.accept(clientId)
      if (!r.matched || !r.riderId || !r.driverId) return
      const riderView = dispatcher.viewFor(r.riderId)
      const driverView = dispatcher.viewFor(r.driverId)
      if (riderView) send(r.riderId, { type: 'matched', ride: riderView })
      if (driverView) send(r.driverId, { type: 'matched', ride: driverView })
      return
    }

    if (msg.type === 'decline') {
      const r = dispatcher.decline(clientId)
      if (r.reofferedTo && r.riderId) offerTo(r.reofferedTo, r.riderId)
      return
    }

    if (msg.type === 'advance') {
      const r = dispatcher.advance(clientId, msg.phase)
      if (r.phase) {
        send(clientId, { type: 'phase', phase: r.phase })
        if (r.partnerId) send(r.partnerId, { type: 'phase', phase: r.phase })
      }
      return
    }

    if (msg.type === 'cancel') {
      const r = dispatcher.cancel(clientId)
      if (r.partnerId) send(r.partnerId, { type: 'phase', phase: 'cancelled' })
      if (r.withdrawnDriverId) send(r.withdrawnDriverId, { type: 'offer-withdrawn' })
      return
    }

    if (msg.type === 'chat') {
      const view = dispatcher.viewFor(clientId)
      const partnerId = dispatcher.partnerOf(clientId)
      if (view && partnerId) {
        send(partnerId, { type: 'chat', text: msg.text, fromRole: view.you, ts: Date.now() })
      }
      return
    }
  })

  ws.on('close', () => {
    const r = dispatcher.leave(clientId)
    sockets.delete(clientId)
    if (r.partnerId) send(r.partnerId, { type: 'ride-ended', reason: 'partner-left' })
    if (r.withdrawnDriverId) send(r.withdrawnDriverId, { type: 'offer-withdrawn' })
  })
})

console.log(`dispatch server listening on ws://localhost:${PORT}`)
```

- [ ] **Step 2: Add the two small helpers the server uses (`viewForOffer`, `partnerOf`) to the Dispatcher**

Add inside the `Dispatcher` class:

```ts
  partnerOf(clientId: string): string | undefined {
    const ride = this.rideForClient(clientId)
    if (!ride) return undefined
    return ride.rider.clientId === clientId ? ride.driver.clientId : ride.rider.clientId
  }

  viewForOffer(riderId: string, _driverId: string): { details: RideDetails; rider: PartnerView } | undefined {
    const offer = this.offers.get(_driverId)
    const rider = this.partnerView(riderId)
    if (!offer || !rider) return undefined
    return { details: offer.details, rider }
  }
```

- [ ] **Step 3: Run tests + type-check + boot**

Run: `npm test`
Expected: PASS (dispatcher + core suites; translator suites still present).

Run: `npx tsc -p packages/server/tsconfig.json --noEmit`
Expected: no errors.

Run: `PORT=8802 node --experimental-strip-types packages/server/src/server.ts`
Expected: prints `dispatch server listening on ws://localhost:8802`. Stop with Ctrl-C.

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/server.ts packages/server/src/dispatcher.ts
git commit -m "feat(server): dispatch server (request/offer/accept/lifecycle/chat)"
```

---

## Task 6: Server — integration test (TDD)

**Files:**
- Create: `packages/server/src/dispatcher.integration.test.ts`

- [ ] **Step 1: Write the failing integration test**

```ts
// packages/server/src/dispatcher.integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { WebSocketServer } from 'ws'
import WebSocket from 'ws'
import { randomUUID } from 'node:crypto'
import { Dispatcher } from './dispatcher'
import type { RideDetails } from '@rst/core'

const details: RideDetails = {
  pickup: 'Kuta', destination: 'Ubud', rideType: 'economy',
  fare: 77500, distanceKm: 15, etaPickupMins: 3, tripMins: 38,
}

function startServer(port: number) {
  const d = new Dispatcher(() => 'ride-test')
  const sockets = new Map<string, WebSocket>()
  const wss = new WebSocketServer({ port })
  const send = (id: string, m: unknown) => {
    const ws = sockets.get(id)
    if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(m))
  }
  const offerTo = (driverId: string, riderId: string) => {
    const v = d.viewForOffer(riderId, driverId)
    if (v) send(driverId, { type: 'offer', details: v.details, rider: v.rider })
  }
  wss.on('connection', (ws) => {
    const id = randomUUID()
    sockets.set(id, ws as unknown as WebSocket)
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString())
      if (msg.type === 'go-online') {
        const r = d.goOnline(id)
        if (r.offeredTo && r.riderId) offerTo(r.offeredTo, r.riderId)
      } else if (msg.type === 'request') {
        const r = d.request(id, msg.details)
        send(id, { type: 'waiting' })
        if (r.offeredDriverId) offerTo(r.offeredDriverId, id)
      } else if (msg.type === 'accept') {
        const r = d.accept(id)
        if (r.matched && r.riderId && r.driverId) {
          send(r.riderId, { type: 'matched', ride: d.viewFor(r.riderId) })
          send(r.driverId, { type: 'matched', ride: d.viewFor(r.driverId) })
        }
      } else if (msg.type === 'advance') {
        const r = d.advance(id, msg.phase)
        if (r.phase) { send(id, { type: 'phase', phase: r.phase }); if (r.partnerId) send(r.partnerId, { type: 'phase', phase: r.phase }) }
      } else if (msg.type === 'chat') {
        const v = d.viewFor(id); const p = d.partnerOf(id)
        if (v && p) send(p, { type: 'chat', text: msg.text, fromRole: v.you, ts: 1 })
      }
    })
  })
  return wss
}

const PORT = 8931
let wss: WebSocketServer
beforeAll(() => { wss = startServer(PORT) })
afterAll(() => { wss.close() })

function connect(): Promise<WebSocket> {
  return new Promise((r) => { const ws = new WebSocket(`ws://localhost:${PORT}`); ws.on('open', () => r(ws)) })
}
function next(ws: WebSocket): Promise<any> {
  return new Promise((r) => ws.once('message', (m) => r(JSON.parse(m.toString()))))
}

describe('dispatcher integration', () => {
  it('driver online, rider requests, driver is offered + accepts, phase advances, chat relays', async () => {
    const driver = await connect()
    driver.send(JSON.stringify({ type: 'go-online' }))

    const rider = await connect()
    const offerMsg = next(driver)
    rider.send(JSON.stringify({ type: 'request', details }))
    await next(rider) // waiting

    const offer = await offerMsg
    expect(offer.type).toBe('offer')
    expect(offer.details.destination).toBe('Ubud')
    expect(offer.rider.role).toBe('rider')

    const riderMatched = next(rider)
    const driverMatched = next(driver)
    driver.send(JSON.stringify({ type: 'accept' }))
    const rm = await riderMatched
    const dm = await driverMatched
    expect(rm.ride.phase).toBe('accepted')
    expect(rm.ride.partner.role).toBe('driver')
    expect(dm.ride.you).toBe('driver')

    const riderPhase = next(rider)
    driver.send(JSON.stringify({ type: 'advance', phase: 'arrived' }))
    expect((await riderPhase).phase).toBe('arrived')

    const driverChat = next(driver)
    rider.send(JSON.stringify({ type: 'chat', text: 'coming out now' }))
    expect(await driverChat).toMatchObject({ type: 'chat', text: 'coming out now', fromRole: 'rider' })

    rider.close(); driver.close()
  })
})
```

- [ ] **Step 2: Run the test**

Run: `npm test -- dispatcher.integration`
Expected: PASS (1 test).

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/dispatcher.integration.test.ts
git commit -m "test(server): dispatcher end-to-end integration"
```

---

## Task 7: Web — expand `useRide`

**Files:**
- Rewrite: `packages/web/src/transport/useRide.ts`

- [ ] **Step 1: Rewrite `packages/web/src/transport/useRide.ts`**

```ts
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Role, RideDetails, RidePhase, RideView, PartnerView, ServerMessage } from '@rst/core'

const RELAY_URL = import.meta.env.VITE_RELAY_URL ?? 'ws://localhost:8787'

export type RideState =
  | 'idle' | 'booking' | 'searching' | 'online' | 'offered'
  | 'in-ride' | 'completed' | 'cancelled' | 'ended'

export interface ChatLine { id: number; text: string; fromRole: Role; mine: boolean; ts: number }
export interface Offer { details: RideDetails; rider: PartnerView }

export interface RideApi {
  state: RideState
  role: Role | null
  ride: RideView | null
  offer: Offer | null
  messages: ChatLine[]
  endedReason: string | null
  chooseRole: (role: Role) => void
  requestRide: (details: RideDetails) => void
  accept: () => void
  decline: () => void
  advance: (phase: RidePhase) => void
  cancel: () => void
  sendChat: (text: string) => void
  reset: () => void
}

export function useRide(): RideApi {
  const ws = useRef<WebSocket | null>(null)
  const nextId = useRef(0)
  const roleRef = useRef<Role | null>(null)
  const [state, setState] = useState<RideState>('idle')
  const [role, setRole] = useState<Role | null>(null)
  const [ride, setRide] = useState<RideView | null>(null)
  const [offer, setOffer] = useState<Offer | null>(null)
  const [messages, setMessages] = useState<ChatLine[]>([])
  const [endedReason, setEndedReason] = useState<string | null>(null)

  const closeSocket = useCallback(() => { ws.current?.close(); ws.current = null }, [])

  const handle = useCallback((msg: ServerMessage) => {
    switch (msg.type) {
      case 'waiting': setState('searching'); break
      case 'offer': setOffer({ details: msg.details, rider: msg.rider }); setState('offered'); break
      case 'offer-withdrawn': setOffer(null); setState('online'); break
      case 'matched': setOffer(null); setRide(msg.ride); setState('in-ride'); break
      case 'phase':
        setRide((prev) => (prev ? { ...prev, phase: msg.phase } : prev))
        if (msg.phase === 'completed') setState('completed')
        else if (msg.phase === 'cancelled') setState('cancelled')
        break
      case 'chat':
        setMessages((prev) => [...prev, { id: nextId.current++, text: msg.text, fromRole: msg.fromRole, mine: false, ts: msg.ts }])
        break
      case 'ride-ended': setEndedReason(msg.reason); setState('ended'); break
    }
  }, [])

  const connect = useCallback((onOpen: () => void) => {
    const socket = new WebSocket(RELAY_URL)
    ws.current = socket
    socket.onmessage = (e) => handle(JSON.parse(e.data) as ServerMessage)
    socket.onclose = () => setState((s) => (s === 'in-ride' ? 'ended' : s))
    socket.onopen = onOpen
  }, [handle])

  const chooseRole = useCallback((selected: Role) => {
    setRole(selected)
    roleRef.current = selected
    setMessages([])
    setEndedReason(null)
    if (selected === 'driver') {
      setState('online')
      connect(() => ws.current?.send(JSON.stringify({ type: 'go-online' })))
    } else {
      setState('booking')
    }
  }, [connect])

  const requestRide = useCallback((details: RideDetails) => {
    setState('searching')
    connect(() => ws.current?.send(JSON.stringify({ type: 'request', details })))
  }, [connect])

  const send = (data: unknown) => ws.current?.send(JSON.stringify(data))

  const accept = useCallback(() => send({ type: 'accept' }), [])
  const decline = useCallback(() => { send({ type: 'decline' }); setOffer(null); setState('online') }, [])
  const advance = useCallback((phase: RidePhase) => {
    send({ type: 'advance', phase })
    setRide((prev) => (prev ? { ...prev, phase } : prev))
    if (phase === 'completed') setState('completed')
  }, [])
  const cancel = useCallback(() => { send({ type: 'cancel' }); setState('cancelled') }, [])

  const sendChat = useCallback((text: string) => {
    const trimmed = text.trim(); const myRole = roleRef.current
    if (!trimmed || !myRole) return
    send({ type: 'chat', text: trimmed })
    setMessages((prev) => [...prev, { id: nextId.current++, text: trimmed, fromRole: myRole, mine: true, ts: Date.now() }])
  }, [])

  const reset = useCallback(() => {
    closeSocket(); setState('idle'); setRole(null); roleRef.current = null
    setRide(null); setOffer(null); setMessages([]); setEndedReason(null)
  }, [closeSocket])

  useEffect(() => () => { ws.current?.close() }, [])

  return { state, role, ride, offer, messages, endedReason, chooseRole, requestRide, accept, decline, advance, cancel, sendChat, reset }
}
```

- [ ] **Step 2: Commit** (type errors from App referencing old API are resolved in Task 12)

```bash
git add packages/web/src/transport/useRide.ts
git commit -m "feat(web): expand useRide state machine for booking + lifecycle"
```

---

## Task 8: Web — Book screen (rider)

**Files:**
- Create: `packages/web/src/components/Book.tsx`

- [ ] **Step 1: Create `packages/web/src/components/Book.tsx`**

```tsx
import { useState } from 'react'
import { PLACES, placeByName, distanceKm, RIDE_TYPES, estimateFare, formatIDR, type RideDetails, type RideTypeId } from '@rst/core'

interface BookProps {
  onRequest: (details: RideDetails) => void
  onBack: () => void
}

export function Book({ onRequest, onBack }: BookProps) {
  const [pickup, setPickup] = useState(PLACES[0]!.name)
  const [destination, setDestination] = useState(PLACES[PLACES.length - 1]!.name)
  const [rideType, setRideType] = useState<RideTypeId>('economy')

  const a = placeByName(pickup)!
  const b = placeByName(destination)!
  const km = distanceKm(a, b)
  const samePlace = pickup === destination

  const buildDetails = (typeId: RideTypeId): RideDetails => {
    const est = estimateFare(km, typeId)
    return { pickup, destination, rideType: typeId, fare: est.fare, distanceKm: km, etaPickupMins: est.etaPickupMins, tripMins: est.tripMins }
  }

  return (
    <section aria-labelledby="book-heading" className="screen book">
      <button className="link-back" onClick={onBack}>← Back</button>
      <h1 id="book-heading" className="book__title">Where to?</h1>

      <label className="field">
        <span className="field__label">Pickup</span>
        <select value={pickup} onChange={(e) => setPickup(e.target.value)}>
          {PLACES.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
        </select>
      </label>
      <label className="field">
        <span className="field__label">Destination</span>
        <select value={destination} onChange={(e) => setDestination(e.target.value)}>
          {PLACES.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
        </select>
      </label>
      {samePlace && <p className="field__error" role="alert">Pick two different places.</p>}

      <p className="book__distance">{km} km trip</p>

      <div className="ride-types" role="radiogroup" aria-label="Ride type">
        {RIDE_TYPES.map((t) => {
          const est = estimateFare(km, t.id)
          const selected = rideType === t.id
          return (
            <button
              key={t.id}
              role="radio"
              aria-checked={selected}
              className={selected ? 'ride-type ride-type--on' : 'ride-type'}
              onClick={() => setRideType(t.id)}
            >
              <span className="ride-type__emoji" aria-hidden="true">{t.emoji}</span>
              <span className="ride-type__label">{t.label}</span>
              <span className="ride-type__eta">{est.tripMins} min</span>
              <span className="ride-type__fare">{formatIDR(est.fare)}</span>
            </button>
          )
        })}
      </div>

      <button
        className="btn btn--primary btn--block"
        disabled={samePlace}
        onClick={() => onRequest(buildDetails(rideType))}
      >
        Request {RIDE_TYPES.find((t) => t.id === rideType)!.label} · {formatIDR(estimateFare(km, rideType).fare)}
      </button>
    </section>
  )
}
```

- [ ] **Step 2: Type-check core import surface**

Run: `npx tsc -p packages/web/tsconfig.json --noEmit 2>&1 | grep -i "Book.tsx" || echo "no Book.tsx errors"`
Expected: `no Book.tsx errors` (App errors are expected until Task 12).

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/Book.tsx
git commit -m "feat(web): add rider Book screen with fare estimates"
```

---

## Task 9: Web — DriverOnline screen + offer card

**Files:**
- Create: `packages/web/src/components/DriverOnline.tsx`

- [ ] **Step 1: Create `packages/web/src/components/DriverOnline.tsx`**

```tsx
import { formatIDR, type RideTypeId } from '@rst/core'
import type { Offer } from '../transport/useRide'

interface DriverOnlineProps {
  offer: Offer | null
  onAccept: () => void
  onDecline: () => void
  onGoOffline: () => void
}

const TYPE_LABEL: Record<RideTypeId, string> = { bike: 'Bike', economy: 'Economy', premium: 'Premium' }

export function DriverOnline({ offer, onAccept, onDecline, onGoOffline }: DriverOnlineProps) {
  if (!offer) {
    return (
      <section aria-labelledby="online-heading" className="screen requesting">
        <div className="radar" aria-hidden="true">
          <span className="radar__ping" /><span className="radar__ping radar__ping--2" />
          <span className="radar__dot">🚗</span>
        </div>
        <h1 id="online-heading" className="requesting__title">You're online</h1>
        <p className="requesting__sub" role="status">Waiting for a ride request…</p>
        <button className="btn btn--ghost" onClick={onGoOffline}>Go offline</button>
      </section>
    )
  }

  const { details, rider } = offer
  return (
    <section aria-labelledby="offer-heading" className="screen offer">
      <p className="offer__tag">New request</p>
      <h1 id="offer-heading" className="offer__fare">{formatIDR(details.fare)}</h1>
      <p className="offer__type">{TYPE_LABEL[details.rideType]} · {details.distanceKm} km · ~{details.tripMins} min</p>

      <div className="offer__route">
        <p className="offer__leg"><span className="dot dot--pickup" /> {details.pickup}</p>
        <p className="offer__leg"><span className="dot dot--dest" /> {details.destination}</p>
      </div>
      <p className="offer__rider">Rider: {rider.displayName}</p>

      <div className="offer__actions">
        <button className="btn btn--ghost btn--block" onClick={onDecline}>Decline</button>
        <button className="btn btn--primary btn--block" onClick={onAccept}>Accept</button>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/components/DriverOnline.tsx
git commit -m "feat(web): add driver online + incoming offer screen"
```

---

## Task 10: Web — phase-aware Ride screen

**Files:**
- Rewrite: `packages/web/src/components/Ride.tsx`

- [ ] **Step 1: Rewrite `packages/web/src/components/Ride.tsx`**

```tsx
import type { RideView, RidePhase } from '@rst/core'
import { formatIDR } from '@rst/core'
import type { ChatLine } from '../transport/useRide'
import { MapScene } from './MapScene'
import { PartnerCard } from './PartnerCard'
import { Chat } from './Chat'

interface RideProps {
  ride: RideView
  messages: ChatLine[]
  onSend: (text: string) => void
  onAdvance: (phase: RidePhase) => void
  onCancel: () => void
}

const RIDER_STATUS: Record<RidePhase, string> = {
  searching: 'Finding your driver…',
  accepted: 'Your driver is on the way',
  arrived: 'Your driver has arrived',
  in_progress: 'On the way to your destination',
  completed: 'You have arrived',
  cancelled: 'Ride cancelled',
}
const DRIVER_STATUS: Record<RidePhase, string> = {
  searching: 'Waiting…',
  accepted: 'Head to the pickup',
  arrived: 'Waiting for your rider',
  in_progress: 'Driving to destination',
  completed: 'Trip complete',
  cancelled: 'Ride cancelled',
}

// Driver's next lifecycle action per phase.
const NEXT: Partial<Record<RidePhase, { label: string; phase: RidePhase }>> = {
  accepted: { label: "I've arrived", phase: 'arrived' },
  arrived: { label: 'Start trip', phase: 'in_progress' },
  in_progress: { label: 'Complete trip', phase: 'completed' },
}

export function Ride({ ride, messages, onSend, onAdvance, onCancel }: RideProps) {
  const isDriver = ride.you === 'driver'
  const status = (isDriver ? DRIVER_STATUS : RIDER_STATUS)[ride.phase]
  const next = isDriver ? NEXT[ride.phase] : undefined
  const canCancel = !isDriver && (ride.phase === 'accepted' || ride.phase === 'arrived')

  return (
    <section aria-labelledby="ride-heading" className="screen ride">
      <header className="ride__bar">
        <div>
          <h1 id="ride-heading" className="ride__title">{status}</h1>
          <p className="ride__route">{ride.details.pickup} → {ride.details.destination} · {formatIDR(ride.details.fare)}</p>
        </div>
      </header>

      <MapScene />
      <PartnerCard ride={ride} />

      {(next || canCancel) && (
        <div className="ride__actions">
          {canCancel && <button className="btn btn--danger btn--block" onClick={onCancel}>Cancel ride</button>}
          {next && <button className="btn btn--primary btn--block" onClick={() => onAdvance(next.phase)}>{next.label}</button>}
        </div>
      )}

      <Chat messages={messages} onSend={onSend} />
    </section>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/components/Ride.tsx
git commit -m "feat(web): phase-aware ride screen with driver controls"
```

---

## Task 11: Web — Receipt / earnings screen

**Files:**
- Create: `packages/web/src/components/Receipt.tsx`

- [ ] **Step 1: Create `packages/web/src/components/Receipt.tsx`**

```tsx
import { useState } from 'react'
import { formatIDR, type RideView } from '@rst/core'

interface ReceiptProps {
  ride: RideView
  onDone: () => void
}

export function Receipt({ ride, onDone }: ReceiptProps) {
  const isDriver = ride.you === 'driver'
  const [stars, setStars] = useState(0)

  return (
    <section aria-labelledby="receipt-heading" className="screen receipt">
      <div className="radar" aria-hidden="true"><span className="radar__dot">{isDriver ? '💰' : '🏁'}</span></div>
      <h1 id="receipt-heading" className="receipt__title">{isDriver ? 'Trip complete' : 'You have arrived'}</h1>

      <div className="receipt__card">
        <div className="receipt__row"><span>{ride.details.pickup} → {ride.details.destination}</span></div>
        <div className="receipt__row"><span>{ride.details.distanceKm} km · {ride.details.tripMins} min</span></div>
        <div className="receipt__row receipt__row--total">
          <span>{isDriver ? 'You earned' : 'Total'}</span>
          <strong>{formatIDR(ride.details.fare)}</strong>
        </div>
      </div>

      {!isDriver && (
        <div className="rating" role="group" aria-label="Rate your driver">
          <p className="rating__label">Rate {ride.partner.displayName}</p>
          <div className="rating__stars">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                className={n <= stars ? 'star star--on' : 'star'}
                aria-label={`${n} star${n > 1 ? 's' : ''}`}
                aria-pressed={n <= stars}
                onClick={() => setStars(n)}
              >★</button>
            ))}
          </div>
        </div>
      )}

      <button className="btn btn--primary btn--block" onClick={onDone}>Done</button>
    </section>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/components/Receipt.tsx
git commit -m "feat(web): add receipt + rating / earnings screen"
```

---

## Task 12: Web — App orchestrator

**Files:**
- Rewrite: `packages/web/src/App.tsx`

- [ ] **Step 1: Rewrite `packages/web/src/App.tsx`**

```tsx
import { useRide } from './transport/useRide'
import { RoleSelect } from './components/RoleSelect'
import { Book } from './components/Book'
import { Requesting } from './components/Requesting'
import { DriverOnline } from './components/DriverOnline'
import { Ride } from './components/Ride'
import { Receipt } from './components/Receipt'
import './components/rideshare.css'

export function App() {
  const r = useRide()

  const content = () => {
    if (r.state === 'completed' && r.ride) return <Receipt ride={r.ride} onDone={r.reset} />

    if (r.state === 'cancelled' || r.state === 'ended') {
      return (
        <section className="screen ended">
          <div className="radar" aria-hidden="true"><span className="radar__dot">🚫</span></div>
          <h1 className="requesting__title">{r.state === 'cancelled' ? 'Ride cancelled' : 'Ride ended'}</h1>
          <p className="requesting__sub">
            {r.state === 'ended' ? 'Your co-rider left the trip.' : 'The ride was cancelled.'}
          </p>
          <button className="btn btn--primary" onClick={r.reset}>Back to start</button>
        </section>
      )
    }

    if (r.state === 'in-ride' && r.ride) {
      return <Ride ride={r.ride} messages={r.messages} onSend={r.sendChat} onAdvance={r.advance} onCancel={r.cancel} />
    }

    if (r.role === 'driver' && (r.state === 'online' || r.state === 'offered')) {
      return <DriverOnline offer={r.offer} onAccept={r.accept} onDecline={r.decline} onGoOffline={r.reset} />
    }

    if (r.role === 'rider' && r.state === 'searching') {
      return <Requesting role="rider" onCancel={r.reset} />
    }

    if (r.role === 'rider' && r.state === 'booking') {
      return <Book onRequest={r.requestRide} onBack={r.reset} />
    }

    return <RoleSelect onChoose={r.chooseRole} />
  }

  return <main>{content()}</main>
}
```

- [ ] **Step 2: Type-check + build**

Run: `npx tsc -p packages/web/tsconfig.json --noEmit`
Expected: no errors.

Run: `npm -w @rst/web run build`
Expected: builds successfully.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/App.tsx
git commit -m "feat(web): orchestrate booking, dispatch, ride, and receipt screens"
```

---

## Task 13: Web — styles for the new screens

**Files:**
- Modify: `packages/web/src/components/rideshare.css`

- [ ] **Step 1: Append to `packages/web/src/components/rideshare.css`**

```css
/* Book */
.link-back { background: none; border: none; color: var(--text-muted); cursor: pointer;
  padding: 0; margin-bottom: var(--space-md); font-size: 0.95rem; align-self: flex-start; }
.book__title { font-size: var(--text-hero); margin: 0 0 var(--space-lg); letter-spacing: -0.02em; }
.field { display: flex; flex-direction: column; gap: 6px; margin-bottom: var(--space-md); }
.field__label { color: var(--text-muted); font-size: 0.85rem; }
.field select { padding: 12px 14px; border-radius: var(--radius-sm); background: var(--bg-elevated);
  color: var(--text); border: 1px solid var(--border); font-size: var(--text-base); }
.field__error { color: var(--danger); font-size: 0.85rem; margin: -4px 0 var(--space-md); }
.book__distance { color: var(--text-muted); margin: 0 0 var(--space-md); }
.ride-types { display: grid; gap: 8px; margin-bottom: var(--space-lg); }
.ride-type { display: grid; grid-template-columns: auto 1fr auto auto; gap: 12px; align-items: center;
  padding: 14px 16px; border-radius: var(--radius-sm); background: var(--bg-card);
  border: 1px solid var(--border); color: var(--text); cursor: pointer; text-align: left;
  transition: border-color var(--duration-fast), transform var(--duration-fast) var(--ease-out-expo); }
.ride-type:hover { transform: translateY(-1px); }
.ride-type--on { border-color: var(--accent); box-shadow: 0 0 0 2px oklch(72% 0.17 155 / 0.35); }
.ride-type__emoji { font-size: 1.5rem; }
.ride-type__label { font-weight: 600; }
.ride-type__eta { color: var(--text-muted); font-size: 0.85rem; }
.ride-type__fare { font-weight: 650; }
.btn--block { width: 100%; }

/* Offer */
.offer { justify-content: center; }
.offer__tag { color: var(--accent); text-transform: uppercase; letter-spacing: 0.12em;
  font-size: 0.75rem; font-weight: 700; margin: 0 0 4px; }
.offer__fare { font-size: var(--text-hero); margin: 0; letter-spacing: -0.02em; }
.offer__type { color: var(--text-muted); margin: 4px 0 var(--space-lg); }
.offer__route { display: grid; gap: 10px; margin-bottom: var(--space-md); }
.offer__leg { display: flex; align-items: center; gap: 10px; margin: 0; }
.dot { width: 10px; height: 10px; border-radius: 50%; flex: 0 0 auto; }
.dot--pickup { background: var(--accent); }
.dot--dest { background: var(--rider); }
.offer__rider { color: var(--text-muted); margin: 0 0 var(--space-lg); }
.offer__actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }

/* Ride actions + route */
.ride__route { margin: 4px 0 0; color: var(--text-muted); font-size: 0.9rem; }
.ride__actions { display: grid; gap: 8px; }

/* Receipt */
.receipt { align-items: center; text-align: center; justify-content: center; }
.receipt__title { font-size: var(--text-title); margin: var(--space-md) 0 var(--space-lg); }
.receipt__card { width: 100%; background: var(--bg-card); border: 1px solid var(--border);
  border-radius: var(--radius); padding: var(--space-md); margin-bottom: var(--space-lg); }
.receipt__row { display: flex; justify-content: space-between; padding: 6px 0; color: var(--text-muted); }
.receipt__row--total { border-top: 1px solid var(--border); margin-top: 6px; padding-top: 12px;
  color: var(--text); font-size: var(--text-title); }
.rating { margin-bottom: var(--space-lg); }
.rating__label { color: var(--text-muted); margin: 0 0 8px; }
.rating__stars { display: flex; gap: 6px; justify-content: center; }
.star { background: none; border: none; font-size: 2rem; cursor: pointer; color: var(--border);
  line-height: 1; padding: 0; transition: color var(--duration-fast); }
.star--on { color: oklch(80% 0.16 90); }
```

- [ ] **Step 2: Build to confirm CSS is valid and bundles**

Run: `npm -w @rst/web run build`
Expected: builds successfully.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/rideshare.css
git commit -m "style(web): styles for booking, offer, ride actions, and receipt"
```

---

## Task 14: E2E — full happy path

**Files:**
- Rewrite: `e2e/ride.spec.ts`

- [ ] **Step 1: Rewrite `e2e/ride.spec.ts`**

```ts
import { test, expect } from '@playwright/test'

test('full ride: driver online, rider books, accept, lifecycle, receipt', async ({ browser }) => {
  const driver = await browser.newPage()
  const rider = await browser.newPage()

  // Driver goes online.
  await driver.goto('/')
  await driver.getByRole('button', { name: "I'm a Driver" }).click()
  await expect(driver.getByText("You're online")).toBeVisible()

  // Rider books a ride.
  await rider.goto('/')
  await rider.getByRole('button', { name: "I'm a Rider" }).click()
  await rider.getByRole('button', { name: /Request/ }).click()

  // Driver receives the offer and accepts.
  await expect(driver.getByText('New request')).toBeVisible()
  await driver.getByRole('button', { name: 'Accept' }).click()

  // Both are on the ride; rider sees "on the way".
  await expect(rider.getByText('Your driver is on the way')).toBeVisible()
  await expect(driver.getByRole('button', { name: "I've arrived" })).toBeVisible()

  // Driver drives the lifecycle.
  await driver.getByRole('button', { name: "I've arrived" }).click()
  await driver.getByRole('button', { name: 'Start trip' }).click()

  // Rider can chat mid-trip; driver receives it.
  await rider.getByLabel('Message').fill('almost there?')
  await rider.getByRole('button', { name: 'Send' }).click()
  await expect(driver.locator('.bubble--theirs')).toContainText('almost there?')

  // Driver completes → rider sees the receipt.
  await driver.getByRole('button', { name: 'Complete trip' }).click()
  await expect(rider.getByRole('heading', { name: 'You have arrived' })).toBeVisible()
  await expect(rider.getByText(/Rp/)).toBeVisible()
})
```

- [ ] **Step 2: Run the E2E on isolated ports**

Run: `RELAY_PORT=8801 WEB_PORT=5183 npm run test:e2e`
Expected: PASS (1 test).

- [ ] **Step 3: Commit**

```bash
git add e2e/ride.spec.ts
git commit -m "test(e2e): full uber-style ride happy path"
```

---

## Task 15: README + final verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the flow description in `README.md`**

Replace the "How pairing works" + "Run" flow description so it reads:

```markdown
## Flow

Open two windows. In one, choose **Driver** and go online. In the other, choose
**Rider**, pick pickup/destination + a ride type (see the fare), and **Request**.
The driver gets the request, taps **Accept**, then drives the lifecycle
(**Arrived → Start trip → Complete**). The rider watches the status, can chat,
and gets a **receipt + rating** at the end. No codes — dispatch is automatic.
```

- [ ] **Step 2: Full verification sweep**

Run: `npm test`
Expected: all unit + integration suites PASS.

Run: `npx tsc -p packages/core/tsconfig.json --noEmit && npx tsc -p packages/server/tsconfig.json --noEmit && npx tsc -p packages/web/tsconfig.json --noEmit`
Expected: no type errors.

Run: `RELAY_PORT=8801 WEB_PORT=5183 npm run test:e2e`
Expected: E2E PASS.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: update README for uber/grab-style flow"
```

---

## Self-Review Notes

- **Spec coverage:** booking with places/type/fare (Tasks 1,2,8) ✓; driver online + accept/decline (Tasks 3,4,9) ✓; lifecycle searching→accepted→arrived→in_progress→completed + cancelled (Tasks 4,7,10) ✓; synced phase both sides (Tasks 5,6,7) ✓; receipt + rating + earnings (Task 11) ✓; chat retained (Task 10) ✓; offer-withdrawn on cancel/leave (Tasks 4,5,7) ✓; dark UI + reduced motion (Tasks 13; tokens already honor reduced-motion) ✓; unit/integration/e2e (Tasks 1,3,4,6,14) ✓; no external calls ✓.
- **Type consistency:** `RideDetails`, `RidePhase`, `RideView`, `PartnerView`, `ClientMessage`, `ServerMessage`, `RideTypeId` from core used identically in server (Dispatcher, server.ts) and web (useRide, Book, DriverOnline, Ride, Receipt). `Offer` defined in `useRide` and consumed by `DriverOnline`/App. Dispatcher method names (`request`, `goOnline`, `accept`, `decline`, `advance`, `cancel`, `leave`, `viewFor`, `viewForOffer`, `partnerOf`, `partnerView`) match server.ts call sites.
- **Placeholder scan:** none; every step has full code.
- **Phase-2 seam:** in-ride `Chat` + `useRide.sendChat`/receive is unchanged and remains where translation inserts.
```
