import { describe, it, expect } from 'vitest'
import { CurrencyTransform } from './currency-transform'
import { MockRateProvider } from '../providers/rate-provider'

const ctx = { recipient: { role: 'rider' as const, language: 'en' } }

describe('CurrencyTransform', () => {
  const transform = new CurrencyTransform(new MockRateProvider())

  it('annotates "Rp50.000" with a USD conversion', async () => {
    const out = await transform.apply('berhenti, Rp50.000', ctx)
    expect(out).toBe('berhenti, Rp50.000 (~$3.11 USD)')
  })

  it('annotates "50000 rupiah" phrasing', async () => {
    const out = await transform.apply('it costs 50000 rupiah', ctx)
    expect(out).toBe('it costs 50000 rupiah (~$3.11 USD)')
  })

  it('handles translation-reformatted "Rp. 50,000"', async () => {
    const out = await transform.apply('stop here Rp. 50,000', ctx)
    expect(out).toBe('stop here Rp. 50,000 (~$3.11 USD)')
  })

  it('leaves text without money untouched', async () => {
    const out = await transform.apply('turn left here', ctx)
    expect(out).toBe('turn left here')
  })

  it('passes through unchanged when the rate is unknown', async () => {
    const empty = new CurrencyTransform({ rateToUsd: async () => undefined })
    const out = await empty.apply('Rp50.000', ctx)
    expect(out).toBe('Rp50.000')
  })
})
