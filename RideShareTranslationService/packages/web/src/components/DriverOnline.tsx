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
