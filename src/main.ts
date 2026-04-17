import './css/reset.css'
import './css/variables.css'
import './css/layout.css'
import './css/components.css'
import './css/animations.css'
import { loadAndExtract } from './pdf/pdf-engine'
import { parseCASStatement, buildCashFlowSeries } from './pdf/parser'
import { computeXIRR, computeOverallXIRR } from './core/xirr'
import { renderDashboard, showDashboard, showUploadView } from './ui/dashboard'
import { classifyError, showStatusError } from './ui/error-handler'
import type { DashboardData, XIRRResult, PortfolioResult } from './core/types'

function setStatus(message: string): void {
  const statusBar = document.getElementById('status-bar')
  const statusText = document.getElementById('status-text')
  if (!statusBar) return
  if (statusText) statusText.textContent = message
  statusBar.classList.remove('status-bar--error')
  statusBar.removeAttribute('hidden')
}

function clearStatus(): void {
  const statusBar = document.getElementById('status-bar')
  const statusText = document.getElementById('status-text')
  if (!statusBar) return
  if (statusText) statusText.textContent = ''
  statusBar.setAttribute('hidden', '')
  statusBar.classList.remove('status-bar--error')
}

function setBusy(busy: boolean): void {
  const btn = document.getElementById('analyse-btn')
  if (!btn) return
  if (busy) {
    btn.setAttribute('aria-busy', 'true')
    btn.setAttribute('disabled', '')
  } else {
    btn.removeAttribute('aria-busy')
    btn.removeAttribute('disabled')
  }
}

async function runPipeline(file: File, password: string): Promise<void> {
  setBusy(true)
  try {
    setStatus('Opening PDF…')
    const buffer = await file.arrayBuffer()

    setStatus('Extracting data…')
    const pages = await loadAndExtract(buffer, password)
    const statement = parseCASStatement(pages)

    setStatus('Calculating returns…')

    const portfolioResults: PortfolioResult[] = []

    for (const scheme of statement.schemes) {
      const cashFlowSeries = buildCashFlowSeries(scheme)

      const totalInvested =
        scheme.totalCostValue > 0
          ? scheme.totalCostValue
          : cashFlowSeries.cashFlows
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

      portfolioResults.push({
        cashFlowSeries,
        xirrResult: {
          schemeId: scheme.name,
          schemeName: scheme.name,
          totalInvested,
          currentValue,
          gainLoss: currentValue - totalInvested,
          xirr,
          xirrError,
        },
      })
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
  } catch (err: unknown) {
    showStatusError(classifyError(err))
  } finally {
    setBusy(false)
  }
}

function handleAnalyse(e: Event): void {
  e.preventDefault()
  const fileInput = document.getElementById('pdf-input') as HTMLInputElement | null
  const passwordInput = document.getElementById('pdf-password') as HTMLInputElement | null

  const file = fileInput?.files?.[0] ?? null

  if (!file) {
    showStatusError('Please select a PDF file to analyse.')
    return
  }

  runPipeline(file, passwordInput?.value ?? '')
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
  document.querySelector('.upload-card')?.addEventListener('submit', handleAnalyse)
  document.getElementById('analyse-btn')?.addEventListener('click', handleAnalyse)
  document.getElementById('back-btn')?.addEventListener('click', handleBack)

  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key !== 'Enter') return
    const uploadView = document.getElementById('upload-view')
    if (!uploadView || uploadView.hasAttribute('hidden')) return
    if (document.activeElement?.id === 'pdf-input') return
    const btn = document.getElementById('analyse-btn') as HTMLButtonElement | null
    if (btn && !btn.disabled) btn.click()
  })
})
