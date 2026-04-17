import { loadAndExtract } from './pdf-engine'
import { parseCASStatement, buildCashFlowSeries } from './parser'
import { computeXIRR, computeOverallXIRR } from './xirr'
import { renderDashboard, showDashboard, showUploadView } from './dashboard'
import { classifyError, showStatusError } from './error-handler'
import type { DashboardData, XIRRResult, PortfolioResult } from './types'

function setStatus(message: string): void {
  const statusBar = document.getElementById('status-bar')
  if (!statusBar) return
  statusBar.textContent = message
  statusBar.classList.remove('status-bar--error', 'status-bar--hidden')
  statusBar.removeAttribute('hidden')
}

function clearStatus(): void {
  const statusBar = document.getElementById('status-bar')
  if (!statusBar) return
  statusBar.textContent = ''
  statusBar.setAttribute('hidden', '')
  statusBar.classList.remove('status-bar--error')
}

async function runPipeline(file: File, password: string): Promise<void> {
  setStatus('Opening PDF…')
  const buffer = await file.arrayBuffer()

  setStatus('Extracting data…')
  const pages = await loadAndExtract(buffer, password)

  const statement = parseCASStatement(pages)

  setStatus('Calculating returns…')

  const portfolioResults: PortfolioResult[] = []

  for (const scheme of statement.schemes) {
    const cashFlowSeries = buildCashFlowSeries(scheme)

    const totalInvested = cashFlowSeries.cashFlows
      .filter((cf) => cf.amount < 0)
      .reduce((sum, cf) => sum + Math.abs(cf.amount), 0)

    const currentValue = scheme.valuationValue

    let xirr: number | null = null
    let xirrError: string | null = null

    try {
      xirr = computeXIRR(cashFlowSeries.cashFlows)
    } catch (err: unknown) {
      xirrError = classifyError(err)
    }

    const xirrResult: XIRRResult = {
      schemeId: scheme.name,
      schemeName: scheme.name,
      totalInvested,
      currentValue,
      gainLoss: currentValue - totalInvested,
      xirr,
      xirrError,
    }

    portfolioResults.push({ cashFlowSeries, xirrResult })
  }

  let overallXirr: number | null = null
  let overallXirrError: string | null = null

  try {
    overallXirr = computeOverallXIRR(portfolioResults)
  } catch (err: unknown) {
    overallXirrError = classifyError(err)
  }

  const overallTotalInvested = portfolioResults.reduce(
    (sum, p) => sum + p.xirrResult.totalInvested,
    0,
  )
  const overallCurrentValue = portfolioResults.reduce(
    (sum, p) => sum + p.xirrResult.currentValue,
    0,
  )

  const overall: XIRRResult = {
    schemeId: '__overall__',
    schemeName: 'Overall Portfolio',
    totalInvested: overallTotalInvested,
    currentValue: overallCurrentValue,
    gainLoss: overallCurrentValue - overallTotalInvested,
    xirr: overallXirr,
    xirrError: overallXirrError,
  }

  const dashboardData: DashboardData = {
    portfolios: portfolioResults.map((p) => p.xirrResult),
    overall,
    statementPeriod: statement.statementPeriod,
  }

  clearStatus()
  renderDashboard(dashboardData)
  showDashboard()
}

function handleAnalyse(): void {
  const fileInput = document.getElementById('pdf-input') as HTMLInputElement | null
  const passwordInput = document.getElementById('pdf-password') as HTMLInputElement | null

  const file = fileInput?.files?.[0] ?? null

  if (!file) {
    showStatusError('Please select a PDF file to analyse.')
    return
  }

  if (!file.name.toLowerCase().endsWith('.pdf')) {
    showStatusError('Please select a PDF file.')
    return
  }

  const password = passwordInput?.value ?? ''

  runPipeline(file, password).catch((err: unknown) => {
    showStatusError(classifyError(err))
  })
}

function handleBack(): void {
  showUploadView()

  const fileInput = document.getElementById('pdf-input') as HTMLInputElement | null
  const passwordInput = document.getElementById('pdf-password') as HTMLInputElement | null

  if (fileInput) fileInput.value = ''
  if (passwordInput) passwordInput.value = ''

  clearStatus()
}

document.addEventListener('DOMContentLoaded', () => {
  const analyseBtn = document.getElementById('analyse-btn')
  const backBtn = document.getElementById('back-btn')

  analyseBtn?.addEventListener('click', handleAnalyse)
  backBtn?.addEventListener('click', handleBack)
})
