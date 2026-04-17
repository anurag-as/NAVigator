import { PDFLoadError, PDFPasswordError } from './types'

/** Raw text extracted from a single PDF page. */
export interface RawPage {
  pageNumber: number
  lines: string[] // text items joined into logical lines
}

// pdf.js is loaded from CDN as an ambient global — do not npm install it
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const pdfjsLib: any

/**
 * Loads a PDF from an ArrayBuffer, decrypts it with the given password,
 * and returns the extracted text lines for every page.
 *
 * @throws {PDFPasswordError} if the password is incorrect
 * @throws {PDFLoadError}     if the file cannot be opened for any other reason
 */
export async function loadAndExtract(buffer: ArrayBuffer, password: string): Promise<RawPage[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pdfDocument: any

  try {
    const loadingTask = pdfjsLib.getDocument({
      data: buffer,
      password,
      onPassword: (updatePassword: (pwd: string) => void, reason: number) => {
        // reason 2 = PasswordResponses.INCORRECT_PASSWORD (wrong password)
        // reason 1 = PasswordResponses.NEED_PASSWORD (first attempt, no password provided)
        if (reason === 2) {
          // Wrong password — signal the error by supplying a sentinel value so
          // pdf.js rejects the promise with a PasswordException.
          updatePassword('\x00__WRONG_PASSWORD__\x00')
        } else {
          // reason === 1: needs password but none was provided — treat as wrong password
          updatePassword('\x00__WRONG_PASSWORD__\x00')
        }
      },
    })

    pdfDocument = await loadingTask.promise
  } catch (err: unknown) {
    // pdf.js throws a PasswordException for password-related failures
    if (isPasswordException(err)) {
      throw new PDFPasswordError('Incorrect password. Please try again.')
    }
    throw new PDFLoadError(
      'Could not open this PDF. Please try a different file.' +
        (err instanceof Error ? ` (${err.message})` : ''),
    )
  }

  const pages: RawPage[] = []

  try {
    for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
      const page = await pdfDocument.getPage(pageNum)
      const textContent = await page.getTextContent()

      const lines = groupItemsIntoLines(textContent.items)

      pages.push({ pageNumber: pageNum, lines })
    }
  } catch (err: unknown) {
    throw new PDFLoadError(
      'Failed to extract text from PDF.' + (err instanceof Error ? ` (${err.message})` : ''),
    )
  }

  return pages
}

/**
 * Groups pdf.js TextItem objects into logical lines by comparing their
 * y-coordinate (transform[5]) within a tolerance of ±2 px.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function groupItemsIntoLines(items: any[]): string[] {
  if (items.length === 0) return []

  // Each TextItem has a `transform` array where transform[5] is the y-coordinate.
  // We group items whose y-coordinates are within ±2 px of each other into the same line,
  // then sort lines top-to-bottom (descending y in PDF coordinate space).

  const Y_TOLERANCE = 2

  interface LineGroup {
    y: number
    texts: Array<{ x: number; text: string }>
  }

  const lineGroups: LineGroup[] = []

  for (const item of items) {
    const str: string = typeof item.str === 'string' ? item.str : ''
    if (!str.trim()) continue

    const y: number = item.transform[5] as number
    const x: number = item.transform[4] as number

    // Find an existing group within tolerance
    const group = lineGroups.find((g) => Math.abs(g.y - y) <= Y_TOLERANCE)

    if (group) {
      group.texts.push({ x, text: str })
    } else {
      lineGroups.push({ y, texts: [{ x, text: str }] })
    }
  }

  // Sort groups top-to-bottom: in PDF space y increases upward, so higher y = higher on page
  lineGroups.sort((a, b) => b.y - a.y)

  // Within each group, sort left-to-right by x coordinate, then join
  return lineGroups.map((group) => {
    group.texts.sort((a, b) => a.x - b.x)
    return group.texts.map((t) => t.text).join(' ')
  })
}

/**
 * Checks whether an error thrown by pdf.js is a PasswordException.
 * pdf.js sets `name` to "PasswordException" on these errors.
 */
function isPasswordException(err: unknown): boolean {
  if (err instanceof Error) {
    return err.name === 'PasswordException'
  }
  if (typeof err === 'object' && err !== null) {
    return (err as Record<string, unknown>)['name'] === 'PasswordException'
  }
  return false
}
