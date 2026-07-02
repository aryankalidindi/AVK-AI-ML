# Mock Rideshare Auto-Pairing Implementation Plan (Phase 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the room-code connection with a mock rideshare flow where a rider and a driver are auto-paired into a shared ride (no codes), with a modern dark UI and in-ride text chat.

**Architecture:** A `MatchingService` in the Node WebSocket server pairs the next waiting rider with the next waiting driver into a `Ride` and relays chat. The React web app has three screens (role select → requesting → ride+chat) driven by a `useRide` hook. Rideshare protocol types live in `@rst/core` and are imported type-only by the server (erased at runtime, so Node's strip-types loader is unaffected).

**Tech Stack:** TypeScript, npm workspaces, Vite + React, Node + `ws`, Vitest, Playwright.

---

## File Structure

```
packages/
├── core/
│   └── src/rideshare/protocol.ts     ← Role, PartnerView, RideView, Client/ServerMessage (types only)
│   └── src/index.ts                  ← (modified) export rideshare protocol
├── server/
│   └── src/matching.ts               ← MatchingService (pure, testable)
│   └── src/matching.test.ts          ← unit tests
│   └── src/server.ts                 ← (rewritten) WS matching + chat relay
│   └── src/matching.integration.test.ts ← two clients auto-pair + chat
│   └── src/rooms.ts                  ← DELETED (replaced by matching)
│   └── src/rooms.test.ts             ← DELETED
│   └── src/relay.integration.test.ts ← DELETED
│   └── src/claude-translator.ts      ← kept (dormant, phase 2)
│   └── src/mock-translator.ts        ← kept (dormant, phase 2)
└── web/
    └── src/transport/useRide.ts      ← WebSocket client + ride state machine
    └── src/components/RoleSelect.tsx
    └── src/components/Requesting.tsx
    └── src/components/MapScene.tsx
    └── src/components/PartnerCard.tsx
    └── src/components/Chat.tsx
    └── src/components/Ride.tsx
    └── src/components/rideshare.css
    └── src/styles/tokens.css         ← (rewritten) dark premium tokens
    └── src/App.tsx                   ← (rewritten) screen orchestrator
    └── src/transport/useSession.ts   ← DELETED
    └── src/components/Lobby.tsx       ← DELETED
    └── src/components/Conversation.tsx ← DELETED
    └── src/components/conversation.css ← DELETED
e2e/
└── ride.spec.ts                      ← two contexts auto-pair + chat
└── conversation.spec.ts              ← DELETED
```

---

## Task 1: Rideshare protocol types in core

**Files:**
- Create: `packages/core/src/rideshare/protocol.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Create the protocol types**

```ts
// packages/core/src/rideshare/protocol.ts
import type { Role } from '../session/types'

export type { Role }

export interface PartnerView {
  role: Role
  displayName: string
  car?: { model: string; plate: string }
  etaMins?: number
}

export interface RideView {
  rideId: string
  you: Role
  partner: PartnerView
}

export type ClientMessage =
  | { type: 'join'; role: Role }
  | { type: 'chat'; text: string }
  | { type: 'end-ride' }

export type RideEndedReason = 'partner-left' | 'completed'

export type ServerMessage =
  | { type: 'waiting' }
  | { type: 'matched'; ride: RideView }
  | { type: 'chat'; text: string; fromRole: Role; ts: number }
  | { type: 'ride-ended'; reason: RideEndedReason }
```

- [ ] **Step 2: Export from the core barrel**

Add this line to `packages/core/src/index.ts`:

```ts
export * from './rideshare/protocol'
```

- [ ] **Step 3: Type-check core**

Run: `npx tsc -p packages/core/tsconfig.json --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/rideshare/protocol.ts packages/core/src/index.ts
git commit -m "feat(core): add rideshare protocol types"
```

---

## Task 2: MatchingService — pairing (TDD)

**Files:**
- Create: `packages/server/src/matching.ts`
- Test: `packages/server/src/matching.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/server/src/matching.test.ts
import { describe, it, expect } from 'vitest'
import { MatchingService, type Identity } from './matching'

const fixedId = () => 'ride-1'
const identity = (role: 'rider' | 'driver'): Identity =>
  role === 'driver'
    ? { displayName: 'Budi', car: { model: 'Toyota Avanza', plate: 'B 1 XYZ' }, etaMins: 3 }
    : { displayName: 'Maya' }

describe('MatchingService.join', () => {
  it('queues the first participant without matching', () => {
    const svc = new MatchingService(fixedId, identity)
    expect(svc.join('rider-a', 'rider')).toEqual({ matched: false })
  })

  it('matches a waiting driver when a rider joins', () => {
    const svc = new MatchingService(fixedId, identity)
    svc.join('driver-a', 'driver')
    const result = svc.join('rider-a', 'rider')
    expect(result).toEqual({ matched: true, rideId: 'ride-1', partnerId: 'driver-a' })
  })

  it('does not match two of the same role', () => {
    const svc = new MatchingService(fixedId, identity)
    svc.join('rider-a', 'rider')
    expect(svc.join('rider-b', 'rider')).toEqual({ matched: false })
  })

  it('pairs in FIFO order', () => {
    const svc = new MatchingService(fixedId, identity)
    svc.join('driver-a', 'driver')
    svc.join('driver-b', 'driver')
    const result = svc.join('rider-a', 'rider')
    expect(result.partnerId).toBe('driver-a')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- matching.test`
Expected: FAIL — cannot find module `./matching`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/server/src/matching.ts
import type { Role, RideView, PartnerView } from '@rst/core'

export interface Identity {
  displayName: string
  car?: { model: string; plate: string }
  etaMins?: number
}

export type IdGen = () => string
export type IdentityFactory = (role: Role) => Identity

interface Participant {
  clientId: string
  role: Role
  identity: Identity
}

interface Ride {
  id: string
  participants: Participant[]
}

export interface JoinResult {
  matched: boolean
  rideId?: string
  partnerId?: string
}

function otherRole(role: Role): Role {
  return role === 'rider' ? 'driver' : 'rider'
}

export class MatchingService {
  private queues: Record<Role, string[]> = { rider: [], driver: [] }
  private rides = new Map<string, Ride>()
  private clientToRide = new Map<string, string>()
  private roleOf = new Map<string, Role>()
  private readonly genId: IdGen
  private readonly makeIdentity: IdentityFactory

  constructor(genId: IdGen = defaultId, makeIdentity: IdentityFactory = defaultIdentity) {
    this.genId = genId
    this.makeIdentity = makeIdentity
  }

  join(clientId: string, role: Role): JoinResult {
    this.roleOf.set(clientId, role)
    const partnerId = this.queues[otherRole(role)].shift()
    if (partnerId === undefined) {
      this.queues[role].push(clientId)
      return { matched: false }
    }
    const id = this.genId()
    const ride: Ride = {
      id,
      participants: [
        { clientId, role, identity: this.makeIdentity(role) },
        { clientId: partnerId, role: otherRole(role), identity: this.makeIdentity(otherRole(role)) },
      ],
    }
    this.rides.set(id, ride)
    this.clientToRide.set(clientId, id)
    this.clientToRide.set(partnerId, id)
    return { matched: true, rideId: id, partnerId }
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

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)] as T
}

function defaultIdentity(role: Role): Identity {
  if (role === 'driver') {
    return {
      displayName: pick(DRIVER_NAMES),
      car: { model: pick(CARS), plate: pick(PLATES) },
      etaMins: 2 + Math.floor(Math.random() * 5),
    }
  }
  return { displayName: pick(RIDER_NAMES) }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- matching.test`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/matching.ts packages/server/src/matching.test.ts
git commit -m "feat(server): add MatchingService pairing"
```

---

## Task 3: MatchingService — views, partner lookup, teardown (TDD)

**Files:**
- Modify: `packages/server/src/matching.ts`
- Modify: `packages/server/src/matching.test.ts`

- [ ] **Step 1: Add the failing tests**

Append to `packages/server/src/matching.test.ts`:

```ts
describe('MatchingService views and teardown', () => {
  it('builds a per-recipient view showing the partner', () => {
    const svc = new MatchingService(fixedId, identity)
    svc.join('driver-a', 'driver')
    svc.join('rider-a', 'rider')

    const riderView = svc.viewFor('rider-a')
    expect(riderView).toEqual({
      rideId: 'ride-1',
      you: 'rider',
      partner: { role: 'driver', displayName: 'Budi', car: { model: 'Toyota Avanza', plate: 'B 1 XYZ' }, etaMins: 3 },
    })

    const driverView = svc.viewFor('driver-a')
    expect(driverView?.you).toBe('driver')
    expect(driverView?.partner.role).toBe('rider')
    expect(driverView?.partner.displayName).toBe('Maya')
  })

  it('returns the partner client id', () => {
    const svc = new MatchingService(fixedId, identity)
    svc.join('driver-a', 'driver')
    svc.join('rider-a', 'rider')
    expect(svc.partnerOf('rider-a')).toBe('driver-a')
    expect(svc.partnerOf('driver-a')).toBe('rider-a')
  })

  it('on leave, ends the ride and reports the partner', () => {
    const svc = new MatchingService(fixedId, identity)
    svc.join('driver-a', 'driver')
    svc.join('rider-a', 'rider')
    expect(svc.leave('rider-a')).toEqual({ partnerId: 'driver-a' })
    expect(svc.partnerOf('driver-a')).toBeUndefined()
  })

  it('on leave while only queued, removes from the queue with no partner', () => {
    const svc = new MatchingService(fixedId, identity)
    svc.join('rider-a', 'rider')
    expect(svc.leave('rider-a')).toEqual({})
    // a later driver should NOT match the removed rider
    expect(svc.join('driver-a', 'driver')).toEqual({ matched: false })
  })
})
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `npm test -- matching.test`
Expected: FAIL — `viewFor`, `partnerOf`, `leave` are not functions.

- [ ] **Step 3: Add the methods**

Add these methods inside the `MatchingService` class (after `join`):

```ts
  viewFor(clientId: string): RideView | undefined {
    const ride = this.rideForClient(clientId)
    if (!ride) return undefined
    const me = ride.participants.find((p) => p.clientId === clientId)
    const other = ride.participants.find((p) => p.clientId !== clientId)
    if (!me || !other) return undefined
    const partner: PartnerView = {
      role: other.role,
      displayName: other.identity.displayName,
      car: other.identity.car,
      etaMins: other.identity.etaMins,
    }
    return { rideId: ride.id, you: me.role, partner }
  }

  partnerOf(clientId: string): string | undefined {
    const ride = this.rideForClient(clientId)
    return ride?.participants.find((p) => p.clientId !== clientId)?.clientId
  }

  leave(clientId: string): { partnerId?: string } {
    const role = this.roleOf.get(clientId)
    this.roleOf.delete(clientId)
    if (role) {
      this.queues[role] = this.queues[role].filter((id) => id !== clientId)
    }
    const ride = this.rideForClient(clientId)
    if (!ride) return {}
    const partnerId = ride.participants.find((p) => p.clientId !== clientId)?.clientId
    for (const p of ride.participants) this.clientToRide.delete(p.clientId)
    this.rides.delete(ride.id)
    return partnerId ? { partnerId } : {}
  }

  private rideForClient(clientId: string): Ride | undefined {
    const id = this.clientToRide.get(clientId)
    return id ? this.rides.get(id) : undefined
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- matching.test`
Expected: PASS (8 tests total).

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/matching.ts packages/server/src/matching.test.ts
git commit -m "feat(server): add MatchingService views, partner lookup, teardown"
```

---

## Task 4: Rewrite the WebSocket server as a matching + chat relay

**Files:**
- Rewrite: `packages/server/src/server.ts`
- Delete: `packages/server/src/rooms.ts`, `packages/server/src/rooms.test.ts`, `packages/server/src/relay.integration.test.ts`

- [ ] **Step 1: Delete the obsolete room files**

```bash
git rm packages/server/src/rooms.ts packages/server/src/rooms.test.ts packages/server/src/relay.integration.test.ts
```

- [ ] **Step 2: Rewrite `packages/server/src/server.ts`**

```ts
import { WebSocketServer, WebSocket } from 'ws'
import { randomUUID } from 'node:crypto'
import type { ClientMessage, ServerMessage } from '@rst/core'
import { MatchingService } from './matching.ts'

const PORT = Number(process.env.PORT ?? 8787)

const matching = new MatchingService()
const sockets = new Map<string, WebSocket>()
const wss = new WebSocketServer({ port: PORT })

function send(clientId: string, msg: ServerMessage): void {
  const ws = sockets.get(clientId)
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg))
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

    if (msg.type === 'join') {
      const result = matching.join(clientId, msg.role)
      if (!result.matched) {
        send(clientId, { type: 'waiting' })
        return
      }
      // Notify both participants with their own tailored view.
      const me = matching.viewFor(clientId)
      const partnerId = result.partnerId
      const partnerView = partnerId ? matching.viewFor(partnerId) : undefined
      if (me) send(clientId, { type: 'matched', ride: me })
      if (partnerId && partnerView) send(partnerId, { type: 'matched', ride: partnerView })
      return
    }

    if (msg.type === 'chat') {
      const partnerId = matching.partnerOf(clientId)
      const role = matching.viewFor(clientId)?.you
      if (partnerId && role) {
        send(partnerId, { type: 'chat', text: msg.text, fromRole: role, ts: Date.now() })
      }
      return
    }

    if (msg.type === 'end-ride') {
      const { partnerId } = matching.leave(clientId)
      if (partnerId) send(partnerId, { type: 'ride-ended', reason: 'partner-left' })
      return
    }
  })

  ws.on('close', () => {
    const { partnerId } = matching.leave(clientId)
    sockets.delete(clientId)
    if (partnerId) send(partnerId, { type: 'ride-ended', reason: 'partner-left' })
  })
})

console.log(`matching server listening on ws://localhost:${PORT}`)
```

- [ ] **Step 3: Run the full test suite (old room tests gone, matching tests stay)**

Run: `npm test`
Expected: PASS — matching + translator suites green; no rooms/relay tests.

- [ ] **Step 4: Boot the server to verify it starts**

Run: `node --experimental-strip-types packages/server/src/server.ts`
Expected: prints `matching server listening on ws://localhost:8787`. Stop with Ctrl-C.

- [ ] **Step 5: Type-check the server**

Run: `npx tsc -p packages/server/tsconfig.json --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/server.ts
git commit -m "feat(server): replace room relay with matching + chat server"
```

---

## Task 5: Integration test — two clients auto-pair + chat (TDD)

**Files:**
- Create: `packages/server/src/matching.integration.test.ts`

- [ ] **Step 1: Write the failing integration test**

```ts
// packages/server/src/matching.integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { WebSocketServer } from 'ws'
import WebSocket from 'ws'
import { randomUUID } from 'node:crypto'
import { MatchingService } from './matching'

function startServer(port: number) {
  const matching = new MatchingService(() => 'ride-test')
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
      if (msg.type === 'join') {
        const r = matching.join(id, msg.role)
        if (!r.matched) {
          send(id, { type: 'waiting' })
        } else {
          send(id, { type: 'matched', ride: matching.viewFor(id) })
          if (r.partnerId) send(r.partnerId, { type: 'matched', ride: matching.viewFor(r.partnerId) })
        }
      } else if (msg.type === 'chat') {
        const partner = matching.partnerOf(id)
        const role = matching.viewFor(id)?.you
        if (partner && role) send(partner, { type: 'chat', text: msg.text, fromRole: role, ts: 1 })
      }
    })
  })
  return wss
}

const PORT = 8921
let wss: WebSocketServer

beforeAll(() => { wss = startServer(PORT) })
afterAll(() => { wss.close() })

function connect(): Promise<WebSocket> {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://localhost:${PORT}`)
    ws.on('open', () => resolve(ws))
  })
}
function next(ws: WebSocket): Promise<any> {
  return new Promise((resolve) => ws.once('message', (m) => resolve(JSON.parse(m.toString()))))
}

describe('matching integration', () => {
  it('auto-pairs a driver and rider and relays chat', async () => {
    const driver = await connect()
    driver.send(JSON.stringify({ type: 'join', role: 'driver' }))
    const waiting = await next(driver)
    expect(waiting.type).toBe('waiting')

    const rider = await connect()
    const riderMatched = next(rider)
    const driverMatched = next(driver)
    rider.send(JSON.stringify({ type: 'join', role: 'rider' }))

    const rm = await riderMatched
    const dm = await driverMatched
    expect(rm.type).toBe('matched')
    expect(rm.ride.you).toBe('rider')
    expect(rm.ride.partner.role).toBe('driver')
    expect(dm.ride.you).toBe('driver')

    const relayed = next(driver)
    rider.send(JSON.stringify({ type: 'chat', text: 'on my way down' }))
    const chat = await relayed
    expect(chat).toMatchObject({ type: 'chat', text: 'on my way down', fromRole: 'rider' })

    rider.close()
    driver.close()
  })
})
```

- [ ] **Step 2: Run the test**

Run: `npm test -- matching.integration`
Expected: PASS (1 test).

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/matching.integration.test.ts
git commit -m "test(server): add auto-pair + chat integration test"
```

---

## Task 6: Web — `useRide` transport hook

**Files:**
- Create: `packages/web/src/transport/useRide.ts`
- Delete: `packages/web/src/transport/useSession.ts`

- [ ] **Step 1: Delete the old session hook**

```bash
git rm packages/web/src/transport/useSession.ts
```

- [ ] **Step 2: Create `packages/web/src/transport/useRide.ts`**

```ts
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Role, RideView, ServerMessage } from '@rst/core'

const RELAY_URL = import.meta.env.VITE_RELAY_URL ?? 'ws://localhost:8787'

export type RideState = 'idle' | 'connecting' | 'waiting' | 'in-ride' | 'ended'

export interface ChatLine {
  id: number
  text: string
  fromRole: Role
  mine: boolean
  ts: number
}

export interface RideApi {
  state: RideState
  role: Role | null
  ride: RideView | null
  messages: ChatLine[]
  endedReason: string | null
  join: (role: Role) => void
  sendChat: (text: string) => void
  endRide: () => void
  reset: () => void
}

export function useRide(): RideApi {
  const ws = useRef<WebSocket | null>(null)
  const nextId = useRef(0)
  const roleRef = useRef<Role | null>(null)
  const [state, setState] = useState<RideState>('idle')
  const [role, setRole] = useState<Role | null>(null)
  const [ride, setRide] = useState<RideView | null>(null)
  const [messages, setMessages] = useState<ChatLine[]>([])
  const [endedReason, setEndedReason] = useState<string | null>(null)

  const closeSocket = useCallback(() => {
    ws.current?.close()
    ws.current = null
  }, [])

  const join = useCallback((selectedRole: Role) => {
    setState('connecting')
    setRole(selectedRole)
    roleRef.current = selectedRole
    setMessages([])
    setEndedReason(null)

    const socket = new WebSocket(RELAY_URL)
    ws.current = socket

    socket.onmessage = (e) => {
      const msg = JSON.parse(e.data) as ServerMessage
      switch (msg.type) {
        case 'waiting':
          setState('waiting')
          break
        case 'matched':
          setRide(msg.ride)
          setState('in-ride')
          break
        case 'chat':
          setMessages((prev) => [
            ...prev,
            { id: nextId.current++, text: msg.text, fromRole: msg.fromRole, mine: false, ts: msg.ts },
          ])
          break
        case 'ride-ended':
          setEndedReason(msg.reason)
          setState('ended')
          break
      }
    }
    socket.onclose = () => {
      setState((s) => (s === 'in-ride' || s === 'waiting' ? 'ended' : s))
    }
    socket.onopen = () => socket.send(JSON.stringify({ type: 'join', role: selectedRole }))
  }, [])

  const sendChat = useCallback((text: string) => {
    const trimmed = text.trim()
    const myRole = roleRef.current
    if (trimmed.length === 0 || !myRole) return
    ws.current?.send(JSON.stringify({ type: 'chat', text: trimmed }))
    setMessages((prev) => [
      ...prev,
      { id: nextId.current++, text: trimmed, fromRole: myRole, mine: true, ts: Date.now() },
    ])
  }, [])

  const endRide = useCallback(() => {
    ws.current?.send(JSON.stringify({ type: 'end-ride' }))
    closeSocket()
    setState('ended')
    setEndedReason('completed')
  }, [closeSocket])

  const reset = useCallback(() => {
    closeSocket()
    setState('idle')
    setRole(null)
    roleRef.current = null
    setRide(null)
    setMessages([])
    setEndedReason(null)
  }, [closeSocket])

  useEffect(() => () => { ws.current?.close() }, [])

  return { state, role, ride, messages, endedReason, join, sendChat, endRide, reset }
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc -p packages/web/tsconfig.json --noEmit`
Expected: errors only about missing components referenced elsewhere are NOT expected yet (App still references old files). If `App.tsx` still imports deleted files, that's fixed in Task 13 — for now just confirm `useRide.ts` itself has no type errors by checking the output mentions only App/old files. (It is acceptable for this step to show errors from `App.tsx`; they are resolved in Task 13.)

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/transport/useRide.ts
git commit -m "feat(web): add useRide transport hook and ride state machine"
```

---

## Task 7: Web — dark premium design tokens

**Files:**
- Rewrite: `packages/web/src/styles/tokens.css`

- [ ] **Step 1: Rewrite `packages/web/src/styles/tokens.css`**

```css
:root {
  /* Dark premium palette */
  --bg: oklch(18% 0.02 265);
  --bg-elevated: oklch(23% 0.025 265);
  --bg-card: oklch(26% 0.03 265);
  --border: oklch(34% 0.03 265);
  --text: oklch(96% 0.01 265);
  --text-muted: oklch(72% 0.02 265);
  --accent: oklch(72% 0.17 155);          /* confident teal-green */
  --accent-contrast: oklch(20% 0.05 155);
  --driver: oklch(72% 0.17 155);
  --rider: oklch(72% 0.15 250);
  --danger: oklch(64% 0.2 25);

  --text-hero: clamp(1.8rem, 1.2rem + 2.5vw, 2.8rem);
  --text-title: clamp(1.25rem, 1rem + 1vw, 1.6rem);
  --text-base: clamp(1rem, 0.95rem + 0.2vw, 1.0625rem);

  --space-sm: 0.5rem;
  --space-md: 1rem;
  --space-lg: 1.75rem;

  --radius: 18px;
  --radius-sm: 12px;
  --shadow: 0 18px 50px -20px oklch(0% 0 0 / 0.7);
  --duration-fast: 160ms;
  --duration-normal: 320ms;
  --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
}

* { box-sizing: border-box; }
html, body, #root { height: 100%; }
body {
  margin: 0;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  color: var(--text);
  background:
    radial-gradient(1200px 600px at 80% -10%, oklch(30% 0.05 265 / 0.6), transparent),
    var(--bg);
  -webkit-font-smoothing: antialiased;
}
button { font: inherit; }
@media (prefers-reduced-motion: reduce) {
  * { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important;
      transition-duration: 0.001ms !important; }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/styles/tokens.css
git commit -m "style(web): dark premium design tokens"
```

---

## Task 8: Web — RoleSelect screen

**Files:**
- Create: `packages/web/src/components/RoleSelect.tsx`
- Create: `packages/web/src/components/rideshare.css`

- [ ] **Step 1: Create `packages/web/src/components/RoleSelect.tsx`**

```tsx
import type { Role } from '@rst/core'

interface RoleSelectProps {
  onChoose: (role: Role) => void
}

export function RoleSelect({ onChoose }: RoleSelectProps) {
  return (
    <section aria-labelledby="role-heading" className="screen role-select">
      <p className="brand">RideLingo</p>
      <h1 id="role-heading" className="role-select__title">Take a ride.<br />Speak any language.</h1>
      <p className="role-select__sub">Pick a role to start. You'll be matched automatically — no codes.</p>

      <div className="role-grid">
        <button className="role-card role-card--rider" onClick={() => onChoose('rider')}>
          <span className="role-card__emoji" aria-hidden="true">🧍</span>
          <span className="role-card__label">I'm a Rider</span>
          <span className="role-card__hint">Request a ride</span>
        </button>
        <button className="role-card role-card--driver" onClick={() => onChoose('driver')}>
          <span className="role-card__emoji" aria-hidden="true">🚗</span>
          <span className="role-card__label">I'm a Driver</span>
          <span className="role-card__hint">Go online</span>
        </button>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Create `packages/web/src/components/rideshare.css` with the base + RoleSelect styles**

```css
.screen { max-width: 30rem; margin: 0 auto; padding: var(--space-lg); min-height: 100%;
  display: flex; flex-direction: column; }
.brand { font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase;
  color: var(--accent); font-size: 0.8rem; margin: 0 0 var(--space-lg); }

.role-select { justify-content: center; }
.role-select__title { font-size: var(--text-hero); line-height: 1.05; margin: 0 0 var(--space-md);
  letter-spacing: -0.02em; }
.role-select__sub { color: var(--text-muted); margin: 0 0 var(--space-lg); }
.role-grid { display: grid; gap: var(--space-md); }
.role-card { display: flex; flex-direction: column; gap: 4px; align-items: flex-start;
  padding: var(--space-lg); border-radius: var(--radius); cursor: pointer; text-align: left;
  background: var(--bg-card); border: 1px solid var(--border); color: var(--text);
  transition: transform var(--duration-fast) var(--ease-out-expo), border-color var(--duration-fast); }
.role-card:hover { transform: translateY(-3px); border-color: var(--accent); }
.role-card:focus-visible { outline: none; border-color: var(--accent);
  box-shadow: 0 0 0 3px oklch(72% 0.17 155 / 0.4); }
.role-card__emoji { font-size: 2rem; }
.role-card__label { font-size: var(--text-title); font-weight: 650; }
.role-card__hint { color: var(--text-muted); font-size: 0.9rem; }
.role-card--driver:hover { border-color: var(--driver); }
.role-card--rider:hover { border-color: var(--rider); }
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/RoleSelect.tsx packages/web/src/components/rideshare.css
git commit -m "feat(web): add RoleSelect screen"
```

---

## Task 9: Web — Requesting screen

**Files:**
- Create: `packages/web/src/components/Requesting.tsx`
- Modify: `packages/web/src/components/rideshare.css`

- [ ] **Step 1: Create `packages/web/src/components/Requesting.tsx`**

```tsx
import type { Role } from '@rst/core'

interface RequestingProps {
  role: Role
  onCancel: () => void
}

export function Requesting({ role, onCancel }: RequestingProps) {
  const title = role === 'rider' ? 'Finding your driver' : 'Waiting for a ride request'
  const sub = role === 'rider'
    ? 'Matching you with a nearby driver…'
    : 'You are online. Hang tight for a rider…'

  return (
    <section aria-labelledby="req-heading" className="screen requesting">
      <div className="radar" aria-hidden="true">
        <span className="radar__ping" />
        <span className="radar__ping radar__ping--2" />
        <span className="radar__dot">{role === 'rider' ? '🧍' : '🚗'}</span>
      </div>
      <h1 id="req-heading" className="requesting__title">{title}</h1>
      <p className="requesting__sub" role="status">{sub}</p>
      <button className="btn btn--ghost" onClick={onCancel}>Cancel</button>
    </section>
  )
}
```

- [ ] **Step 2: Append Requesting + shared button styles to `rideshare.css`**

```css
.requesting { align-items: center; justify-content: center; text-align: center; }
.requesting__title { font-size: var(--text-title); margin: var(--space-lg) 0 6px; }
.requesting__sub { color: var(--text-muted); margin: 0 0 var(--space-lg); }
.radar { position: relative; width: 140px; height: 140px; display: grid; place-items: center; }
.radar__dot { font-size: 2.4rem; z-index: 1; }
.radar__ping { position: absolute; inset: 0; border-radius: 50%; border: 2px solid var(--accent);
  animation: ping 1.8s var(--ease-out-expo) infinite; opacity: 0; }
.radar__ping--2 { animation-delay: 0.9s; }
@keyframes ping { 0% { transform: scale(0.4); opacity: 0.7; } 100% { transform: scale(1); opacity: 0; } }

.btn { padding: 12px 20px; border-radius: var(--radius-sm); border: 1px solid var(--border);
  background: var(--bg-elevated); color: var(--text); cursor: pointer;
  transition: transform var(--duration-fast) var(--ease-out-expo); }
.btn:hover { transform: translateY(-1px); }
.btn:disabled { opacity: 0.45; cursor: not-allowed; }
.btn--primary { background: var(--accent); color: var(--accent-contrast); border-color: transparent;
  font-weight: 650; }
.btn--ghost { background: transparent; }
.btn--danger { background: transparent; border-color: var(--danger); color: var(--danger); }
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/Requesting.tsx packages/web/src/components/rideshare.css
git commit -m "feat(web): add Requesting screen"
```

---

## Task 10: Web — MapScene (animated offline map)

**Files:**
- Create: `packages/web/src/components/MapScene.tsx`
- Modify: `packages/web/src/components/rideshare.css`

- [ ] **Step 1: Create `packages/web/src/components/MapScene.tsx`**

```tsx
// Self-contained stylized map: a curved route with a car gliding toward the pin.
// No tiles, no geolocation, no network. Motion is compositor-friendly (offset-path).
export function MapScene() {
  return (
    <div className="map" role="img" aria-label="Map showing the driver approaching the pickup point">
      <svg className="map__svg" viewBox="0 0 400 220" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="route" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="oklch(72% 0.17 155)" />
            <stop offset="1" stop-color="oklch(72% 0.15 250)" />
          </linearGradient>
        </defs>
        <path className="map__road" d="M-20 180 C 80 120, 120 200, 200 140 S 340 60, 420 90" />
        <path className="map__route" d="M-20 180 C 80 120, 120 200, 200 140 S 340 60, 420 90"
          stroke="url(#route)" />
        <circle className="map__pin" cx="330" cy="86" r="7" />
      </svg>
      <span className="map__car" aria-hidden="true">🚕</span>
    </div>
  )
}
```

- [ ] **Step 2: Append MapScene styles to `rideshare.css`**

```css
.map { position: relative; height: 200px; border-radius: var(--radius); overflow: hidden;
  background: linear-gradient(160deg, oklch(24% 0.03 265), oklch(20% 0.02 265));
  border: 1px solid var(--border); }
.map__svg { width: 100%; height: 100%; display: block; }
.map__road { fill: none; stroke: oklch(34% 0.02 265); stroke-width: 14; stroke-linecap: round; }
.map__route { fill: none; stroke-width: 4; stroke-linecap: round; stroke-dasharray: 6 10;
  animation: dash 1.2s linear infinite; }
@keyframes dash { to { stroke-dashoffset: -16; } }
.map__pin { fill: var(--rider); stroke: white; stroke-width: 2; }
.map__car { position: absolute; top: 0; left: 0; font-size: 1.6rem;
  offset-path: path("M-20 180 C 80 120, 120 200, 200 140 S 340 60, 420 90");
  offset-rotate: auto; animation: drive 7s var(--ease-out-expo) infinite; }
@keyframes drive { from { offset-distance: 0%; } to { offset-distance: 92%; } }
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/MapScene.tsx packages/web/src/components/rideshare.css
git commit -m "feat(web): add animated offline MapScene"
```

---

## Task 11: Web — PartnerCard

**Files:**
- Create: `packages/web/src/components/PartnerCard.tsx`
- Modify: `packages/web/src/components/rideshare.css`

- [ ] **Step 1: Create `packages/web/src/components/PartnerCard.tsx`**

```tsx
import type { RideView } from '@rst/core'

interface PartnerCardProps {
  ride: RideView
}

export function PartnerCard({ ride }: PartnerCardProps) {
  const { partner } = ride
  const isDriver = partner.role === 'driver'
  const initial = partner.displayName.charAt(0).toUpperCase()
  const status = isDriver
    ? `Arriving in ${partner.etaMins ?? 3} min`
    : 'Picking up'

  return (
    <div className={`partner partner--${partner.role}`}>
      <div className="partner__avatar" aria-hidden="true">{initial}</div>
      <div className="partner__info">
        <p className="partner__name">{partner.displayName}</p>
        {isDriver && partner.car ? (
          <p className="partner__meta">{partner.car.model} · {partner.car.plate}</p>
        ) : (
          <p className="partner__meta">Your rider</p>
        )}
      </div>
      <span className="partner__status">{status}</span>
    </div>
  )
}
```

- [ ] **Step 2: Append PartnerCard styles to `rideshare.css`**

```css
.partner { display: flex; align-items: center; gap: var(--space-md); padding: var(--space-md);
  background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); }
.partner__avatar { width: 48px; height: 48px; flex: 0 0 auto; border-radius: 50%;
  display: grid; place-items: center; font-weight: 700; font-size: 1.2rem;
  background: var(--accent); color: var(--accent-contrast); }
.partner--rider .partner__avatar { background: var(--rider); }
.partner__info { flex: 1; min-width: 0; }
.partner__name { margin: 0; font-weight: 650; font-size: var(--text-title); }
.partner__meta { margin: 2px 0 0; color: var(--text-muted); font-size: 0.9rem; }
.partner__status { font-size: 0.8rem; color: var(--accent); white-space: nowrap; }
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/PartnerCard.tsx packages/web/src/components/rideshare.css
git commit -m "feat(web): add PartnerCard"
```

---

## Task 12: Web — Chat panel

**Files:**
- Create: `packages/web/src/components/Chat.tsx`
- Modify: `packages/web/src/components/rideshare.css`

- [ ] **Step 1: Create `packages/web/src/components/Chat.tsx`**

```tsx
import { useState } from 'react'
import type { ChatLine } from '../transport/useRide'

interface ChatProps {
  messages: ChatLine[]
  onSend: (text: string) => void
}

export function Chat({ messages, onSend }: ChatProps) {
  const [draft, setDraft] = useState('')

  return (
    <div className="chat">
      <ol className="chat__list" aria-live="polite">
        {messages.length === 0 && (
          <li className="chat__empty">Say hello to your {messages.length === 0 ? 'co-rider' : ''}…</li>
        )}
        {messages.map((m) => (
          <li key={m.id} className={m.mine ? 'bubble bubble--mine' : 'bubble bubble--theirs'}>
            {m.text}
          </li>
        ))}
      </ol>
      <form
        className="chat__composer"
        onSubmit={(e) => { e.preventDefault(); onSend(draft); setDraft('') }}
      >
        <input
          className="chat__input"
          aria-label="Message"
          placeholder="Message…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit" className="btn btn--primary" disabled={draft.trim().length === 0}>
          Send
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Append Chat styles to `rideshare.css`**

```css
.chat { display: flex; flex-direction: column; gap: var(--space-md); flex: 1; min-height: 0; }
.chat__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column;
  gap: 8px; overflow-y: auto; flex: 1; min-height: 120px; }
.chat__empty { color: var(--text-muted); font-size: 0.9rem; text-align: center; margin-top: var(--space-md); }
.bubble { max-width: 80%; padding: 10px 14px; border-radius: 16px; font-size: var(--text-base);
  animation: rise var(--duration-fast) var(--ease-out-expo); }
.bubble--mine { align-self: flex-end; background: var(--accent); color: var(--accent-contrast);
  border-bottom-right-radius: 4px; }
.bubble--theirs { align-self: flex-start; background: var(--bg-card); border: 1px solid var(--border);
  border-bottom-left-radius: 4px; }
@keyframes rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
.chat__composer { display: flex; gap: 8px; }
.chat__input { flex: 1; padding: 12px 14px; border-radius: var(--radius-sm);
  background: var(--bg-elevated); border: 1px solid var(--border); color: var(--text); }
.chat__input:focus-visible { outline: none; border-color: var(--accent);
  box-shadow: 0 0 0 3px oklch(72% 0.17 155 / 0.35); }
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/Chat.tsx packages/web/src/components/rideshare.css
git commit -m "feat(web): add in-ride chat panel"
```

---

## Task 13: Web — Ride screen + App orchestrator

**Files:**
- Create: `packages/web/src/components/Ride.tsx`
- Rewrite: `packages/web/src/App.tsx`
- Delete: `packages/web/src/components/Lobby.tsx`, `packages/web/src/components/Conversation.tsx`, `packages/web/src/components/conversation.css`

- [ ] **Step 1: Delete the obsolete web components**

```bash
git rm packages/web/src/components/Lobby.tsx packages/web/src/components/Conversation.tsx packages/web/src/components/conversation.css
```

- [ ] **Step 2: Create `packages/web/src/components/Ride.tsx`**

```tsx
import type { RideView } from '@rst/core'
import type { ChatLine } from '../transport/useRide'
import { MapScene } from './MapScene'
import { PartnerCard } from './PartnerCard'
import { Chat } from './Chat'

interface RideProps {
  ride: RideView
  messages: ChatLine[]
  onSend: (text: string) => void
  onEnd: () => void
}

export function Ride({ ride, messages, onSend, onEnd }: RideProps) {
  return (
    <section aria-labelledby="ride-heading" className="screen ride">
      <header className="ride__bar">
        <h1 id="ride-heading" className="ride__title">On trip</h1>
        <button className="btn btn--danger btn--sm" onClick={onEnd}>End ride</button>
      </header>
      <MapScene />
      <PartnerCard ride={ride} />
      <Chat messages={messages} onSend={onSend} />
    </section>
  )
}
```

- [ ] **Step 3: Rewrite `packages/web/src/App.tsx`**

```tsx
import { useRide } from './transport/useRide'
import { RoleSelect } from './components/RoleSelect'
import { Requesting } from './components/Requesting'
import { Ride } from './components/Ride'
import './components/rideshare.css'

export function App() {
  const r = useRide()

  if (r.state === 'in-ride' && r.ride) {
    return (
      <main>
        <Ride ride={r.ride} messages={r.messages} onSend={r.sendChat} onEnd={r.endRide} />
      </main>
    )
  }

  if (r.state === 'ended') {
    return (
      <main>
        <section className="screen ended">
          <div className="radar" aria-hidden="true"><span className="radar__dot">🏁</span></div>
          <h1 className="requesting__title">Ride ended</h1>
          <p className="requesting__sub">
            {r.endedReason === 'partner-left' ? 'Your co-rider left the trip.' : 'Thanks for riding!'}
          </p>
          <button className="btn btn--primary" onClick={r.reset}>Back to start</button>
        </section>
      </main>
    )
  }

  if ((r.state === 'connecting' || r.state === 'waiting') && r.role) {
    return (
      <main>
        <Requesting role={r.role} onCancel={r.reset} />
      </main>
    )
  }

  return (
    <main>
      <RoleSelect onChoose={r.join} />
    </main>
  )
}
```

- [ ] **Step 4: Append ride bar + ended styles to `rideshare.css`**

```css
.ride { gap: var(--space-md); }
.ride__bar { display: flex; align-items: center; justify-content: space-between; }
.ride__title { font-size: var(--text-title); margin: 0; }
.btn--sm { padding: 8px 14px; font-size: 0.85rem; }
.ended { align-items: center; justify-content: center; text-align: center; }
```

- [ ] **Step 5: Type-check the whole web package**

Run: `npx tsc -p packages/web/tsconfig.json --noEmit`
Expected: no errors.

- [ ] **Step 6: Build the web app**

Run: `npm -w @rst/web run build`
Expected: builds successfully.

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/components/Ride.tsx packages/web/src/App.tsx packages/web/src/components/rideshare.css
git commit -m "feat(web): add Ride screen and wire app orchestrator"
```

---

## Task 14: Remove dormant translation wiring from the web entry path

**Files:**
- Verify deletion already complete; confirm no dangling imports.

- [ ] **Step 1: Confirm no remaining imports of deleted files**

Run: `grep -rn "useSession\|Conversation\|Lobby\|http-translator" packages/web/src`
Expected: no matches (the `http-translator.ts` and `web-speech.ts` adapter files remain on disk for Phase 2 but must not be imported by the Phase-1 entry path).

- [ ] **Step 2: Confirm the build has no unused-file errors**

Run: `npx tsc -p packages/web/tsconfig.json --noEmit && npm -w @rst/web run build`
Expected: both succeed.

- [ ] **Step 3: Commit (if grep surfaced anything to fix)**

```bash
git add -A && git commit -m "chore(web): ensure no phase-1 imports of dormant adapters" || echo "nothing to commit"
```

---

## Task 15: E2E — two contexts auto-pair + chat

**Files:**
- Create: `e2e/ride.spec.ts`
- Delete: `e2e/conversation.spec.ts`

- [ ] **Step 1: Delete the old e2e spec**

```bash
git rm e2e/conversation.spec.ts
```

- [ ] **Step 2: Create `e2e/ride.spec.ts`**

```ts
import { test, expect } from '@playwright/test'

test('rider and driver auto-pair with no code and exchange a chat message', async ({ browser }) => {
  const driver = await browser.newPage()
  const rider = await browser.newPage()

  // Driver goes online first and waits.
  await driver.goto('/')
  await driver.getByRole('button', { name: "I'm a Driver" }).click()
  await expect(driver.getByText('Waiting for a ride request')).toBeVisible()

  // Rider requests — both should land in a ride with NO code typed.
  await rider.goto('/')
  await rider.getByRole('button', { name: "I'm a Rider" }).click()

  await expect(rider.getByRole('heading', { name: 'On trip' })).toBeVisible()
  await expect(driver.getByRole('heading', { name: 'On trip' })).toBeVisible()

  // Rider sees the driver partner card.
  await expect(rider.locator('.partner--driver')).toBeVisible()

  // Rider sends a message; driver receives it.
  await rider.getByLabel('Message').fill('on my way down')
  await rider.getByRole('button', { name: 'Send' }).click()
  await expect(driver.locator('.bubble--theirs')).toContainText('on my way down')
})
```

- [ ] **Step 3: Run the E2E on isolated ports**

Run: `RELAY_PORT=8801 WEB_PORT=5183 npm run test:e2e`
Expected: PASS (1 test).

- [ ] **Step 4: Commit**

```bash
git add e2e/ride.spec.ts
git commit -m "test(e2e): auto-pair and chat across two contexts"
```

---

## Task 16: README + final verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace the "Input modes" / "Run" sections of `README.md`**

Replace the run instructions and remove room-code references. Use this block for the run + flow section:

```markdown
## Run

```bash
npm install
npm run dev:server   # ws://localhost:8787  (matching + chat)
npm run dev:web      # http://localhost:5173
```

Open two windows. Pick **Driver** in one and **Rider** in the other — they
auto-pair into a ride with no code. Each sees the other's details and can chat.

Phase 2 will add speech-to-speech translation to the in-ride chat.
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
git commit -m "docs: update README for auto-pairing rideshare flow"
```

---

## Self-Review Notes

- **Spec coverage:** codeless auto-pairing (Tasks 2–5) ✓; role selection (Task 8) ✓; ride lifecycle requesting→matched→in-ride→ended (Tasks 6, 9, 13) ✓; partner card with car/plate/ETA (Task 11) ✓; status line (Tasks 11, 13) ✓; animated offline map (Task 10) ✓; in-ride text chat (Task 12) ✓; dark premium UI (Tasks 7–13) ✓; disconnect handling → ride-ended (Tasks 4, 6, 13) ✓; unit/integration/e2e tests (Tasks 2,3,5,15) ✓; no external calls (no API used anywhere) ✓; reduced-motion honored (Task 7) ✓.
- **Type consistency:** `Role`, `RideView`, `PartnerView`, `ClientMessage`, `ServerMessage` defined in Task 1 and used identically in server (Tasks 2–5) and web (Tasks 6,11,13). `ChatLine` defined in `useRide` (Task 6) and consumed by `Chat`/`Ride` (Tasks 12,13). `RideApi` method names (`join`, `sendChat`, `endRide`, `reset`) used consistently in App (Task 13).
- **Placeholder scan:** no TBD/TODO; all steps contain full code.
- **Phase-2 seam:** the in-ride `Chat` + `useRide.sendChat` path is where translation will be inserted next; `@rst/core` translation pipeline and the dormant translator adapters remain in place.
```
