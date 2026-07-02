import type { RideView } from '@rst/core'

interface PartnerCardProps {
  ride: RideView
}

export function PartnerCard({ ride }: PartnerCardProps) {
  const { partner } = ride
  const isDriver = partner.role === 'driver'
  const initial = partner.displayName.charAt(0).toUpperCase()
  const status = isDriver ? `Arriving in ${partner.etaMins ?? 3} min` : 'Picking up'

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
