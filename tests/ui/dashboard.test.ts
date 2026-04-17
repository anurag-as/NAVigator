import { describe, it, expect, beforeEach } from 'vitest'
import * as fc from 'fast-check'
import { applyXirrClass, renderStatCards, renderPortfolioGrid } from '../../src/ui/dashboard'
import type { DashboardData, XIRRResult } from '../../src/core/types'

function makeXirrResult(overrides: Partial<XIRRResult> = {}): XIRRResult {
  return {
    schemeId: 'test-scheme',
    schemeName: 'Test Scheme',
    totalInvested: 10000,
    currentValue: 12000,
    gainLoss: 2000,
    xirr: 0.15,
    xirrError: null,
    ...overrides,
  }
}

function makeDashboardData(overrides: Partial<DashboardData> = {}): DashboardData {
  return {
    portfolios: [makeXirrResult()],
    overall: makeXirrResult({ schemeId: 'overall', schemeName: 'Overall' }),
    statementPeriod: { from: '2020-01-01', to: '2024-01-01' },
    ...overrides,
  }
}

const XIRR_CLASSES = ['xirr-positive', 'xirr-negative', 'xirr-zero'] as const

function countXirrClasses(element: Element): number {
  return XIRR_CLASSES.filter((cls) => element.classList.contains(cls)).length
}

// Feature: xirr-investment-dashboard, Property 7: XIRR indicator CSS class assignment
describe('applyXirrClass — Property 7: XIRR indicator CSS class assignment', () => {
  it('applies exactly one XIRR class for any finite XIRR value', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.double({ noNaN: true, noDefaultInfinity: true, min: -10, max: 10 }),
          fc.constant(0),
          fc.constant(null),
        ),
        (xirr) => {
          const el = document.createElement('div')
          applyXirrClass(el, xirr)

          expect(countXirrClasses(el)).toBe(1)

          if (xirr === null || xirr === 0) {
            expect(el.classList.contains('xirr-zero')).toBe(true)
          } else if (xirr > 0) {
            expect(el.classList.contains('xirr-positive')).toBe(true)
          } else {
            expect(el.classList.contains('xirr-negative')).toBe(true)
          }
        },
      ),
      { numRuns: 200 },
    )
  })

  it('replaces a pre-existing XIRR class when called again', () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.double({ noNaN: true, noDefaultInfinity: true, min: -10, max: 10 }),
          fc.double({ noNaN: true, noDefaultInfinity: true, min: -10, max: 10 }),
        ),
        ([first, second]) => {
          const el = document.createElement('div')
          applyXirrClass(el, first)
          applyXirrClass(el, second)
          expect(countXirrClasses(el)).toBe(1)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('positive XIRR → xirr-positive only', () => {
    const el = document.createElement('div')
    applyXirrClass(el, 0.15)
    expect(el.classList.contains('xirr-positive')).toBe(true)
    expect(el.classList.contains('xirr-negative')).toBe(false)
    expect(el.classList.contains('xirr-zero')).toBe(false)
  })

  it('negative XIRR → xirr-negative only', () => {
    const el = document.createElement('div')
    applyXirrClass(el, -0.05)
    expect(el.classList.contains('xirr-negative')).toBe(true)
    expect(el.classList.contains('xirr-positive')).toBe(false)
    expect(el.classList.contains('xirr-zero')).toBe(false)
  })

  it('zero XIRR → xirr-zero only', () => {
    const el = document.createElement('div')
    applyXirrClass(el, 0)
    expect(el.classList.contains('xirr-zero')).toBe(true)
    expect(el.classList.contains('xirr-positive')).toBe(false)
    expect(el.classList.contains('xirr-negative')).toBe(false)
  })

  it('null XIRR → xirr-zero only', () => {
    const el = document.createElement('div')
    applyXirrClass(el, null)
    expect(el.classList.contains('xirr-zero')).toBe(true)
    expect(el.classList.contains('xirr-positive')).toBe(false)
    expect(el.classList.contains('xirr-negative')).toBe(false)
  })
})

describe('renderStatCards', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="card-invested"><span class="stat-card__value"></span></div>
      <div id="card-current"><span class="stat-card__value"></span></div>
      <div id="card-xirr"><span class="stat-card__value"></span></div>
      <div id="card-gainloss">
        <span class="stat-card__value"></span>
        <span class="stat-card__sub"></span>
      </div>
    `
  })

  it('populates the invested card with formatted INR', () => {
    renderStatCards(makeDashboardData({ overall: makeXirrResult({ totalInvested: 100000 }) }))
    expect(document.querySelector('#card-invested .stat-card__value')?.textContent).toBe(
      '₹1,00,000.00',
    )
  })

  it('populates the current value card with formatted INR', () => {
    renderStatCards(makeDashboardData({ overall: makeXirrResult({ currentValue: 120000 }) }))
    expect(document.querySelector('#card-current .stat-card__value')?.textContent).toBe(
      '₹1,20,000.00',
    )
  })

  it('populates the XIRR card with formatted percentage', () => {
    renderStatCards(makeDashboardData({ overall: makeXirrResult({ xirr: 0.1432 }) }))
    expect(document.querySelector('#card-xirr .stat-card__value')?.textContent).toBe('14.32%')
  })

  it('shows N/A on the XIRR card when xirr is null', () => {
    renderStatCards(makeDashboardData({ overall: makeXirrResult({ xirr: null }) }))
    expect(document.querySelector('#card-xirr .stat-card__value')?.textContent).toBe('N/A')
  })

  it('applies xirr-positive to #card-xirr for positive XIRR', () => {
    renderStatCards(makeDashboardData({ overall: makeXirrResult({ xirr: 0.1 }) }))
    const card = document.getElementById('card-xirr')!
    expect(card.classList.contains('xirr-positive')).toBe(true)
    expect(countXirrClasses(card)).toBe(1)
  })

  it('applies xirr-negative to #card-xirr for negative XIRR', () => {
    renderStatCards(makeDashboardData({ overall: makeXirrResult({ xirr: -0.05 }) }))
    const card = document.getElementById('card-xirr')!
    expect(card.classList.contains('xirr-negative')).toBe(true)
    expect(countXirrClasses(card)).toBe(1)
  })

  it('applies xirr-zero to #card-xirr for null XIRR', () => {
    renderStatCards(makeDashboardData({ overall: makeXirrResult({ xirr: null }) }))
    const card = document.getElementById('card-xirr')!
    expect(card.classList.contains('xirr-zero')).toBe(true)
    expect(countXirrClasses(card)).toBe(1)
  })

  it('populates the gain/loss card', () => {
    renderStatCards(
      makeDashboardData({ overall: makeXirrResult({ gainLoss: 20000, totalInvested: 100000 }) }),
    )
    expect(document.querySelector('#card-gainloss .stat-card__value')?.textContent).toBe(
      '+₹20,000.00',
    )
  })
})

describe('renderPortfolioGrid', () => {
  beforeEach(() => {
    document.body.innerHTML = `<div id="portfolio-grid"></div>`
  })

  it('creates one .portfolio-card per portfolio', () => {
    renderPortfolioGrid([makeXirrResult({ schemeId: 'a' }), makeXirrResult({ schemeId: 'b' })])
    expect(document.querySelectorAll('.portfolio-card').length).toBe(2)
  })

  it('each card shows the scheme name', () => {
    renderPortfolioGrid([makeXirrResult({ schemeName: 'Axis Bluechip Fund' })])
    expect(document.querySelector('.portfolio-card__name')?.textContent).toBe('Axis Bluechip Fund')
  })

  it('each card carries exactly one XIRR class on the xirr element', () => {
    renderPortfolioGrid([makeXirrResult({ xirr: 0.12 })])
    const xirrEl = document.querySelector('.portfolio-card__xirr')!
    expect(countXirrClasses(xirrEl)).toBe(1)
    expect(xirrEl.classList.contains('xirr-positive')).toBe(true)
  })

  it('shows inline error text when xirr is null', () => {
    renderPortfolioGrid([makeXirrResult({ xirr: null, xirrError: 'Insufficient data' })])
    expect(document.querySelector('.portfolio-card__error')?.textContent).toBe('Insufficient data')
  })

  it('Property 7 (grid): every rendered XIRR element has exactly one XIRR class', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            xirr: fc.oneof(
              fc.double({ noNaN: true, noDefaultInfinity: true, min: -5, max: 5 }),
              fc.constant(null),
            ),
          }),
          { minLength: 1, maxLength: 8 },
        ),
        (overrides) => {
          document.body.innerHTML = `<div id="portfolio-grid"></div>`
          renderPortfolioGrid(
            overrides.map((o, i) => makeXirrResult({ schemeId: `s${i}`, xirr: o.xirr })),
          )
          for (const el of document.querySelectorAll('.portfolio-card__xirr')) {
            expect(countXirrClasses(el)).toBe(1)
          }
        },
      ),
      { numRuns: 100 },
    )
  })
})
