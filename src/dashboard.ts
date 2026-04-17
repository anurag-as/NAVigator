import type { DashboardData, XIRRResult } from './types'
import { formatINR, formatPct, formatGainLoss } from './formatter'
import { destroyCharts, renderAllocationChart, renderReturnsChart } from './charts'

const XIRR_CLASSES = ['xirr-positive', 'xirr-negative', 'xirr-zero'] as const

export function showUploadView(): void {
  const uploadView = document.getElementById('upload-view')
  const dashboardView = document.getElementById('dashboard-view')
  if (uploadView) uploadView.style.display = ''
  if (dashboardView) dashboardView.style.display = 'none'
}

export function showDashboard(): void {
  const uploadView = document.getElementById('upload-view')
  const dashboardView = document.getElementById('dashboard-view')
  if (uploadView) uploadView.style.display = 'none'
  if (dashboardView) dashboardView.style.display = ''
}

export function applyXirrClass(element: Element, xirr: number | null): void {
  element.classList.remove(...XIRR_CLASSES)
  if (xirr === null || xirr === 0) {
    element.classList.add('xirr-zero')
  } else if (xirr > 0) {
    element.classList.add('xirr-positive')
  } else {
    element.classList.add('xirr-negative')
  }
}

export function renderStatCards(data: DashboardData): void {
  const { overall } = data

  const cardInvested = document.getElementById('card-invested')
  if (cardInvested) {
    const valueEl = cardInvested.querySelector('.stat-card__value')
    if (valueEl) valueEl.textContent = formatINR(overall.totalInvested)
  }

  const cardCurrent = document.getElementById('card-current')
  if (cardCurrent) {
    const valueEl = cardCurrent.querySelector('.stat-card__value')
    if (valueEl) valueEl.textContent = formatINR(overall.currentValue)
  }

  const cardXirr = document.getElementById('card-xirr')
  if (cardXirr) {
    const valueEl = cardXirr.querySelector('.stat-card__value')
    if (valueEl) valueEl.textContent = overall.xirr !== null ? formatPct(overall.xirr) : 'N/A'
    applyXirrClass(cardXirr, overall.xirr)
  }

  const cardGainLoss = document.getElementById('card-gainloss')
  if (cardGainLoss) {
    const valueEl = cardGainLoss.querySelector('.stat-card__value')
    const subEl = cardGainLoss.querySelector('.stat-card__sub')
    if (valueEl) valueEl.textContent = formatGainLoss(overall.gainLoss)
    if (subEl && overall.totalInvested !== 0) {
      subEl.textContent = formatPct(overall.gainLoss / overall.totalInvested)
    }
  }
}

function makeRow(className: string, label: string, value: string): HTMLElement {
  const row = document.createElement('p')
  row.className = className
  const labelEl = document.createElement('span')
  labelEl.className = 'portfolio-card__label'
  labelEl.textContent = label
  const valueEl = document.createElement('span')
  valueEl.className = 'portfolio-card__value'
  valueEl.textContent = value
  row.appendChild(labelEl)
  row.appendChild(valueEl)
  return row
}

function buildPortfolioCard(portfolio: XIRRResult): HTMLElement {
  const card = document.createElement('div')
  card.className = 'portfolio-card'

  const nameEl = document.createElement('h3')
  nameEl.className = 'portfolio-card__name'
  nameEl.textContent = portfolio.schemeName
  card.appendChild(nameEl)

  card.appendChild(
    makeRow('portfolio-card__invested', 'Invested', formatINR(portfolio.totalInvested)),
  )
  card.appendChild(
    makeRow('portfolio-card__current', 'Current Value', formatINR(portfolio.currentValue)),
  )
  card.appendChild(
    makeRow('portfolio-card__gainloss', 'Gain / Loss', formatGainLoss(portfolio.gainLoss)),
  )

  const xirrEl = document.createElement('p')
  xirrEl.className = 'portfolio-card__xirr'

  const xirrLabelEl = document.createElement('span')
  xirrLabelEl.className = 'portfolio-card__label'
  xirrLabelEl.textContent = 'XIRR'
  xirrEl.appendChild(xirrLabelEl)

  if (portfolio.xirr !== null) {
    const xirrValueEl = document.createElement('span')
    xirrValueEl.className = 'portfolio-card__value'
    xirrValueEl.textContent = formatPct(portfolio.xirr)
    xirrEl.appendChild(xirrValueEl)
    applyXirrClass(xirrEl, portfolio.xirr)
  } else {
    const errorEl = document.createElement('span')
    errorEl.className = 'portfolio-card__error'
    errorEl.textContent = portfolio.xirrError ?? 'Calculation error'
    xirrEl.appendChild(errorEl)
    xirrEl.classList.add('xirr-zero')
  }

  card.appendChild(xirrEl)
  return card
}

export function renderPortfolioGrid(portfolios: XIRRResult[]): void {
  const grid = document.getElementById('portfolio-grid')
  if (!grid) return
  for (const portfolio of portfolios) {
    grid.appendChild(buildPortfolioCard(portfolio))
  }
}

export function renderDashboard(data: DashboardData): void {
  const grid = document.getElementById('portfolio-grid')
  if (grid) grid.innerHTML = ''

  destroyCharts()
  renderStatCards(data)
  renderPortfolioGrid(data.portfolios)
  renderAllocationChart('allocation-chart', data.portfolios)
  renderReturnsChart('returns-chart', data.portfolios)

  requestAnimationFrame(() => {
    for (const card of document.querySelectorAll('.stat-card')) {
      card.classList.add('animate-in')
    }
    for (const panel of document.querySelectorAll('.chart-panel')) {
      panel.classList.add('animate-in')
    }
  })
}
