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
