import type { RateProvider } from '@rst/core'

// open.er-api.com: free, keyless FX rates. latest/USD → rates.IDR is IDR-per-USD,
// which is exactly what CurrencyTransform expects from rateToUsd().
const ENDPOINT = 'https://open.er-api.com/v6/latest/USD'
const FALLBACK_IDR_PER_USD = 16100

export class FxRateProvider implements RateProvider {
  private cache = new Map<string, number>()
  private inflight: Promise<Record<string, number> | null> | null = null

  async rateToUsd(from: string): Promise<number | undefined> {
    const cur = from.toUpperCase()
    const cached = this.cache.get(cur)
    if (cached !== undefined) return cached

    const rates = await this.fetchRates()
    const rate = rates?.[cur]
    if (typeof rate === 'number' && rate > 0) {
      this.cache.set(cur, rate)
      return rate
    }
    if (cur === 'IDR') {
      this.cache.set(cur, FALLBACK_IDR_PER_USD)
      return FALLBACK_IDR_PER_USD
    }
    return undefined
  }

  private fetchRates(): Promise<Record<string, number> | null> {
    if (!this.inflight) {
      this.inflight = fetch(ENDPOINT)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { rates?: Record<string, number> } | null) => d?.rates ?? null)
        .catch(() => null)
    }
    return this.inflight
  }
}
