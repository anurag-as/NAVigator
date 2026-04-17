import {
  PDFPasswordError,
  PDFLoadError,
  ParseError,
  XIRRInsufficientDataError,
  XIRRConvergenceError,
} from '../core/types'

export function classifyError(err: unknown): string {
  if (err instanceof PDFPasswordError) {
    return 'Incorrect password. Please try again.'
  }
  if (err instanceof PDFLoadError) {
    return 'Could not open this PDF. Please try a different file.'
  }
  if (err instanceof ParseError) {
    return 'No portfolio data could be found in this PDF. Is this a CAMS/KFintech CAS statement?'
  }
  if (err instanceof XIRRInsufficientDataError) {
    return 'Insufficient data for XIRR calculation.'
  }
  if (err instanceof XIRRConvergenceError) {
    return 'XIRR calculation did not converge.'
  }
  return 'An unexpected error occurred. Please try again.'
}

export function showStatusError(message: string): void {
  const statusBar = document.querySelector('#status-bar')
  if (!statusBar) return

  const statusText = document.getElementById('status-text')
  if (statusText) {
    statusText.textContent = message
  } else {
    statusBar.textContent = message
  }

  statusBar.classList.remove('status-bar--hidden')
  statusBar.classList.add('status-bar--error')
  statusBar.removeAttribute('hidden')
}

export function showInlineError(cardElement: Element, message: string): void {
  const errorEl = document.createElement('p')
  errorEl.className = 'portfolio-card__error'
  errorEl.textContent = message
  cardElement.appendChild(errorEl)
}
