import type { XIRRResult } from './types'

declare const Chart: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  new (...args: any[]): { destroy(): void }
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

const COLOR_POSITIVE = '#16a34a'
const COLOR_NEGATIVE = '#dc2626'
const COLOR_NEUTRAL = '#6b7280'

const activeCharts: ChartInstance[] = []

export function destroyCharts(): void {
  for (const chart of activeCharts) {
    chart.destroy()
  }
  activeCharts.length = 0
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
        legend: { position: 'bottom' },
      },
    },
  })
  activeCharts.push(chart)
  return chart
}

export function renderReturnsChart(canvasId: string, portfolios: XIRRResult[]): ChartInstance {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement
  const chart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: portfolios.map((p) => p.schemeName),
      datasets: [
        {
          label: 'XIRR (%)',
          data: portfolios.map((p) => (p.xirr !== null ? p.xirr * 100 : 0)),
          backgroundColor: portfolios.map((p) => {
            if (p.xirr === null || p.xirr === 0) return COLOR_NEUTRAL
            return p.xirr > 0 ? COLOR_POSITIVE : COLOR_NEGATIVE
          }),
          borderWidth: 0,
        },
      ],
    },
    options: {
      animation: { duration: 600 },
      responsive: true,
      plugins: {
        legend: { display: false },
      },
      scales: {
        y: {
          title: { display: true, text: 'XIRR (%)' },
        },
      },
    },
  })
  activeCharts.push(chart)
  return chart
}
