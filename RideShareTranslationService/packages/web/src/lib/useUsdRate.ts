import { useEffect, useState } from 'react'
import { fxRates } from './translation'

/** Returns IDR-per-USD once fetched (or the static fallback), else null. */
export function useUsdRate(): number | null {
  const [rate, setRate] = useState<number | null>(null)
  useEffect(() => {
    let active = true
    fxRates.rateToUsd('IDR').then((r) => {
      if (active) setRate(r ?? null)
    })
    return () => {
      active = false
    }
  }, [])
  return rate
}
