import type { RideView, RidePhase } from '@rst/core'
import { formatIDR, formatUSD, idrToUsd } from '@rst/core'
import type { ChatLine } from '../transport/useRide'
import { useUsdRate } from '../lib/useUsdRate'
import { MapScene } from './MapScene'
import { PartnerCard } from './PartnerCard'
import { Chat } from './Chat'

interface RideProps {
  ride: RideView
  messages: ChatLine[]
  lang: string
  onSend: (text: string) => void
  onAdvance: (phase: RidePhase) => void
  onCancel: () => void
}

const RIDER_STATUS: Record<RidePhase, string> = {
  searching: 'Finding your driver…',
  accepted: 'Your driver is on the way',
  arrived: 'Your driver has arrived',
  in_progress: 'On the way to your destination',
  completed: 'You have arrived',
  cancelled: 'Ride cancelled',
}
const DRIVER_STATUS: Record<RidePhase, string> = {
  searching: 'Waiting…',
  accepted: 'Head to the pickup',
  arrived: 'Waiting for your rider',
  in_progress: 'Driving to destination',
  completed: 'Trip complete',
  cancelled: 'Ride cancelled',
}

// Driver's next lifecycle action per phase.
const NEXT: Partial<Record<RidePhase, { label: string; phase: RidePhase }>> = {
  accepted: { label: "I've arrived", phase: 'arrived' },
  arrived: { label: 'Start trip', phase: 'in_progress' },
  in_progress: { label: 'Complete trip', phase: 'completed' },
}

export function Ride({ ride, messages, lang, onSend, onAdvance, onCancel }: RideProps) {
  const isDriver = ride.you === 'driver'
  const status = (isDriver ? DRIVER_STATUS : RIDER_STATUS)[ride.phase]
  const next = isDriver ? NEXT[ride.phase] : undefined
  const canCancel = !isDriver && (ride.phase === 'accepted' || ride.phase === 'arrived')
  const usdRate = useUsdRate()
  const fareUsd = !isDriver && usdRate ? ` (~${formatUSD(idrToUsd(ride.details.fare, usdRate))})` : ''

  return (
    <section aria-labelledby="ride-heading" className="screen ride">
      <header className="ride__bar">
        <div>
          <h1 id="ride-heading" className="ride__title">{status}</h1>
          <p className="ride__route">{ride.details.pickup} → {ride.details.destination} · {formatIDR(ride.details.fare)}{fareUsd}</p>
        </div>
      </header>

      <MapScene />
      <PartnerCard ride={ride} />

      {(next || canCancel) && (
        <div className="ride__actions">
          {canCancel && <button className="btn btn--danger btn--block" onClick={onCancel}>Cancel ride</button>}
          {next && <button className="btn btn--primary btn--block" onClick={() => onAdvance(next.phase)}>{next.label}</button>}
        </div>
      )}

      <Chat messages={messages} lang={lang} onSend={onSend} />
    </section>
  )
}
