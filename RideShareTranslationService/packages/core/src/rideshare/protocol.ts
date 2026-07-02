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
  | { type: 'chat'; text: string; lang: string }

export type RideEndedReason = 'partner-left'

export type ServerMessage =
  | { type: 'waiting' }
  | { type: 'offer'; details: RideDetails; rider: PartnerView }
  | { type: 'offer-withdrawn' }
  | { type: 'matched'; ride: RideView }
  | { type: 'phase'; phase: RidePhase }
  | { type: 'chat'; text: string; fromRole: Role; ts: number; sourceLang: string }
  | { type: 'ride-ended'; reason: RideEndedReason }
