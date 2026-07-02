import { useRide } from './transport/useRide'
import { RoleSelect } from './components/RoleSelect'
import { Book } from './components/Book'
import { Requesting } from './components/Requesting'
import { DriverOnline } from './components/DriverOnline'
import { Ride } from './components/Ride'
import { Receipt } from './components/Receipt'
import './components/rideshare.css'

export function App() {
  const r = useRide()

  const content = () => {
    if (r.state === 'completed' && r.ride) return <Receipt ride={r.ride} onDone={r.reset} />

    if (r.state === 'cancelled' || r.state === 'ended') {
      return (
        <section className="screen ended">
          <div className="radar" aria-hidden="true"><span className="radar__dot">🚫</span></div>
          <h1 className="requesting__title">{r.state === 'cancelled' ? 'Ride cancelled' : 'Ride ended'}</h1>
          <p className="requesting__sub">
            {r.state === 'ended' ? 'Your co-rider left the trip.' : 'The ride was cancelled.'}
          </p>
          <button className="btn btn--primary" onClick={r.reset}>Back to start</button>
        </section>
      )
    }

    if (r.state === 'in-ride' && r.ride) {
      return <Ride ride={r.ride} messages={r.messages} lang={r.lang} onSend={r.sendChat} onAdvance={r.advance} onCancel={r.cancel} />
    }

    if (r.role === 'driver' && (r.state === 'online' || r.state === 'offered')) {
      return <DriverOnline offer={r.offer} onAccept={r.accept} onDecline={r.decline} onGoOffline={r.reset} />
    }

    if (r.role === 'rider' && r.state === 'searching') {
      return <Requesting role="rider" onCancel={r.reset} />
    }

    if (r.role === 'rider' && r.state === 'booking') {
      return <Book onRequest={r.requestRide} onBack={r.reset} />
    }

    return <RoleSelect onChoose={r.chooseRole} />
  }

  return <main>{content()}</main>
}
