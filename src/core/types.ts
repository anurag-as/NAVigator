export interface CashFlow {
  date: Date
  amount: number
}

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

export interface Transaction {
  date: string
  description: string
  amount: number
  units: number
  nav: number
  type: TransactionType
}

export interface Scheme {
  name: string
  isin: string | null
  folio: string
  amc: string
  transactions: Transaction[]
  valuationDate: string
  valuationNAV: number
  valuationValue: number
  closingUnits: number
  totalCostValue: number
}

export interface ParsedStatement {
  statementPeriod: { from: string; to: string }
  investorName: string
  schemes: Scheme[]
}

export interface CashFlowSeries {
  schemeId: string
  cashFlows: CashFlow[]
}

export interface XIRRResult {
  schemeId: string
  schemeName: string
  totalInvested: number
  currentValue: number
  gainLoss: number
  xirr: number | null
  xirrError: string | null
}

export interface DashboardData {
  portfolios: XIRRResult[]
  overall: XIRRResult
  statementPeriod: { from: string; to: string }
}

export interface PortfolioResult {
  cashFlowSeries: CashFlowSeries
  xirrResult: XIRRResult
}

export class PDFPasswordError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PDFPasswordError'
  }
}

export class PDFLoadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PDFLoadError'
  }
}

export class ParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ParseError'
  }
}

export class XIRRInsufficientDataError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'XIRRInsufficientDataError'
  }
}

export class XIRRConvergenceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'XIRRConvergenceError'
  }
}
