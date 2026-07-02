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

  advance(driverId: string, phase: RidePhase): { partnerId?: string; phase?: RidePhase } {
    const ride = this.rideForClient(driverId)
    if (!ride || ride.driver.clientId !== driverId) return {}
    ride.phase = phase
    return { partnerId: ride.rider.clientId, phase }
  }

  cancel(clientId: string): { partnerId?: string; withdrawnDriverId?: string } {
    const ride = this.rideForClient(clientId)
    if (ride) {
      ride.phase = 'cancelled'
      const partnerId = ride.rider.clientId === clientId ? ride.driver.clientId : ride.rider.clientId
      this.teardown(ride)
      return { partnerId }
    }
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

    const ownOffer = this.offers.get(clientId)
    if (ownOffer) {
      this.offers.delete(clientId)
      this.pending.push(ownOffer)
    }
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

  partnerOf(clientId: string): string | undefined {
    const ride = this.rideForClient(clientId)
    if (!ride) return undefined
    return ride.rider.clientId === clientId ? ride.driver.clientId : ride.rider.clientId
  }

  partnerView(clientId: string): PartnerView | undefined {
    const role = this.roleOf.get(clientId)
    const identity = this.identityOf.get(clientId)
    if (!role || !identity) return undefined
    return { role, displayName: identity.displayName, car: identity.car, etaMins: identity.etaMins }
  }

  viewForOffer(riderId: string, driverId: string): { details: RideDetails; rider: PartnerView } | undefined {
    const offer = this.offers.get(driverId)
    const rider = this.partnerView(riderId)
    if (!offer || !rider) return undefined
    return { details: offer.details, rider }
  }

  viewFor(clientId: string): RideView | undefined {
    const ride = this.rideForClient(clientId)
    if (!ride) return undefined
    const other = ride.rider.clientId === clientId ? ride.driver : ride.rider
    const meRole: Role = ride.rider.clientId === clientId ? 'rider' : 'driver'
    const otherRole: Role = meRole === 'rider' ? 'driver' : 'rider'
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

  private teardown(ride: Ride): void {
    this.clientToRide.delete(ride.rider.clientId)
    this.clientToRide.delete(ride.driver.clientId)
    this.rides.delete(ride.id)
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
