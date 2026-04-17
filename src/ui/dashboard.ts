import type { DashboardData, XIRRResult } from '../core/types'
import { formatINR, formatPct, formatGainLoss } from '../core/formatter'
import { destroyCharts, renderAllocationChart } from './charts'

type SortOrder = 'desc' | 'asc'

const XIRR_CLASSES = ['xirr-positive', 'xirr-negative', 'xirr-zero'] as const

let currentPortfolios: XIRRResult[] = []
let currentSortOrder: SortOrder = 'desc'

function sortPortfolios(portfolios: XIRRResult[], order: SortOrder): XIRRResult[] {
  return [...portfolios].sort((a, b) => {
    const av = a.xirr ?? -Infinity
    const bv = b.xirr ?? -Infinity
    return order === 'desc' ? bv - av : av - bv
  })
}

export function showUploadView(): void {
  document.getElementById('upload-view')?.removeAttribute('hidden')
  document.getElementById('dashboard-view')?.setAttribute('hidden', '')
}

export function showDashboard(): void {
  document.getElementById('upload-view')?.setAttribute('hidden', '')
  document.getElementById('dashboard-view')?.removeAttribute('hidden')
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
    const v = cardInvested.querySelector('.stat-card__value')
    if (v) v.textContent = formatINR(overall.totalInvested)
  }

  const cardCurrent = document.getElementById('card-current')
  if (cardCurrent) {
    const v = cardCurrent.querySelector('.stat-card__value')
    if (v) v.textContent = formatINR(overall.currentValue)
  }

  const cardXirr = document.getElementById('card-xirr')
  if (cardXirr) {
    const v = cardXirr.querySelector('.stat-card__value')
    if (v) v.textContent = overall.xirr !== null ? formatPct(overall.xirr) : 'N/A'
    applyXirrClass(cardXirr, overall.xirr)
  }

  const cardGainLoss = document.getElementById('card-gainloss')
  if (cardGainLoss) {
    const v = cardGainLoss.querySelector('.stat-card__value')
    const sub = cardGainLoss.querySelector('.stat-card__sub')
    if (v) v.textContent = formatGainLoss(overall.gainLoss)
    if (sub && overall.totalInvested !== 0) {
      sub.textContent = formatPct(overall.gainLoss / overall.totalInvested)
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

function buildPortfolioCard(portfolio: XIRRResult, animate: boolean): HTMLElement {
  const card = document.createElement('div')
  card.className = animate ? 'portfolio-card portfolio-card--animate' : 'portfolio-card'

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

  const xirrLabel = document.createElement('span')
  xirrLabel.className = 'portfolio-card__label'
  xirrLabel.textContent = 'XIRR'
  xirrEl.appendChild(xirrLabel)

  if (portfolio.xirr !== null) {
    const xirrValue = document.createElement('span')
    xirrValue.className = 'portfolio-card__value'
    xirrValue.textContent = formatPct(portfolio.xirr)
    xirrEl.appendChild(xirrValue)
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

export function renderPortfolioGrid(portfolios: XIRRResult[], animate = false): void {
  const grid = document.getElementById('portfolio-grid')
  if (!grid) return
  grid.innerHTML = ''
  for (const portfolio of portfolios) {
    grid.appendChild(buildPortfolioCard(portfolio, animate))
  }
}

function updateSortButton(order: SortOrder): void {
  const btn = document.getElementById('sort-btn')
  if (!btn) return
  btn.dataset.order = order
  const textNode = [...btn.childNodes].find((n) => n.nodeType === Node.TEXT_NODE)
  if (textNode)
    textNode.textContent = order === 'desc' ? ' XIRR: High to Low' : ' XIRR: Low to High'
  btn.setAttribute(
    'aria-label',
    order === 'desc'
      ? 'Currently sorted high to low — click to sort low to high'
      : 'Currently sorted low to high — click to sort high to low',
  )
}

function handleSortToggle(): void {
  currentSortOrder = currentSortOrder === 'desc' ? 'asc' : 'desc'
  updateSortButton(currentSortOrder)
  renderPortfolioGrid(sortPortfolios(currentPortfolios, currentSortOrder), false)
}

export function renderDashboard(data: DashboardData): void {
  currentPortfolios = data.portfolios
  currentSortOrder = 'desc'

  const periodEl = document.getElementById('dashboard-period')
  if (periodEl && data.statementPeriod.from && data.statementPeriod.to) {
    periodEl.textContent = `${data.statementPeriod.from} → ${data.statementPeriod.to}`
  }

  destroyCharts()
  renderStatCards(data)
  renderPortfolioGrid(sortPortfolios(currentPortfolios, currentSortOrder), true)
  updateSortButton(currentSortOrder)
  renderAllocationChart('allocation-chart', data.portfolios)

  const canvas = document.getElementById('allocation-chart')
  if (canvas) {
    const names = data.portfolios.map((p) => p.schemeName).join(', ')
    canvas.setAttribute(
      'aria-label',
      `Portfolio allocation doughnut chart showing ${data.portfolios.length} funds: ${names}`,
    )
  }

  const sortBtn = document.getElementById('sort-btn')
  sortBtn?.removeEventListener('click', handleSortToggle)
  sortBtn?.addEventListener('click', handleSortToggle)

  requestAnimationFrame(() => {
    for (const card of document.querySelectorAll('.stat-card')) {
      card.classList.add('animate-in')
    }
    for (const panel of document.querySelectorAll('.chart-panel')) {
      panel.classList.add('animate-in')
    }
  })
}
