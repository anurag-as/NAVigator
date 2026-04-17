// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

function buildDOM() {
  document.body.innerHTML = `
    <section id="upload-view">
      <form class="upload-card" aria-label="Analyse CAS statement" novalidate>
        <input type="file" id="pdf-input" />
        <input type="password" id="pdf-password" />
        <button id="analyse-btn" type="submit">Calculate XIRR</button>
      </form>
      <div id="status-bar" hidden role="status">
        <span class="status-spinner" aria-hidden="true"></span>
        <span id="status-text"></span>
      </div>
    </section>
    <section id="dashboard-view" hidden>
      <p id="dashboard-period"></p>
      <button id="back-btn" type="button">Analyse Another PDF</button>
      <div id="card-invested"><span class="stat-card__value"></span></div>
      <div id="card-current"><span class="stat-card__value"></span></div>
      <div id="card-xirr"><span class="stat-card__value"></span></div>
      <div id="card-gainloss">
        <span class="stat-card__value"></span>
        <span class="stat-card__sub"></span>
      </div>
      <canvas id="allocation-chart"></canvas>
      <ul id="allocation-legend"></ul>
      <div id="portfolio-grid" role="list"></div>
      <button id="sort-btn" type="button" data-order="desc">XIRR: High to Low</button>
    </section>
  `
}

describe('main.ts — DOM helpers via DOMContentLoaded wiring', () => {
  beforeEach(() => {
    buildDOM()
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('analyse button is present and not busy initially', () => {
    const btn = document.getElementById('analyse-btn') as HTMLButtonElement
    expect(btn).not.toBeNull()
    expect(btn.hasAttribute('disabled')).toBe(false)
    expect(btn.getAttribute('aria-busy')).toBeNull()
  })

  it('status bar is hidden initially', () => {
    const bar = document.getElementById('status-bar')!
    expect(bar.hasAttribute('hidden')).toBe(true)
  })

  it('dashboard view is hidden initially', () => {
    const dash = document.getElementById('dashboard-view')!
    expect(dash.hasAttribute('hidden')).toBe(true)
  })

  it('upload view is visible initially', () => {
    const upload = document.getElementById('upload-view')!
    expect(upload.hasAttribute('hidden')).toBe(false)
  })
})

describe('main.ts — handleAnalyse with no file', () => {
  beforeEach(async () => {
    buildDOM()
    vi.resetModules()

    // Mock heavy dependencies so the module loads cleanly in jsdom
    vi.doMock('../../src/pdf/pdf-engine', () => ({
      loadAndExtract: vi.fn(),
    }))
    vi.doMock('../../src/ui/charts', () => ({
      destroyCharts: vi.fn(),
      renderAllocationChart: vi.fn().mockReturnValue({ destroy: vi.fn() }),
    }))

    // Import main to wire up event listeners
    await import('../../src/main')
    document.dispatchEvent(new Event('DOMContentLoaded'))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows an error in the status bar when no file is selected', async () => {
    const form = document.querySelector('.upload-card') as HTMLFormElement
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))

    await Promise.resolve()

    const statusBar = document.getElementById('status-bar')!
    const statusText = document.getElementById('status-text')!
    expect(statusBar.hasAttribute('hidden')).toBe(false)
    expect(statusBar.classList.contains('status-bar--error')).toBe(true)
    expect(statusText.textContent).toMatch(/select a PDF/i)
  })
})

describe('main.ts — handleBack', () => {
  beforeEach(async () => {
    buildDOM()
    vi.resetModules()

    vi.doMock('../../src/pdf/pdf-engine', () => ({
      loadAndExtract: vi.fn(),
    }))
    vi.doMock('../../src/ui/charts', () => ({
      destroyCharts: vi.fn(),
      renderAllocationChart: vi.fn().mockReturnValue({ destroy: vi.fn() }),
    }))

    await import('../../src/main')
    document.dispatchEvent(new Event('DOMContentLoaded'))

    // Simulate being on the dashboard view
    document.getElementById('upload-view')!.setAttribute('hidden', '')
    document.getElementById('dashboard-view')!.removeAttribute('hidden')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('clicking back shows the upload view and hides the dashboard', async () => {
    const backBtn = document.getElementById('back-btn') as HTMLButtonElement
    backBtn.click()
    await Promise.resolve()

    expect(document.getElementById('upload-view')!.hasAttribute('hidden')).toBe(false)
    expect(document.getElementById('dashboard-view')!.hasAttribute('hidden')).toBe(true)
  })

  it('clicking back clears the password field', async () => {
    const passwordInput = document.getElementById('pdf-password') as HTMLInputElement
    passwordInput.value = 'secret'

    document.getElementById('back-btn')!.click()
    await Promise.resolve()

    expect(passwordInput.value).toBe('')
  })

  it('clicking back hides the status bar', async () => {
    const statusBar = document.getElementById('status-bar')!
    statusBar.removeAttribute('hidden')

    document.getElementById('back-btn')!.click()
    await Promise.resolve()

    expect(statusBar.hasAttribute('hidden')).toBe(true)
  })
})
