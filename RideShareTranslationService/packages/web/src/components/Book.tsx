import { useState } from 'react'
import { PLACES, placeByName, distanceKm, RIDE_TYPES, estimateFare, formatIDR, type RideDetails, type RideTypeId } from '@rst/core'

interface BookProps {
  onRequest: (details: RideDetails) => void
  onBack: () => void
}

export function Book({ onRequest, onBack }: BookProps) {
  const [pickup, setPickup] = useState(PLACES[0]!.name)
  const [destination, setDestination] = useState(PLACES[PLACES.length - 1]!.name)
  const [rideType, setRideType] = useState<RideTypeId>('economy')

  const a = placeByName(pickup)!
  const b = placeByName(destination)!
  const km = distanceKm(a, b)
  const samePlace = pickup === destination

  const buildDetails = (typeId: RideTypeId): RideDetails => {
    const est = estimateFare(km, typeId)
    return { pickup, destination, rideType: typeId, fare: est.fare, distanceKm: km, etaPickupMins: est.etaPickupMins, tripMins: est.tripMins }
  }

  return (
    <section aria-labelledby="book-heading" className="screen book">
      <button className="link-back" onClick={onBack}>← Back</button>
      <h1 id="book-heading" className="book__title">Where to?</h1>

      <div className="route">
        <label className="field field--from">
          <span className="field__label">Pickup</span>
          <select value={pickup} onChange={(e) => setPickup(e.target.value)}>
            {PLACES.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
          </select>
        </label>
        <label className="field field--to">
          <span className="field__label">Destination</span>
          <select value={destination} onChange={(e) => setDestination(e.target.value)}>
            {PLACES.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
          </select>
        </label>
      </div>
      {samePlace && <p className="field__error" role="alert">Pick two different places.</p>}

      <p className="book__distance">{km} km trip</p>

      <div className="ride-types" role="radiogroup" aria-label="Ride type">
        {RIDE_TYPES.map((t) => {
          const est = estimateFare(km, t.id)
          const selected = rideType === t.id
          return (
            <button
              key={t.id}
              role="radio"
              aria-checked={selected}
              className={selected ? 'ride-type ride-type--on' : 'ride-type'}
              onClick={() => setRideType(t.id)}
            >
              <span className="ride-type__emoji" aria-hidden="true">{t.emoji}</span>
              <span className="ride-type__body">
                <span className="ride-type__label">{t.label}</span>
                <span className="ride-type__eta">{est.tripMins} min</span>
              </span>
              <span className="ride-type__fare">{formatIDR(est.fare)}</span>
            </button>
          )
        })}
      </div>

      <button
        className="btn btn--primary btn--block"
        disabled={samePlace}
        onClick={() => onRequest(buildDetails(rideType))}
      >
        Request {RIDE_TYPES.find((t) => t.id === rideType)!.label} · {formatIDR(estimateFare(km, rideType).fare)}
      </button>
    </section>
  )
}
