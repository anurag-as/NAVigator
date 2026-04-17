import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  normaliseDate,
  normaliseAmount,
  classifyTransaction,
  buildCashFlowSeries,
  parseCASStatement,
} from '../../src/pdf/parser'
import type { Scheme } from '../../src/core/types'
import { TransactionType } from '../../src/core/types'
import type { RawPage } from '../../src/pdf/pdf-engine'

const MONTH_ABBREVS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

function makeScheme(overrides: Partial<Scheme> = {}): Scheme {
  return {
    name: 'Test Fund Direct Growth',
    isin: 'INF123456789',
    folio: '12345678',
    amc: 'Test AMC',
    transactions: [],
    valuationDate: '2023-12-31',
    valuationNAV: 50.0,
    valuationValue: 10000,
    closingUnits: 200,
    totalCostValue: 0,
    ...overrides,
  }
}

function makeTx(type: TransactionType, amount: number, date = '2022-01-01') {
  return { date, description: 'tx', amount, units: 10, nav: 45.0, type }
}

function buildSyntheticCAS(
  transactions: Array<{
    date: string
    description: string
    amount: number
    units: number
    nav: number
  }>,
): RawPage[] {
  const lines: string[] = [
    'Consolidated Account Statement',
    '01-Jan-2020 to 31-Dec-2023',
    'Dear Test Investor',
    '',
    'Folio No: 12345678 / Test AMC',
    'Test AMC Limited',
    '',
    'Test Fund Direct Growth',
    'ISIN: INF123456789 Advisor: Direct RTA: CAMS',
    'Date        Description                    Amount    Units    NAV    Balance',
    '---------------------------------------------------------------------------',
  ]

  for (const tx of transactions) {
    const amtStr = tx.amount < 0 ? `(${Math.abs(tx.amount).toFixed(2)})` : tx.amount.toFixed(2)
    lines.push(
      `${tx.date}  ${tx.description}  ${amtStr}  ${tx.units.toFixed(3)}  ${tx.nav.toFixed(4)}  ${(tx.units * tx.nav).toFixed(3)}`,
    )
  }

  lines.push('')
  lines.push('Valuation on 31-Dec-2023 : ₹50,000.00 (1000.000 Units @ NAV ₹50.0000)')
  lines.push('Closing Unit Balance: 1000.000')

  return [{ pageNumber: 1, lines }]
}

// Feature: xirr-investment-dashboard, Property 1: Cash flow sign convention
describe('buildCashFlowSeries — Property 1: Cash flow sign convention', () => {
  const amtArb = fc.double({ min: 100, max: 100_000, noNaN: true, noDefaultInfinity: true })
  const valuationArb = fc.double({ min: 1_000, max: 500_000, noNaN: true, noDefaultInfinity: true })

  it('negative transaction types produce negative cash flows', () => {
    const negativeTypes = [
      TransactionType.PURCHASE,
      TransactionType.PURCHASE_SIP,
      TransactionType.SWITCH_OUT,
      TransactionType.STAMP_DUTY_TAX,
      TransactionType.TDS_TAX,
      TransactionType.STT_TAX,
    ]
    fc.assert(
      fc.property(fc.constantFrom(...negativeTypes), amtArb, valuationArb, (txType, amt, val) => {
        const series = buildCashFlowSeries(
          makeScheme({ transactions: [makeTx(txType, amt, '2022-01-01')], valuationValue: val }),
        )
        const nonTerminal = series.cashFlows.filter(
          (cf) => cf.date.getTime() !== new Date('2023-12-31').getTime(),
        )
        return nonTerminal.every((cf) => cf.amount < 0)
      }),
      { numRuns: 100 },
    )
  })

  it('positive transaction types produce positive cash flows', () => {
    const positiveTypes = [
      TransactionType.REDEMPTION,
      TransactionType.SWITCH_IN,
      TransactionType.DIVIDEND_PAYOUT,
    ]
    fc.assert(
      fc.property(fc.constantFrom(...positiveTypes), amtArb, valuationArb, (txType, amt, val) => {
        const series = buildCashFlowSeries(
          makeScheme({
            transactions: [
              makeTx(TransactionType.PURCHASE, 10000, '2021-01-01'),
              makeTx(txType, amt, '2022-01-01'),
            ],
            valuationValue: val,
          }),
        )
        const targetFlow = series.cashFlows.find(
          (cf) => cf.date.getTime() === new Date('2022-01-01').getTime(),
        )
        return targetFlow !== undefined && targetFlow.amount > 0
      }),
      { numRuns: 100 },
    )
  })

  it('excluded transaction types produce no cash flows', () => {
    const excludedTypes = [TransactionType.DIVIDEND_REINVESTMENT, TransactionType.MISC]
    fc.assert(
      fc.property(fc.constantFrom(...excludedTypes), amtArb, valuationArb, (txType, amt, val) => {
        const series = buildCashFlowSeries(
          makeScheme({
            transactions: [
              makeTx(TransactionType.PURCHASE, 10000, '2021-01-01'),
              makeTx(txType, amt, '2022-06-01'),
            ],
            valuationValue: val,
          }),
        )
        return series.cashFlows.length === 2
      }),
      { numRuns: 100 },
    )
  })

  it('terminal valuation is always a positive cash flow', () => {
    fc.assert(
      fc.property(valuationArb, (val) => {
        const series = buildCashFlowSeries(
          makeScheme({
            transactions: [makeTx(TransactionType.PURCHASE, 5000, '2022-01-01')],
            valuationValue: val,
            valuationDate: '2023-12-31',
          }),
        )
        const terminal = series.cashFlows[series.cashFlows.length - 1]
        return terminal.amount > 0 && terminal.date.getTime() === new Date('2023-12-31').getTime()
      }),
      { numRuns: 100 },
    )
  })

  it('redemption and dividend payout produce positive cash flows', () => {
    const scheme = makeScheme({
      transactions: [
        makeTx(TransactionType.PURCHASE, 10000, '2021-01-01'),
        makeTx(TransactionType.REDEMPTION, 4000, '2022-01-01'),
        makeTx(TransactionType.DIVIDEND_PAYOUT, 500, '2022-06-01'),
      ],
      valuationValue: 8000,
      valuationDate: '2023-01-01',
    })
    const series = buildCashFlowSeries(scheme)
    expect(
      series.cashFlows.find((cf) => cf.date.getTime() === new Date('2022-01-01').getTime())?.amount,
    ).toBeGreaterThan(0)
    expect(
      series.cashFlows.find((cf) => cf.date.getTime() === new Date('2022-06-01').getTime())?.amount,
    ).toBeGreaterThan(0)
  })

  it('dividend reinvestment is excluded', () => {
    const series = buildCashFlowSeries(
      makeScheme({
        transactions: [
          makeTx(TransactionType.PURCHASE, 10000, '2021-01-01'),
          makeTx(TransactionType.DIVIDEND_REINVESTMENT, 500, '2022-01-01'),
        ],
        valuationValue: 12000,
        valuationDate: '2023-01-01',
      }),
    )
    expect(series.cashFlows).toHaveLength(2)
    expect(series.cashFlows[0].amount).toBeLessThan(0)
    expect(series.cashFlows[1].amount).toBeGreaterThan(0)
  })

  it('switch-out is negative, switch-in is positive', () => {
    const series = buildCashFlowSeries(
      makeScheme({
        transactions: [
          makeTx(TransactionType.SWITCH_OUT, 3000, '2022-01-01'),
          makeTx(TransactionType.SWITCH_IN, 3000, '2022-01-02'),
        ],
        valuationValue: 3500,
        valuationDate: '2023-01-01',
      }),
    )
    expect(
      series.cashFlows.find((cf) => cf.date.getTime() === new Date('2022-01-01').getTime())?.amount,
    ).toBeLessThan(0)
    expect(
      series.cashFlows.find((cf) => cf.date.getTime() === new Date('2022-01-02').getTime())?.amount,
    ).toBeGreaterThan(0)
  })

  it('cash flows are sorted ascending by date', () => {
    const series = buildCashFlowSeries(
      makeScheme({
        transactions: [
          makeTx(TransactionType.PURCHASE, 1000, '2022-06-01'),
          makeTx(TransactionType.PURCHASE_SIP, 1000, '2022-01-01'),
          makeTx(TransactionType.REDEMPTION, 500, '2022-09-01'),
        ],
        valuationValue: 3000,
        valuationDate: '2023-01-01',
      }),
    )
    for (let i = 1; i < series.cashFlows.length; i++) {
      expect(series.cashFlows[i].date.getTime()).toBeGreaterThanOrEqual(
        series.cashFlows[i - 1].date.getTime(),
      )
    }
  })
})

// Feature: xirr-investment-dashboard, Property 8: Date normalisation round-trip
describe('normaliseDate — Property 8: Date normalisation round-trip', () => {
  it('reconstructs the same calendar date for any valid DD-MMM-YYYY input', () => {
    const dateArb = fc
      .record({
        year: fc.integer({ min: 2000, max: 2030 }),
        monthIdx: fc.integer({ min: 0, max: 11 }),
        day: fc.integer({ min: 1, max: 28 }),
      })
      .map(({ year, monthIdx, day }) => ({
        input: `${String(day).padStart(2, '0')}-${MONTH_ABBREVS[monthIdx]}-${year}`,
        year,
        monthIdx,
        day,
      }))

    fc.assert(
      fc.property(dateArb, ({ input, year, monthIdx, day }) => {
        const parsed = new Date(normaliseDate(input) + 'T00:00:00Z')
        return (
          parsed.getUTCFullYear() === year &&
          parsed.getUTCMonth() === monthIdx &&
          parsed.getUTCDate() === day
        )
      }),
      { numRuns: 100 },
    )
  })

  it('converts all 12 months correctly', () => {
    const cases = [
      ['01-Jan-2023', '2023-01-01'],
      ['01-Feb-2023', '2023-02-01'],
      ['01-Mar-2023', '2023-03-01'],
      ['01-Apr-2023', '2023-04-01'],
      ['01-May-2023', '2023-05-01'],
      ['01-Jun-2023', '2023-06-01'],
      ['01-Jul-2023', '2023-07-01'],
      ['01-Aug-2023', '2023-08-01'],
      ['01-Sep-2023', '2023-09-01'],
      ['01-Oct-2023', '2023-10-01'],
      ['01-Nov-2023', '2023-11-01'],
      ['01-Dec-2023', '2023-12-01'],
    ]
    for (const [input, expected] of cases) {
      expect(normaliseDate(input)).toBe(expected)
    }
  })

  it('throws for invalid formats', () => {
    expect(() => normaliseDate('2023-01-15')).toThrow()
    expect(() => normaliseDate('15/01/2023')).toThrow()
    expect(() => normaliseDate('')).toThrow()
    expect(() => normaliseDate('15-Xyz-2023')).toThrow()
  })
})

// Feature: xirr-investment-dashboard, Property 9: Parser extracts all transactions
describe('parseCASStatement — Property 9: Parser extracts all transactions', () => {
  it('extracts exactly N transactions for a synthetic CAS block', () => {
    const txArb = fc.array(
      fc.record({
        dateOffset: fc.integer({ min: 0, max: 1000 }),
        description: fc.constantFrom(
          'Purchase',
          'Purchase - SIP',
          'Redemption',
          'Dividend Payout',
          'Switch In',
          'Switch Out',
        ),
        amount: fc.double({ min: 100, max: 50_000, noNaN: true, noDefaultInfinity: true }),
        units: fc.double({ min: 1, max: 1000, noNaN: true, noDefaultInfinity: true }),
        nav: fc.double({ min: 10, max: 200, noNaN: true, noDefaultInfinity: true }),
      }),
      { minLength: 1, maxLength: 10 },
    )

    fc.assert(
      fc.property(txArb, (rawTxs) => {
        const baseDate = new Date('2020-01-01')
        const transactions = rawTxs.map((tx) => {
          const d = new Date(baseDate)
          d.setDate(d.getDate() + tx.dateOffset)
          const dd = String(d.getDate()).padStart(2, '0')
          return {
            date: `${dd}-${MONTH_ABBREVS[d.getMonth()]}-${d.getFullYear()}`,
            description: tx.description,
            amount: -tx.amount,
            units: tx.units,
            nav: tx.nav,
          }
        })

        const pages = buildSyntheticCAS(transactions)
        let result
        try {
          result = parseCASStatement(pages)
        } catch {
          return true
        }

        return (
          result.schemes.length > 0 && result.schemes[0].transactions.length === transactions.length
        )
      }),
      { numRuns: 50 },
    )
  })

  it('extracts correct date and type for each transaction', () => {
    const pages = buildSyntheticCAS([
      { date: '15-Jan-2021', description: 'Purchase', amount: -5000, units: 100, nav: 50 },
      { date: '15-Feb-2021', description: 'Purchase - SIP', amount: -1000, units: 20, nav: 50 },
      { date: '15-Jun-2021', description: 'Redemption', amount: 2000, units: 40, nav: 50 },
    ])

    const { schemes } = parseCASStatement(pages)
    expect(schemes).toHaveLength(1)
    const txs = schemes[0].transactions
    expect(txs).toHaveLength(3)
    expect(txs[0]).toMatchObject({ date: '2021-01-15', type: TransactionType.PURCHASE })
    expect(txs[1]).toMatchObject({ date: '2021-02-15', type: TransactionType.PURCHASE_SIP })
    expect(txs[2]).toMatchObject({ date: '2021-06-15', type: TransactionType.REDEMPTION })
  })

  it('extracts statement period from header', () => {
    const pages = buildSyntheticCAS([
      { date: '15-Jan-2021', description: 'Purchase', amount: -5000, units: 100, nav: 50 },
    ])
    const { statementPeriod } = parseCASStatement(pages)
    expect(statementPeriod).toEqual({ from: '2020-01-01', to: '2023-12-31' })
  })

  it('throws ParseError when no portfolio data is found', () => {
    expect(() =>
      parseCASStatement([{ pageNumber: 1, lines: ['This is not a CAS statement'] }]),
    ).toThrow('No portfolio data could be found')
  })
})

describe('normaliseAmount', () => {
  it('parses a plain positive number', () => {
    expect(normaliseAmount('1000.00')).toBe(1000)
  })

  it('parses a comma-separated number', () => {
    expect(normaliseAmount('1,00,000.50')).toBeCloseTo(100000.5)
  })

  it('parses a parenthesised negative number', () => {
    expect(normaliseAmount('(1,000.00)')).toBe(-1000)
  })

  it('parses a ₹-prefixed number', () => {
    expect(normaliseAmount('₹1,234.56')).toBeCloseTo(1234.56)
  })

  it('parses zero', () => {
    expect(normaliseAmount('0.00')).toBe(0)
  })

  it('parses a plain integer', () => {
    expect(normaliseAmount('500')).toBe(500)
  })

  it('parses a crore-scale amount', () => {
    expect(normaliseAmount('1,00,00,000.00')).toBe(10000000)
  })

  it('strips whitespace before parsing', () => {
    expect(normaliseAmount('  1,500.00  ')).toBeCloseTo(1500)
  })
})

describe('classifyTransaction', () => {
  it('classifies purchase variants', () => {
    expect(classifyTransaction('Purchase')).toBe(TransactionType.PURCHASE)
    expect(classifyTransaction('Buy')).toBe(TransactionType.PURCHASE)
    expect(classifyTransaction('New Fund Offer')).toBe(TransactionType.PURCHASE)
    expect(classifyTransaction('NFO')).toBe(TransactionType.PURCHASE)
  })

  it('classifies SIP as PURCHASE_SIP', () => {
    expect(classifyTransaction('Purchase - SIP')).toBe(TransactionType.PURCHASE_SIP)
    expect(classifyTransaction('SIP Investment')).toBe(TransactionType.PURCHASE_SIP)
  })

  it('classifies redemption variants', () => {
    expect(classifyTransaction('Redemption')).toBe(TransactionType.REDEMPTION)
    expect(classifyTransaction('Redeem')).toBe(TransactionType.REDEMPTION)
  })

  it('classifies switch variants', () => {
    expect(classifyTransaction('Switch In')).toBe(TransactionType.SWITCH_IN)
    expect(classifyTransaction('Switch Out')).toBe(TransactionType.SWITCH_OUT)
  })

  it('classifies dividend variants', () => {
    expect(classifyTransaction('Dividend Payout')).toBe(TransactionType.DIVIDEND_PAYOUT)
    expect(classifyTransaction('Dividend Reinvestment')).toBe(TransactionType.DIVIDEND_REINVESTMENT)
    expect(classifyTransaction('Div Reinvest')).toBe(TransactionType.DIVIDEND_REINVESTMENT)
  })

  it('classifies tax variants', () => {
    expect(classifyTransaction('Stamp Duty')).toBe(TransactionType.STAMP_DUTY_TAX)
    expect(classifyTransaction('TDS')).toBe(TransactionType.TDS_TAX)
    expect(classifyTransaction('STT')).toBe(TransactionType.STT_TAX)
  })

  it('falls back to MISC for unknown descriptions', () => {
    expect(classifyTransaction('Some Unknown Transaction')).toBe(TransactionType.MISC)
    expect(classifyTransaction('')).toBe(TransactionType.MISC)
    expect(classifyTransaction('Bonus Units')).toBe(TransactionType.MISC)
  })

  it('is case-insensitive', () => {
    expect(classifyTransaction('PURCHASE')).toBe(TransactionType.PURCHASE)
    expect(classifyTransaction('redemption')).toBe(TransactionType.REDEMPTION)
    expect(classifyTransaction('DIVIDEND PAYOUT')).toBe(TransactionType.DIVIDEND_PAYOUT)
    expect(classifyTransaction('switch in')).toBe(TransactionType.SWITCH_IN)
  })

  it('prioritises PURCHASE_SIP over PURCHASE', () => {
    expect(classifyTransaction('Purchase - SIP')).toBe(TransactionType.PURCHASE_SIP)
    expect(classifyTransaction('SIP Purchase')).toBe(TransactionType.PURCHASE_SIP)
  })

  it('prioritises DIVIDEND_REINVESTMENT over DIVIDEND_PAYOUT', () => {
    expect(classifyTransaction('Dividend Reinvestment')).toBe(TransactionType.DIVIDEND_REINVESTMENT)
  })
})
