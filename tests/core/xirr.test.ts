import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  computeXIRR,
  computeOverallXIRR,
  validateCashFlows,
  evaluateNPV,
} from '../../src/core/xirr'
import type { CashFlow, CashFlowSeries, PortfolioResult } from '../../src/core/types'
import { XIRRInsufficientDataError, XIRRConvergenceError } from '../../src/core/types'

function cf(dateStr: string, amount: number): CashFlow {
  return { date: new Date(dateStr), amount }
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base)
  d.setDate(d.getDate() + days)
  return d
}

const dateArb = fc
  .integer({ min: 0, max: 3650 })
  .map((offset) => addDays(new Date('2015-01-01'), offset))

function makePortfolio(series: CashFlowSeries): PortfolioResult {
  return {
    cashFlowSeries: series,
    xirrResult: {
      schemeId: series.schemeId,
      schemeName: series.schemeId,
      totalInvested: 0,
      currentValue: 0,
      gainLoss: 0,
      xirr: null,
      xirrError: null,
    },
  }
}

// Feature: xirr-investment-dashboard, Property 2: XIRR numerical correctness
describe('computeXIRR — Property 2: XIRR numerical correctness', () => {
  it('|NPV(computeXIRR(series))| < 1e-4 for any valid cash flow series', () => {
    const validSeriesArb = fc
      .tuple(
        fc.record({
          date: dateArb,
          amount: fc.double({ min: -1_000_000, max: -100, noNaN: true, noDefaultInfinity: true }),
        }),
        fc.record({
          date: dateArb,
          amount: fc.double({ min: 100, max: 2_000_000, noNaN: true, noDefaultInfinity: true }),
        }),
        fc.array(
          fc.record({
            date: dateArb,
            amount: fc.double({
              min: -500_000,
              max: 500_000,
              noNaN: true,
              noDefaultInfinity: true,
            }),
          }),
          { minLength: 0, maxLength: 8 },
        ),
      )
      .map(([neg, pos, extras]) =>
        [neg, pos, ...extras].sort((a, b) => a.date.getTime() - b.date.getTime()),
      )

    fc.assert(
      fc.property(validSeriesArb, (cashFlows) => {
        let rate: number
        try {
          rate = computeXIRR(cashFlows)
        } catch (e) {
          if (e instanceof XIRRConvergenceError) return true
          throw e
        }
        return Math.abs(evaluateNPV(cashFlows, rate)) < 1e-4
      }),
      { numRuns: 100 },
    )
  })
})

// Feature: xirr-investment-dashboard, Property 3: XIRR insufficient data rejection
describe('computeXIRR — Property 3: XIRR insufficient data rejection', () => {
  it('throws XIRRInsufficientDataError for all-positive series', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            date: dateArb,
            amount: fc.double({ min: 0.01, max: 1_000_000, noNaN: true, noDefaultInfinity: true }),
          }),
          { minLength: 2, maxLength: 10 },
        ),
        (cashFlows) => {
          expect(() => computeXIRR(cashFlows)).toThrow(XIRRInsufficientDataError)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('throws XIRRInsufficientDataError for all-negative series', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            date: dateArb,
            amount: fc.double({
              min: -1_000_000,
              max: -0.01,
              noNaN: true,
              noDefaultInfinity: true,
            }),
          }),
          { minLength: 2, maxLength: 10 },
        ),
        (cashFlows) => {
          expect(() => computeXIRR(cashFlows)).toThrow(XIRRInsufficientDataError)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('throws XIRRInsufficientDataError for a single-flow series', () => {
    fc.assert(
      fc.property(
        fc.record({
          date: dateArb,
          amount: fc.double({ noNaN: true, noDefaultInfinity: true }),
        }),
        (singleFlow) => {
          expect(() => computeXIRR([singleFlow])).toThrow(XIRRInsufficientDataError)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('throws XIRRInsufficientDataError for an empty series', () => {
    expect(() => computeXIRR([])).toThrow(XIRRInsufficientDataError)
  })
})

// Feature: xirr-investment-dashboard, Property 4: Overall XIRR equals merged series XIRR
describe('computeOverallXIRR — Property 4: Overall XIRR equals merged series XIRR', () => {
  it('computeOverallXIRR equals computeXIRR on the manually merged and sorted series', () => {
    const seriesArb = fc
      .tuple(
        fc.nat(),
        fc.record({ date: dateArb, amount: fc.constant(-10000) }),
        fc.record({
          date: dateArb,
          amount: fc.double({ min: 5000, max: 20000, noNaN: true, noDefaultInfinity: true }),
        }),
        fc.array(
          fc.record({
            date: dateArb,
            amount: fc.double({ min: -5000, max: 5000, noNaN: true, noDefaultInfinity: true }),
          }),
          { minLength: 0, maxLength: 5 },
        ),
      )
      .map(
        ([id, neg, pos, extras]): CashFlowSeries => ({
          schemeId: `scheme-${id}`,
          cashFlows: [neg, pos, ...extras].sort((a, b) => a.date.getTime() - b.date.getTime()),
        }),
      )

    const portfoliosArb = fc
      .array(seriesArb, { minLength: 1, maxLength: 4 })
      .map((seriesArr: CashFlowSeries[]) => seriesArr.map(makePortfolio))

    fc.assert(
      fc.property(portfoliosArb, (portfolios) => {
        const merged: CashFlow[] = portfolios
          .flatMap((p) => p.cashFlowSeries.cashFlows)
          .sort((a, b) => a.date.getTime() - b.date.getTime())

        let expected: number
        let actual: number
        try {
          expected = computeXIRR(merged)
          actual = computeOverallXIRR(portfolios)
        } catch (e) {
          if (e instanceof XIRRConvergenceError || e instanceof XIRRInsufficientDataError) {
            return true
          }
          throw e
        }

        return Math.abs(expected - actual) < 1e-9
      }),
      { numRuns: 100 },
    )
  })
})

describe('computeXIRR — known reference values', () => {
  it('Series 1: single-year lump sum ~10% return', () => {
    // Invest 10,000 on 2020-01-01, receive 11,000 on 2021-01-01
    // 365/365.25 days → rate is slightly below 10%
    const cashFlows: CashFlow[] = [cf('2020-01-01', -10000), cf('2021-01-01', 11000)]
    expect(computeXIRR(cashFlows)).toBeCloseTo(0.09973, 3)
  })

  it('Series 2: monthly SIP with positive return', () => {
    // 12 monthly purchases of 1,000; terminal value 13,500 on 2021-01-01
    // Annualised XIRR is higher than simple return because average holding period is ~6 months
    const cashFlows: CashFlow[] = [
      cf('2020-01-01', -1000),
      cf('2020-02-01', -1000),
      cf('2020-03-01', -1000),
      cf('2020-04-01', -1000),
      cf('2020-05-01', -1000),
      cf('2020-06-01', -1000),
      cf('2020-07-01', -1000),
      cf('2020-08-01', -1000),
      cf('2020-09-01', -1000),
      cf('2020-10-01', -1000),
      cf('2020-11-01', -1000),
      cf('2020-12-01', -1000),
      cf('2021-01-01', 13500),
    ]
    const rate = computeXIRR(cashFlows)
    expect(rate).toBeGreaterThan(0.2)
    expect(rate).toBeLessThan(0.28)
  })

  it('Series 3: two-year investment with negative return', () => {
    // Invest 10,000 on 2020-01-01, receive 8,000 on 2022-01-01 → ~-10.56%
    const cashFlows: CashFlow[] = [cf('2020-01-01', -10000), cf('2022-01-01', 8000)]
    const rate = computeXIRR(cashFlows)
    expect(rate).toBeLessThan(0)
    expect(rate).toBeCloseTo(-0.1056, 2)
  })

  it('Series 4: multiple purchases with partial redemption', () => {
    const cashFlows: CashFlow[] = [
      cf('2019-01-01', -5000),
      cf('2020-01-01', -5000),
      cf('2020-07-01', 3000),
      cf('2021-01-01', 9500),
    ]
    const rate = computeXIRR(cashFlows)
    expect(rate).toBeGreaterThan(0)
    expect(Math.abs(evaluateNPV(cashFlows, rate))).toBeLessThan(1e-4)
  })

  it('Series 5: 3-year monthly SIP', () => {
    const startDate = new Date('2018-01-01')
    const cashFlows: CashFlow[] = Array.from({ length: 36 }, (_, i) => ({
      date: addDays(startDate, i * 30),
      amount: -500,
    }))
    cashFlows.push({ date: new Date('2021-01-01'), amount: 22000 })
    const rate = computeXIRR(cashFlows)
    expect(rate).toBeGreaterThan(0)
    expect(Math.abs(evaluateNPV(cashFlows, rate))).toBeLessThan(1e-4)
  })
})

describe('validateCashFlows', () => {
  it('throws for empty array', () => {
    expect(() => validateCashFlows([])).toThrow(XIRRInsufficientDataError)
  })

  it('throws for single-element array', () => {
    expect(() => validateCashFlows([cf('2020-01-01', -1000)])).toThrow(XIRRInsufficientDataError)
  })

  it('throws when all flows are negative', () => {
    expect(() => validateCashFlows([cf('2020-01-01', -1000), cf('2020-06-01', -500)])).toThrow(
      XIRRInsufficientDataError,
    )
  })

  it('throws when all flows are positive', () => {
    expect(() => validateCashFlows([cf('2020-01-01', 1000), cf('2020-06-01', 500)])).toThrow(
      XIRRInsufficientDataError,
    )
  })

  it('does not throw for a valid series', () => {
    expect(() => validateCashFlows([cf('2020-01-01', -1000), cf('2021-01-01', 1100)])).not.toThrow()
  })

  it('throws when all flows are zero', () => {
    expect(() => validateCashFlows([cf('2020-01-01', 0), cf('2021-01-01', 0)])).toThrow(
      XIRRInsufficientDataError,
    )
  })
})

describe('computeOverallXIRR', () => {
  it('produces the same result as computeXIRR on the merged series', () => {
    const series1: CashFlowSeries = {
      schemeId: 'fund-a',
      cashFlows: [cf('2020-01-01', -5000), cf('2021-01-01', 5800)],
    }
    const series2: CashFlowSeries = {
      schemeId: 'fund-b',
      cashFlows: [cf('2020-06-01', -3000), cf('2021-01-01', 3300)],
    }
    const portfolios = [series1, series2].map(makePortfolio)
    const merged: CashFlow[] = [...series1.cashFlows, ...series2.cashFlows].sort(
      (a, b) => a.date.getTime() - b.date.getTime(),
    )
    expect(computeOverallXIRR(portfolios)).toBeCloseTo(computeXIRR(merged), 8)
  })

  it('throws XIRRInsufficientDataError when merged series has no negative flows', () => {
    const series: CashFlowSeries = {
      schemeId: 'fund-a',
      cashFlows: [cf('2020-01-01', 1000), cf('2021-01-01', 2000)],
    }
    expect(() => computeOverallXIRR([makePortfolio(series)])).toThrow(XIRRInsufficientDataError)
  })
})
