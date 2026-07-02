import type { RateProvider } from '../providers/rate-provider'
import type { PipelineContext, Transform } from './types'

/**
 * Detects Indonesian Rupiah amounts and appends a USD estimate. Handles the
 * common variants, including how translation engines reformat them:
 * "Rp50.000", "Rp 50.000", "Rp. 50,000", "IDR 50000", "50000 rupiah".
 */
const RP_PREFIX = /(?:Rp|IDR)\.?\s*(\d[\d.,]*)/gi
const RP_SUFFIX = /(\d[\d.,]*)\s?rupiah/gi

export class CurrencyTransform implements Transform {
  private readonly rates: RateProvider

  constructor(rates: RateProvider) {
    this.rates = rates
  }

  async apply(text: string, _ctx: PipelineContext): Promise<string> {
    const amounts = this.extractAmounts(text)
    if (amounts.length === 0) return text

    const rate = await this.rates.rateToUsd('IDR')
    if (rate === undefined) return text

    let result = text
    for (const { raw, value } of amounts) {
      const usd = (value / rate).toFixed(2)
      result = result.replace(raw, `${raw} (~$${usd} USD)`)
    }
    return result
  }

  private extractAmounts(text: string): Array<{ raw: string; value: number }> {
    const found: Array<{ raw: string; value: number }> = []
    for (const re of [RP_PREFIX, RP_SUFFIX]) {
      re.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = re.exec(text)) !== null) {
        const raw = m[0]
        const group = m[1]
        if (group === undefined) continue
        const value = Number(group.replace(/[.,]/g, ''))
        if (Number.isFinite(value) && value > 0) found.push({ raw, value })
      }
    }
    return found
  }
}
