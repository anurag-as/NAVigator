// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { classifyError, showStatusError, showInlineError } from '../../src/ui/error-handler'
import {
  PDFPasswordError,
  PDFLoadError,
  ParseError,
  XIRRInsufficientDataError,
  XIRRConvergenceError,
} from '../../src/core/types'

describe('classifyError', () => {
  it('maps PDFPasswordError to the incorrect-password message', () => {
    expect(classifyError(new PDFPasswordError('wrong'))).toBe(
      'Incorrect password. Please try again.',
    )
  })

  it('maps PDFLoadError to the corrupt-PDF message', () => {
    expect(classifyError(new PDFLoadError('corrupt'))).toBe(
      'Could not open this PDF. Please try a different file.',
    )
  })

  it('maps ParseError to the no-portfolio-data message', () => {
    expect(classifyError(new ParseError('no data'))).toBe(
      'No portfolio data could be found in this PDF. Is this a CAMS/KFintech CAS statement?',
    )
  })

  it('maps XIRRInsufficientDataError to the insufficient-data message', () => {
    expect(classifyError(new XIRRInsufficientDataError('not enough'))).toBe(
      'Insufficient data for XIRR calculation.',
    )
  })

  it('maps XIRRConvergenceError to the non-convergence message', () => {
    expect(classifyError(new XIRRConvergenceError('no convergence'))).toBe(
      'XIRR calculation did not converge.',
    )
  })

  it('maps a plain Error to the generic unexpected-error message', () => {
    expect(classifyError(new Error('something went wrong'))).toBe(
      'An unexpected error occurred. Please try again.',
    )
  })

  it('maps a string thrown value to the generic unexpected-error message', () => {
    expect(classifyError('oops')).toBe('An unexpected error occurred. Please try again.')
  })

  it('maps null to the generic unexpected-error message', () => {
    expect(classifyError(null)).toBe('An unexpected error occurred. Please try again.')
  })

  it('maps undefined to the generic unexpected-error message', () => {
    expect(classifyError(undefined)).toBe('An unexpected error occurred. Please try again.')
  })
})

describe('showStatusError', () => {
  let statusBar: HTMLElement
  let statusText: HTMLElement

  beforeEach(() => {
    statusBar = document.createElement('div')
    statusBar.id = 'status-bar'
    statusBar.setAttribute('hidden', '')
    statusBar.classList.add('status-bar--hidden')

    statusText = document.createElement('span')
    statusText.id = 'status-text'
    statusBar.appendChild(statusText)

    document.body.appendChild(statusBar)
  })

  afterEach(() => {
    statusBar.remove()
  })

  it('sets the text content of #status-text to the provided message', () => {
    showStatusError('Something went wrong.')
    expect(statusText.textContent).toBe('Something went wrong.')
  })

  it('adds the status-bar--error CSS class', () => {
    showStatusError('Error!')
    expect(statusBar.classList.contains('status-bar--error')).toBe(true)
  })

  it('removes the status-bar--hidden CSS class', () => {
    showStatusError('Error!')
    expect(statusBar.classList.contains('status-bar--hidden')).toBe(false)
  })

  it('removes the hidden attribute', () => {
    showStatusError('Error!')
    expect(statusBar.hasAttribute('hidden')).toBe(false)
  })

  it('does not throw when #status-bar is absent from the DOM', () => {
    statusBar.remove()
    expect(() => showStatusError('Error!')).not.toThrow()
  })
})

describe('showInlineError', () => {
  let card: HTMLElement

  beforeEach(() => {
    card = document.createElement('div')
    card.className = 'portfolio-card'
    document.body.appendChild(card)
  })

  afterEach(() => {
    card.remove()
  })

  it('appends a child element to the card', () => {
    showInlineError(card, 'Insufficient data for XIRR calculation.')
    expect(card.children.length).toBe(1)
  })

  it('the injected element has the portfolio-card__error class', () => {
    showInlineError(card, 'Insufficient data for XIRR calculation.')
    expect(card.children[0].classList.contains('portfolio-card__error')).toBe(true)
  })

  it('the injected element contains the provided message text', () => {
    const msg = 'XIRR calculation did not converge.'
    showInlineError(card, msg)
    expect(card.children[0].textContent).toBe(msg)
  })

  it('appends multiple error elements on repeated calls', () => {
    showInlineError(card, 'First error.')
    showInlineError(card, 'Second error.')
    expect(card.children.length).toBe(2)
    expect(card.children[1].textContent).toBe('Second error.')
  })

  it('does not disturb existing children in the card', () => {
    const existing = document.createElement('span')
    existing.textContent = 'Existing content'
    card.appendChild(existing)

    showInlineError(card, 'New error.')
    expect(card.children.length).toBe(2)
    expect(card.children[0].textContent).toBe('Existing content')
    expect(card.children[1].textContent).toBe('New error.')
  })
})
