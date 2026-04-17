/**
 * A single dated cash flow.
 * Negative = outflow (purchase), Positive = inflow (redemption/dividend/valuation).
 */
export interface CashFlow {
  date: Date // parsed from ISO 8601 string
  amount: number
}

/** Transaction type classification for CAS statement entries. */
export enum TransactionType {
  PURCHASE = 'PURCHASE',
  PURCHASE_SIP = 'PURCHASE_SIP',
  REDEMPTION = 'REDEMPTION',
  SWITCH_IN = 'SWITCH_IN',
  SWITCH_OUT = 'SWITCH_OUT',
  DIVIDEND_PAYOUT = 'DIVIDEND_PAYOUT',
  DIVIDEND_REINVESTMENT = 'DIVIDEND_REINVESTMENT',
  STAMP_DUTY_TAX = 'STAMP_DUTY_TAX',
  TDS_TAX = 'TDS_TAX',
  STT_TAX = 'STT_TAX',
  MISC = 'MISC',
}

/** A single transaction line extracted from the PDF. */
export interface Transaction {
  date: string // ISO 8601 "YYYY-MM-DD"
  description: string
  amount: number // raw signed amount as in PDF (negative = purchase)
  units: number
  nav: number
  type: TransactionType
}

/** A single mutual fund scheme within a folio. */
export interface Scheme {
  name: string // full scheme name from PDF
  isin: string | null
  folio: string
  amc: string
  transactions: Transaction[]
  valuationDate: string // ISO 8601 — statement date
  valuationNAV: number
  valuationValue: number // current market value in INR
  closingUnits: number
}

/** Top-level parsed output from the PDF. */
export interface ParsedStatement {
  statementPeriod: { from: string; to: string }
  investorName: string
  schemes: Scheme[] // one entry per scheme across all folios
}

/** Ordered cash flow series ready for XIRR input. */
export interface CashFlowSeries {
  schemeId: string // scheme name used as stable key
  cashFlows: CashFlow[] // sorted ascending by date
}

/** XIRR result for one scheme (or the overall aggregate). */
export interface XIRRResult {
  schemeId: string
  schemeName: string
  totalInvested: number // sum of all purchase amounts (positive)
  currentValue: number // valuation value
  gainLoss: number // currentValue - totalInvested
  xirr: number | null // decimal rate; null if error
  xirrError: string | null // error message if xirr is null
}

/** Aggregated data passed to DashboardRenderer. */
export interface DashboardData {
  portfolios: XIRRResult[]
  overall: XIRRResult // synthetic entry for all-portfolio aggregate
  statementPeriod: { from: string; to: string }
}

/** Intermediate type used by computeOverallXIRR. */
export interface PortfolioResult {
  cashFlowSeries: CashFlowSeries
  xirrResult: XIRRResult
}

/** Thrown when PDF decryption fails due to wrong password. */
export class PDFPasswordError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PDFPasswordError'
  }
}

/** Thrown when PDF cannot be loaded for any other reason. */
export class PDFLoadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PDFLoadError'
  }
}

/** Thrown when the parser cannot extract portfolio/transaction data. */
export class ParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ParseError'
  }
}

/**
 * Thrown when cash flow series has fewer than 2 flows,
 * or no negative cash flow, or no positive cash flow.
 */
export class XIRRInsufficientDataError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'XIRRInsufficientDataError'
  }
}

/**
 * Thrown when Newton-Raphson does not converge
 * within 1000 iterations.
 */
export class XIRRConvergenceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'XIRRConvergenceError'
  }
}
