import type { CashFlow, CashFlowSeries, ParsedStatement, Scheme, Transaction } from './types'
import { ParseError, TransactionType } from './types'
import type { RawPage } from './pdf-engine'

const MONTH_MAP: Record<string, string> = {
  Jan: '01',
  Feb: '02',
  Mar: '03',
  Apr: '04',
  May: '05',
  Jun: '06',
  Jul: '07',
  Aug: '08',
  Sep: '09',
  Oct: '10',
  Nov: '11',
  Dec: '12',
}

/**
 * Converts a date string from `DD-MMM-YYYY` format to ISO 8601 `YYYY-MM-DD`.
 * Uses a static month lookup to avoid locale-dependent `Date.parse()` behaviour.
 *
 * @throws {Error} if the input does not match the expected format
 */
export function normaliseDate(ddMmmYYYY: string): string {
  const match = ddMmmYYYY.trim().match(/^(\d{2})-([A-Za-z]{3})-(\d{4})$/)
  if (!match) {
    throw new Error(`Invalid date format: "${ddMmmYYYY}". Expected DD-MMM-YYYY.`)
  }
  const [, dd, mmm, yyyy] = match
  const mm = MONTH_MAP[mmm.charAt(0).toUpperCase() + mmm.slice(1).toLowerCase()]
  if (!mm) {
    throw new Error(`Unknown month abbreviation: "${mmm}".`)
  }
  return `${yyyy}-${mm}-${dd}`
}

/**
 * Normalises a raw amount string from the CAS PDF to a signed number.
 * Strips `₹` and commas; converts parenthesised values to negative.
 */
export function normaliseAmount(raw: string): number {
  const cleaned = raw.trim().replace(/₹/g, '').replace(/,/g, '').trim()
  const parenthesised = cleaned.match(/^\((.+)\)$/)
  if (parenthesised) {
    return -Math.abs(parseFloat(parenthesised[1]))
  }
  return parseFloat(cleaned)
}

const CLASSIFICATION_RULES: Array<{ pattern: RegExp; type: TransactionType }> = [
  // SIP must be checked before generic purchase
  { pattern: /\bsip\b/i, type: TransactionType.PURCHASE_SIP },
  { pattern: /\bswitch\s*in\b/i, type: TransactionType.SWITCH_IN },
  { pattern: /\bswitch\s*out\b/i, type: TransactionType.SWITCH_OUT },
  // Reinvestment must be checked before payout
  { pattern: /\bdividend\s*reinvest/i, type: TransactionType.DIVIDEND_REINVESTMENT },
  { pattern: /\bdiv\s*reinvest/i, type: TransactionType.DIVIDEND_REINVESTMENT },
  { pattern: /\bdividend\b/i, type: TransactionType.DIVIDEND_PAYOUT },
  { pattern: /\bredemption\b/i, type: TransactionType.REDEMPTION },
  { pattern: /\bredeem\b/i, type: TransactionType.REDEMPTION },
  { pattern: /\bstamp\s*duty\b/i, type: TransactionType.STAMP_DUTY_TAX },
  { pattern: /\btds\b/i, type: TransactionType.TDS_TAX },
  { pattern: /\bstt\b/i, type: TransactionType.STT_TAX },
  { pattern: /\bpurchase\b/i, type: TransactionType.PURCHASE },
  { pattern: /\bbuy\b/i, type: TransactionType.PURCHASE },
  { pattern: /\bnew\s*fund\s*offer\b/i, type: TransactionType.PURCHASE },
  { pattern: /\bnfo\b/i, type: TransactionType.PURCHASE },
]

/** Classifies a transaction description into a `TransactionType`, falling back to `MISC`. */
export function classifyTransaction(description: string): TransactionType {
  for (const { pattern, type } of CLASSIFICATION_RULES) {
    if (pattern.test(description)) return type
  }
  return TransactionType.MISC
}

const NEGATIVE_TYPES = new Set<TransactionType>([
  TransactionType.PURCHASE,
  TransactionType.PURCHASE_SIP,
  TransactionType.SWITCH_OUT,
  TransactionType.STAMP_DUTY_TAX,
  TransactionType.TDS_TAX,
  TransactionType.STT_TAX,
])

const POSITIVE_TYPES = new Set<TransactionType>([
  TransactionType.REDEMPTION,
  TransactionType.SWITCH_IN,
  TransactionType.DIVIDEND_PAYOUT,
])

/**
 * Builds a `CashFlowSeries` from a parsed `Scheme`.
 *
 * Sign convention:
 * - PURCHASE / PURCHASE_SIP / SWITCH_OUT / tax types → negative (outflow)
 * - REDEMPTION / SWITCH_IN / DIVIDEND_PAYOUT → positive (inflow)
 * - DIVIDEND_REINVESTMENT / MISC → excluded (no cash exchanged)
 * - Terminal valuation → positive (inflow)
 */
export function buildCashFlowSeries(scheme: Scheme): CashFlowSeries {
  const cashFlows: CashFlow[] = []

  for (const tx of scheme.transactions) {
    if (NEGATIVE_TYPES.has(tx.type)) {
      cashFlows.push({ date: new Date(tx.date), amount: -Math.abs(tx.amount) })
    } else if (POSITIVE_TYPES.has(tx.type)) {
      cashFlows.push({ date: new Date(tx.date), amount: Math.abs(tx.amount) })
    }
  }

  if (scheme.valuationValue > 0) {
    cashFlows.push({ date: new Date(scheme.valuationDate), amount: scheme.valuationValue })
  }

  cashFlows.sort((a, b) => a.date.getTime() - b.date.getTime())

  return { schemeId: scheme.name, cashFlows }
}

const RE_FOLIO = /Folio\s*No[.:\s]+(\S+)/i
// ISIN may have spaces between characters when extracted from PDF (e.g. "INF 846 K 01 DP 8")
// so we match the raw spaced form and strip spaces, or the compact form.
const RE_ISIN_SPACED = /ISIN\s*[:\-]?\s*((?:[A-Z0-9]\s*){12})/i
const RE_ISIN = /ISIN\s*[:\-]?\s*([A-Z]{2}[A-Z0-9]{10})/i
const RE_TRANSACTION_DATE = /^(\d{2}-[A-Za-z]{3}-\d{4})\s+(.*)/
const RE_VALUATION = /Valuation\s+on\s+(\d{2}-[A-Za-z]{3}-\d{4})\s*[:\-]?\s*[₹]?([\d,]+\.?\d*)/i
// "Market Value on DD-MMM-YYYY: INR X,XX,XXX.XX" — appears on closing line in real PDFs
const RE_MARKET_VALUE =
  /Market\s+Value\s+on\s+(\d{2}-[A-Za-z]{3}-\d{4})\s*[:\-]?\s*INR\s*([\d,]+\.?\d*)/i
const RE_CLOSING_UNITS = /Closing\s+Unit\s+Balance\s*[:\-]?\s*([\d,]+\.?\d*)/i
const RE_TOTAL_COST = /Total\s+Cost\s+Value\s*[:\-]?\s*([\d,]+\.?\d*)/i
const RE_STATEMENT_PERIOD = /(\d{2}-[A-Za-z]{3}-\d{4})\s+[Tt]o\s+(\d{2}-[A-Za-z]{3}-\d{4})/i
const RE_INVESTOR_NAME = /(?:Dear\s+|Name\s*[:\-]\s*)([A-Za-z][A-Za-z\s.'-]{1,60})/i
const RE_NAV_UNITS = /\(?([\d,]+\.?\d*)\s+[Uu]nits?\s+@\s+(?:NAV\s+)?[₹]?([\d,]+\.?\d*)\)?/i

/**
 * Normalises a potentially space-fragmented ISIN string (e.g. "INF 846 K 01 DP 8")
 * to a compact 12-character ISIN (e.g. "INF846K01DP8").
 */
function compactISIN(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase()
}

/**
 * Extracts an ISIN from a line, handling both compact ("INF846K01DP8") and
 * space-fragmented ("INF 846 K 01 DP 8") forms produced by some PDF renderers.
 */
function extractISIN(line: string): string | null {
  // Try compact form first
  const compact = line.match(RE_ISIN)
  if (compact) return compact[1]
  // Try spaced form: "ISIN : INF 846 K 01 DP 8"
  const spaced = line.match(RE_ISIN_SPACED)
  if (spaced) {
    const isin = compactISIN(spaced[1])
    if (isin.length === 12) return isin
  }
  return null
}

/**
 * Returns true if the line contains an ISIN (compact or spaced).
 */
function lineHasISIN(line: string): boolean {
  return extractISIN(line) !== null
}

/**
 * Parses a CAMS/KFintech Consolidated Account Statement (CAS) from extracted
 * PDF pages and returns a structured `ParsedStatement`.
 *
 * @throws {ParseError} if no portfolio or transaction data can be identified
 */
export function parseCASStatement(pages: RawPage[]): ParsedStatement {
  const allLines: string[] = pages.flatMap((p) => p.lines)

  let statementPeriod = { from: '', to: '' }
  let investorName = ''

  // Scan the first 60 lines for the statement period and investor name.
  // In real PDFs the investor name appears as a standalone line (e.g. "Anurag A S")
  // a few lines after the email line — it does NOT follow "Dear " or "Name:".
  let emailLineIdx = -1
  for (let i = 0; i < Math.min(60, allLines.length); i++) {
    const line = allLines[i].trim()
    if (!statementPeriod.from) {
      const m = line.match(RE_STATEMENT_PERIOD)
      if (m) {
        try {
          statementPeriod = { from: normaliseDate(m[1]), to: normaliseDate(m[2]) }
        } catch {
          // ignore malformed header dates
        }
      }
    }
    // Detect the email line so we can find the name on the next non-empty line
    if (!investorName && /Email\s*Id\s*:/i.test(line)) {
      emailLineIdx = i
    }
    // The investor name is the next non-empty line after the email line
    if (!investorName && emailLineIdx >= 0 && i > emailLineIdx) {
      // Strip any trailing boilerplate that got merged onto the same line
      const candidate = line.split(/\s{3,}/)[0].trim()
      if (/^[A-Za-z][A-Za-z\s.'-]{1,60}$/.test(candidate) && !/http|www|@/i.test(candidate)) {
        investorName = candidate
      }
    }
    // Fallback: "Dear <name>" pattern
    if (!investorName) {
      const m = line.match(RE_INVESTOR_NAME)
      if (m) investorName = m[1].trim()
    }
    if (statementPeriod.from && investorName) break
  }

  const schemes: Scheme[] = []
  let inScheme = false

  let currentFolio = ''
  let currentAMC = ''
  let currentScheme: Scheme | null = null

  for (let i = 0; i < allLines.length; i++) {
    const line = allLines[i].trim()
    if (!line) continue

    // ── Folio line ────────────────────────────────────────────────────────────
    // Real PDFs merge folio + PAN onto one line:
    // "Folio No: 910105347352 / 0 PAN: BVBPA3362E KYC: OK PAN: OK"
    const folioMatch = line.match(RE_FOLIO)
    if (folioMatch) {
      if (currentScheme) {
        schemes.push(currentScheme)
        currentScheme = null
      }
      currentFolio = folioMatch[1].replace(/[^A-Za-z0-9/]/g, '')
      // AMC name is the next non-empty line that doesn't look like a name/nominee line
      currentAMC = findNextNonEmpty(allLines, i + 1) ?? ''
      inScheme = false
      continue
    }

    // ── Scheme header ─────────────────────────────────────────────────────────
    // The scheme name and ISIN appear on the SAME line in real PDFs:
    // "128 EFDGG - Axis Large Cap Fund - Direct Growth - ISIN : INF 846 K 01 DP 8 ..."
    // We detect this by checking if the current line itself contains an ISIN.
    if (lineHasISIN(line)) {
      if (currentScheme) schemes.push(currentScheme)
      const isin = extractISIN(line)
      // Extract scheme name: everything before " - ISIN" or " ISIN"
      const nameMatch = line.match(/^(.*?)\s*[-–]?\s*ISIN\s*[:\-]?\s*/i)
      // Strip leading fund-code prefix (e.g. "128 EFDGG - ")
      let schemeName = nameMatch ? nameMatch[1].trim() : line
      schemeName = schemeName.replace(/^[\w\s]+-\s*/, '').trim()
      // If name is still just a code, use the full line up to ISIN
      if (schemeName.length < 5) schemeName = line.split(/ISIN/i)[0].trim()

      currentScheme = {
        name: schemeName,
        isin,
        folio: currentFolio,
        amc: currentAMC,
        transactions: [],
        valuationDate: statementPeriod.to || '',
        valuationNAV: 0,
        valuationValue: 0,
        closingUnits: 0,
        totalCostValue: 0,
      }
      inScheme = true
      continue
    }

    if (!inScheme || !currentScheme) continue

    // ── Transaction line ──────────────────────────────────────────────────────
    const txMatch = line.match(RE_TRANSACTION_DATE)
    if (txMatch) {
      // The stamp duty line sometimes has the closing-unit-balance content merged
      // onto the same line by the PDF extractor. Split it off before parsing.
      let txRest = txMatch[2]
      let closingTail = ''
      const closingIdx = txRest.search(/Closing\s+Unit\s+Balance/i)
      if (closingIdx !== -1) {
        closingTail = txRest.slice(closingIdx)
        txRest = txRest.slice(0, closingIdx).trim()
      }

      const tx = parseTransactionLine(txMatch[1], txRest, allLines, i)
      if (tx) currentScheme.transactions.push(tx)

      // If the closing line was merged, process it now
      if (closingTail) {
        const closingMatch2 = closingTail.match(RE_CLOSING_UNITS)
        if (closingMatch2) {
          currentScheme.closingUnits = normaliseAmount(closingMatch2[1])
          const tcvMatch2 = closingTail.match(RE_TOTAL_COST)
          if (tcvMatch2) currentScheme.totalCostValue = normaliseAmount(tcvMatch2[1])
          const mvMatch2 = closingTail.match(RE_MARKET_VALUE)
          if (mvMatch2) {
            try {
              currentScheme.valuationDate = normaliseDate(mvMatch2[1])
            } catch {
              /* keep */
            }
            currentScheme.valuationValue = normaliseAmount(mvMatch2[2])
          }
          const navOnMatch2 = closingTail.match(
            /NAV\s+on\s+\d{2}-[A-Za-z]{3}-\d{4}\s*[:\-]?\s*INR\s*([\d,]+\.?\d*)/i,
          )
          if (navOnMatch2) currentScheme.valuationNAV = normaliseAmount(navOnMatch2[1])
          schemes.push(currentScheme)
          currentScheme = null
          inScheme = false
        }
      }
      continue
    }

    // ── Closing / valuation line ──────────────────────────────────────────────
    // Real PDFs put everything on one line:
    // "Closing Unit Balance: 604.565 NAV on 16-Apr-2026: INR 67.31
    //  Total Cost Value: 25,000.00 Market Value on 16-Apr-2026: INR 40,693.27"
    const closingMatch = line.match(RE_CLOSING_UNITS)
    if (closingMatch) {
      currentScheme.closingUnits = normaliseAmount(closingMatch[1])

      // Extract Total Cost Value (the PDF's own cost basis — reliable even when
      // transaction history is incomplete, e.g. switch-in-only folios)
      const tcvMatch = line.match(RE_TOTAL_COST)
      if (tcvMatch) {
        currentScheme.totalCostValue = normaliseAmount(tcvMatch[1])
      }

      // Extract market value (current value) from the same line
      const mvMatch = line.match(RE_MARKET_VALUE)
      if (mvMatch) {
        try {
          currentScheme.valuationDate = normaliseDate(mvMatch[1])
        } catch {
          // keep existing
        }
        currentScheme.valuationValue = normaliseAmount(mvMatch[2])
      }

      // Extract NAV from "NAV on DD-MMM-YYYY: INR X.XX"
      const navOnMatch = line.match(
        /NAV\s+on\s+\d{2}-[A-Za-z]{3}-\d{4}\s*[:\-]?\s*INR\s*([\d,]+\.?\d*)/i,
      )
      if (navOnMatch) {
        currentScheme.valuationNAV = normaliseAmount(navOnMatch[1])
      }

      // Finalise this scheme — the closing line ends a scheme block
      schemes.push(currentScheme)
      currentScheme = null
      inScheme = false
      continue
    }

    // ── Explicit "Valuation on" line (some CAS formats) ───────────────────────
    const valMatch = line.match(RE_VALUATION)
    if (valMatch) {
      try {
        currentScheme.valuationDate = normaliseDate(valMatch[1])
      } catch {
        // keep existing valuationDate
      }
      currentScheme.valuationValue = normaliseAmount(valMatch[2])
      const navMatch = line.match(RE_NAV_UNITS)
      if (navMatch) {
        currentScheme.closingUnits = normaliseAmount(navMatch[1])
        currentScheme.valuationNAV = normaliseAmount(navMatch[2])
      }
      continue
    }
  }

  if (currentScheme) schemes.push(currentScheme)

  if (schemes.length === 0) {
    throw new ParseError(
      'No portfolio data could be found in this PDF. Is this a CAMS/KFintech CAS statement?',
    )
  }

  return { statementPeriod, investorName, schemes }
}

function findNextNonEmpty(lines: string[], startIdx: number): string | null {
  for (let i = startIdx; i < Math.min(startIdx + 5, lines.length); i++) {
    const l = lines[i].trim()
    if (l) return l
  }
  return null
}

/**
 * Parses a transaction row from the CAS PDF.
 *
 * CAS rows follow the layout: `<description>  <amount>  <units>  <nav>  <balance>`
 * The last 4 tokens are always numeric (amount, units, nav, running-balance).
 * We parse from the RIGHT: split on whitespace, walk backwards collecting numeric
 * tokens, and treat everything to the left as the description.
 * This avoids false positives from reference numbers embedded in descriptions
 * (e.g. "Trxn.Ref.No.2533213954503HDFC Bank Ltd").
 *
 * Stamp-duty lines have only one numeric token — we handle them as a special case.
 */
function parseTransactionLine(
  dateStr: string,
  rest: string,
  allLines: string[],
  lineIdx: number,
): Transaction | null {
  let source = rest.trim()

  // If the line looks truncated (fewer than 3 trailing numbers), try appending the next line.
  // But never append a closing-unit-balance line — that's a separate record.
  if (trailingNumberCount(source) < 3) {
    const nextLine = allLines[lineIdx + 1]?.trim() ?? ''
    if (
      nextLine &&
      !nextLine.match(/^\d{2}-[A-Za-z]{3}-\d{4}/) &&
      !nextLine.match(/Closing\s+Unit\s+Balance/i) &&
      !nextLine.match(/Valuation\s+on/i)
    ) {
      source = source + ' ' + nextLine
    }
  }

  // Split into tokens and walk from the right collecting numeric columns.
  // We only treat a token as numeric if it's a standalone number — parenthesised
  // values like "(1)" from SIP descriptions (e.g. "Systematic Investment ... SIP (1)")
  // must NOT be treated as the amount column.
  const tokens = source.split(/\s+/)
  const numericTokens: string[] = []
  let descEndIdx = tokens.length

  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i]
    // A valid numeric column token: plain number with optional commas/decimal,
    // OR a parenthesised number with at least 2 digits (rules out "(1)", "(2)" etc.)
    const isPlainNumber = /^[\d,]+\.?\d*$/.test(t)
    const isParenthesisedAmount = /^\(\d{2,}[\d,.]*\)$/.test(t)
    if (isPlainNumber || isParenthesisedAmount) {
      numericTokens.unshift(t)
      descEndIdx = i
    } else {
      break
    }
  }

  // Need at least amount + units + nav (3 columns); balance is optional 4th.
  // Stamp-duty lines have only 1 numeric token — skip them (they're handled as STAMP_DUTY_TAX).
  if (numericTokens.length < 1) return null

  const description = tokens.slice(0, descEndIdx).join(' ').trim()

  // Columns: [amount, units, nav, balance?]
  // For stamp-duty lines there's only 1 number (the amount).
  const amount = numericTokens.length >= 1 ? normaliseAmount(numericTokens[0]) : 0
  const units = numericTokens.length >= 2 ? normaliseAmount(numericTokens[1]) : 0
  const nav = numericTokens.length >= 3 ? normaliseAmount(numericTokens[2]) : 0

  let isoDate: string
  try {
    isoDate = normaliseDate(dateStr)
  } catch {
    return null
  }

  return { date: isoDate, description, amount, units, nav, type: classifyTransaction(description) }
}

/**
 * Counts how many trailing whitespace-separated tokens in `text` look like numbers
 * (plain or parenthesised).
 */
function trailingNumberCount(text: string): number {
  const tokens = text.trim().split(/\s+/)
  let count = 0
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i]
    if (/^\([\d,]+\.?\d*\)$/.test(t) || /^[\d,]+\.?\d*$/.test(t)) {
      count++
    } else {
      break
    }
  }
  return count
}
