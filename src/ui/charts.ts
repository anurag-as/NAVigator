import type { XIRRResult } from '../core/types'

interface ChartDataset {
  data: number[]
  backgroundColor: string[]
  borderWidth: number
}

interface ChartData {
  labels: string[]
  datasets: ChartDataset[]
}

interface ChartOptions {
  animation: { duration: number }
  responsive: boolean
  plugins: { legend: { display: boolean } }
}

interface ChartConfig {
  type: string
  data: ChartData
  options: ChartOptions
}

declare const Chart: {
  new (canvas: HTMLCanvasElement, config: ChartConfig): { destroy(): void }
}

type ChartInstance = InstanceType<typeof Chart>

const ALLOCATION_PALETTE = [
  '#6366f1',
  '#f59e0b',
  '#10b981',
  '#3b82f6',
  '#ec4899',
  '#8b5cf6',
  '#14b8a6',
  '#f97316',
  '#06b6d4',
  '#84cc16',
  '#e11d48',
  '#a855f7',
]

const activeCharts: ChartInstance[] = []

export function destroyCharts(): void {
  for (const chart of activeCharts) {
    chart.destroy()
  }
  activeCharts.length = 0

  const existing = document.getElementById('allocation-legend')
  if (existing) existing.innerHTML = ''
}

function renderCustomLegend(portfolios: XIRRResult[]): void {
  const container = document.getElementById('allocation-legend')
  if (!container) return

  container.innerHTML = ''

  for (let i = 0; i < portfolios.length; i++) {
    const color = ALLOCATION_PALETTE[i % ALLOCATION_PALETTE.length]
    const item = document.createElement('li')
    item.className = 'chart-legend__item'

    const swatch = document.createElement('span')
    swatch.className = 'chart-legend__swatch'
    swatch.style.background = color
    swatch.setAttribute('aria-hidden', 'true')

    const label = document.createElement('span')
    label.className = 'chart-legend__label'
    label.textContent = portfolios[i].schemeName

    item.appendChild(swatch)
    item.appendChild(label)
    container.appendChild(item)
  }
}

export function renderAllocationChart(canvasId: string, portfolios: XIRRResult[]): ChartInstance {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement
  const chart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: portfolios.map((p) => p.schemeName),
      datasets: [
        {
          data: portfolios.map((p) => p.currentValue),
          backgroundColor: portfolios.map(
            (_, i) => ALLOCATION_PALETTE[i % ALLOCATION_PALETTE.length],
          ),
          borderWidth: 1,
        },
      ],
    },
    options: {
      animation: { duration: 800 },
      responsive: true,
      plugins: {
        legend: { display: false },
      },
    },
  })
  activeCharts.push(chart)
  renderCustomLegend(portfolios)
  return chart
}
