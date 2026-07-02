import type { Role } from '@rst/core'

interface RequestingProps {
  role: Role
  onCancel: () => void
}

export function Requesting({ role, onCancel }: RequestingProps) {
  const title = role === 'rider' ? 'Finding your driver' : 'Waiting for a ride request'
  const sub = role === 'rider'
    ? 'Matching you with a nearby driver…'
    : 'You are online. Hang tight for a rider…'

  return (
    <section aria-labelledby="req-heading" className="screen requesting">
      <div className="radar" aria-hidden="true">
        <span className="radar__ping" />
        <span className="radar__ping radar__ping--2" />
        <span className="radar__dot">{role === 'rider' ? '🧍' : '🚗'}</span>
      </div>
      <h1 id="req-heading" className="requesting__title">{title}</h1>
      <p className="requesting__sub" role="status">{sub}</p>
      <button className="btn btn--ghost" onClick={onCancel}>Cancel</button>
    </section>
  )
}
