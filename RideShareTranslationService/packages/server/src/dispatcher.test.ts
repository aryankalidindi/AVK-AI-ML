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
