import { useState } from 'react'
import type { Role } from '@rst/core'
import { LANGUAGES } from '../lib/languages'

interface RoleSelectProps {
  onChoose: (role: Role, lang: string) => void
}

export function RoleSelect({ onChoose }: RoleSelectProps) {
  const [lang, setLang] = useState('en')

  return (
    <section aria-labelledby="role-heading" className="screen role-select">
      <p className="brand">RideLingo</p>
      <h1 id="role-heading" className="role-select__title">Ride anywhere.<br /><em>Speak anything.</em></h1>
      <p className="role-select__sub">Get matched instantly, then talk to your driver across languages — live.</p>

      <label className="field lang-field">
        <span className="field__label">You speak</span>
        <select value={lang} onChange={(e) => setLang(e.target.value)}>
          {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
        </select>
      </label>

      <div className="role-grid">
        <button className="role-card role-card--rider" onClick={() => onChoose('rider', lang)}>
          <span className="role-card__emoji" aria-hidden="true">🧍</span>
          <span className="role-card__text">
            <span className="role-card__label">I'm a Rider</span>
            <span className="role-card__hint">Request a ride</span>
          </span>
          <span className="role-card__arrow" aria-hidden="true">→</span>
        </button>
        <button className="role-card role-card--driver" onClick={() => onChoose('driver', lang)}>
          <span className="role-card__emoji" aria-hidden="true">🚗</span>
          <span className="role-card__text">
            <span className="role-card__label">I'm a Driver</span>
            <span className="role-card__hint">Go online</span>
          </span>
          <span className="role-card__arrow" aria-hidden="true">→</span>
        </button>
      </div>
    </section>
  )
}
