import { useState } from 'react'
import { formatIDR, formatUSD, idrToUsd, type RideView } from '@rst/core'
import { useUsdRate } from '../lib/useUsdRate'

interface ReceiptProps {
  ride: RideView
  onDone: () => void
}

export function Receipt({ ride, onDone }: ReceiptProps) {
  const isDriver = ride.you === 'driver'
  const [stars, setStars] = useState(0)
  const usdRate = useUsdRate()
  const usd = !isDriver && usdRate ? formatUSD(idrToUsd(ride.details.fare, usdRate)) : null

  return (
    <section aria-labelledby="receipt-heading" className="screen receipt">
      <div className="radar" aria-hidden="true"><span className="radar__dot">{isDriver ? '💰' : '🏁'}</span></div>
      <h1 id="receipt-heading" className="receipt__title">{isDriver ? 'Trip complete' : 'You have arrived'}</h1>

      <div className="receipt__card">
        <div className="receipt__row"><span>{ride.details.pickup} → {ride.details.destination}</span></div>
        <div className="receipt__row"><span>{ride.details.distanceKm} km · {ride.details.tripMins} min</span></div>
        <div className="receipt__row receipt__row--total">
          <span>{isDriver ? 'You earned' : 'Total'}</span>
          <strong>{formatIDR(ride.details.fare)}</strong>
        </div>
        {usd && (
          <div className="receipt__row receipt__usd"><span>in your currency</span><span>~{usd}</span></div>
        )}
      </div>

      {!isDriver && (
        <div className="rating" role="group" aria-label="Rate your driver">
          <p className="rating__label">Rate {ride.partner.displayName}</p>
          <div className="rating__stars">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                className={n <= stars ? 'star star--on' : 'star'}
                aria-label={`${n} star${n > 1 ? 's' : ''}`}
                aria-pressed={n <= stars}
                onClick={() => setStars(n)}
              >★</button>
            ))}
          </div>
        </div>
      )}

      <button className="btn btn--primary btn--block" onClick={onDone}>Done</button>
    </section>
  )
}
