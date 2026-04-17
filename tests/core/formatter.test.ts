import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { formatINR, formatPct, formatGainLoss } from '../../src/core/formatter'

function stripAndParse(formatted: string): number {
  return parseFloat(formatted.replace(/₹/g, '').replace(/,/g, '').trim())
}

describe('formatINR', () => {
  it('INR formatting round-trip — format-strip-parse is idempotent', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1e12, noNaN: true, noDefaultInfinity: true }), (n) => {
        const once = stripAndParse(formatINR(n))
        const twice = stripAndParse(formatINR(once))
        return once === twice
      }),
      { numRuns: 100 },
    )
  })

  it('formats zero as ₹0.00', () => {
    expect(formatINR(0)).toBe('₹0.00')
  })

  it('formats a lakh-scale amount with Indian grouping', () => {
    expect(formatINR(123456.78)).toBe('₹1,23,456.78')
  })

  it('formats a crore-scale amount', () => {
    expect(formatINR(10000000)).toBe('₹1,00,00,000.00')
  })

  it('formats a negative amount with leading minus', () => {
    expect(formatINR(-1234.56)).toBe('-₹1,234.56')
  })

  it('formats amounts below ₹1,000 without grouping commas', () => {
    expect(formatINR(999.99)).toBe('₹999.99')
  })
})

describe('formatPct', () => {
  it('XIRR percentage format — output must match /^-?\\d+\\.\\d{2}%$/', () => {
    fc.assert(
      fc.property(
        fc.double({ noNaN: true, noDefaultInfinity: true, min: -100, max: 100 }),
        (rate) => /^-?\d+\.\d{2}%$/.test(formatPct(rate)),
      ),
      { numRuns: 100 },
    )
  })

  it('formats a positive rate correctly', () => {
    expect(formatPct(0.1432)).toBe('14.32%')
  })

  it('formats a negative rate correctly', () => {
    expect(formatPct(-0.05)).toBe('-5.00%')
  })

  it('formats zero as 0.00%', () => {
    expect(formatPct(0)).toBe('0.00%')
  })

  it('formats negative zero as 0.00% (not -0.00%)', () => {
    expect(formatPct(-0)).toBe('0.00%')
  })

  it('formats a whole-number percentage with two decimal places', () => {
    expect(formatPct(0.1)).toBe('10.00%')
  })

  it('formats a rate above 100% correctly', () => {
    expect(formatPct(1.5)).toBe('150.00%')
  })
})

describe('formatGainLoss', () => {
  it('prefixes + for positive amounts', () => {
    expect(formatGainLoss(23456.78)).toBe('+₹23,456.78')
  })

  it('does not prefix + for zero', () => {
    expect(formatGainLoss(0)).toBe('₹0.00')
  })

  it('normalises negative zero to ₹0.00 (not -₹0.00)', () => {
    expect(formatGainLoss(-0)).toBe('₹0.00')
  })

  it('formats negative amounts without + prefix', () => {
    expect(formatGainLoss(-1234.0)).toBe('-₹1,234.00')
  })

  it('formats a lakh-scale positive gain', () => {
    expect(formatGainLoss(100000)).toBe('+₹1,00,000.00')
  })

  it('formats a lakh-scale negative loss', () => {
    expect(formatGainLoss(-100000)).toBe('-₹1,00,000.00')
  })

  it('handles small positive amounts (sub-rupee)', () => {
    expect(formatGainLoss(0.01)).toBe('+₹0.01')
  })

  it('handles small negative amounts (sub-rupee)', () => {
    expect(formatGainLoss(-0.01)).toBe('-₹0.01')
  })
})
