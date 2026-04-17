import type { CashFlow, PortfolioResult } from './types'
import { XIRRConvergenceError, XIRRInsufficientDataError } from './types'

const MAX_ITER = 1000
const TOLERANCE = 1e-7
const MS_PER_YEAR = 365.25 * 24 * 3600 * 1000

export function validateCashFlows(cashFlows: CashFlow[]): void {
  if (cashFlows.length < 2) {
    throw new XIRRInsufficientDataError(
      `Cash flow series must contain at least 2 entries; got ${cashFlows.length}.`,
    )
  }
  if (!cashFlows.some((cf) => cf.amount < 0)) {
    throw new XIRRInsufficientDataError(
      'Cash flow series must contain at least one negative cash flow.',
    )
  }
  if (!cashFlows.some((cf) => cf.amount > 0)) {
    throw new XIRRInsufficientDataError(
      'Cash flow series must contain at least one positive cash flow.',
    )
  }
}

function npvAndDerivative(cashFlows: CashFlow[], rate: number): { f: number; df: number } {
  const d0 = cashFlows[0].date.getTime()
  let f = 0
  let df = 0
  for (const { date, amount } of cashFlows) {
    const t = (date.getTime() - d0) / MS_PER_YEAR
    const denom = Math.pow(1 + rate, t)
    f += amount / denom
    df -= (t * amount) / (denom * (1 + rate))
  }
  return { f, df }
}

function newtonRaphson(cashFlows: CashFlow[], guess: number): number | null {
  let rate = guess
  for (let i = 0; i < MAX_ITER; i++) {
    const { f, df } = npvAndDerivative(cashFlows, rate)
    if (Math.abs(df) < 1e-12) return null
    const delta = f / df
    rate -= delta
    if (Math.abs(delta) < TOLERANCE) return rate
  }
  return null
}

export function computeXIRR(cashFlows: CashFlow[], guess = 0.1): number {
  validateCashFlows(cashFlows)
  for (const g of [guess, -0.5, 0.5]) {
    const result = newtonRaphson(cashFlows, g)
    if (result !== null && isFinite(result)) return result
  }
  throw new XIRRConvergenceError(
    'XIRR did not converge within 1000 iterations for any initial guess.',
  )
}

export function computeOverallXIRR(portfolios: PortfolioResult[]): number {
  const merged: CashFlow[] = portfolios
    .flatMap((p) => p.cashFlowSeries.cashFlows)
    .sort((a, b) => a.date.getTime() - b.date.getTime())
  return computeXIRR(merged)
}

export function evaluateNPV(cashFlows: CashFlow[], rate: number): number {
  return npvAndDerivative(cashFlows, rate).f
}
