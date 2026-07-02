import { describe, it, expect } from 'vitest'
import { glossaryPairs, enforceGlossary } from './glossary'

describe('glossaryPairs', () => {
  it('returns source→target term pairs for a direction', () => {
    const pairs = glossaryPairs('en', 'id')
    expect(pairs).toContainEqual({ from: 'pickup point', to: 'titik jemput' })
  })

  it('omits pairs where source and target term are identical (verbatim place names)', () => {
    const pairs = glossaryPairs('en', 'id')
    expect(pairs.find((p) => p.from === 'Ubud')).toBeUndefined()
  })

  it('returns nothing when languages match', () => {
    expect(glossaryPairs('en', 'en')).toEqual([])
  })
})

describe('enforceGlossary', () => {
  it('replaces a lingering source term with the canonical target term', () => {
    const pairs = glossaryPairs('en', 'id')
    const out = enforceGlossary('please wait at the pickup point', pairs)
    expect(out).toBe('please wait at the titik jemput')
  })

  it('is case-insensitive', () => {
    const pairs = glossaryPairs('en', 'id')
    expect(enforceGlossary('The Pickup Point', pairs)).toBe('The titik jemput')
  })

  it('leaves text without glossary terms unchanged', () => {
    const pairs = glossaryPairs('en', 'id')
    expect(enforceGlossary('turn left here', pairs)).toBe('turn left here')
  })

  it('prefers the longest matching term', () => {
    const pairs = [
      { from: 'drop', to: 'X' },
      { from: 'drop-off', to: 'titik turun' },
    ]
    expect(enforceGlossary('the drop-off', pairs)).toBe('the titik turun')
  })
})
