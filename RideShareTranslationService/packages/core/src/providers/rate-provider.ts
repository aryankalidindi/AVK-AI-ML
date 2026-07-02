export interface RateProvider {
  /** Units of `from` currency per 1 unit of `to` currency. */
  rateToUsd(from: string): Promise<number | undefined>
}

/** Static demo rates: how many of X equal 1 USD. */
const USD_RATES: Record<string, number> = {
  IDR: 16100, // ~1 USD = 16,100 IDR
}

export class MockRateProvider implements RateProvider {
  async rateToUsd(from: string): Promise<number | undefined> {
    return USD_RATES[from.toUpperCase()]
  }
}
