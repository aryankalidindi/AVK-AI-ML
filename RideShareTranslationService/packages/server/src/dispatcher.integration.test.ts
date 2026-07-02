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
