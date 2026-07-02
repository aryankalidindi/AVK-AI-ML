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

export function formatUSD(amount: number): string {
  return `$${amount.toFixed(2)}`
}

/** Convert an IDR amount to USD given the IDR-per-USD rate. */
export function idrToUsd(idr: number, idrPerUsd: number): number {
  return idr / idrPerUsd
}
