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
