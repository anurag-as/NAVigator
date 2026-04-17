import { PDFLoadError, PDFPasswordError } from './types'

export interface RawPage {
  pageNumber: number
  lines: string[]
}

// pdfjsLib is loaded from CDN as a global; declare it to satisfy TypeScript.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const pdfjsLib: any

interface LineGroup {
  y: number
  texts: Array<{ x: number; text: string }>
}

export async function loadAndExtract(buffer: ArrayBuffer, password: string): Promise<RawPage[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pdfDocument: any

  try {
    const loadingTask = pdfjsLib.getDocument({ data: buffer, password })
    pdfDocument = await loadingTask.promise
  } catch (err: unknown) {
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
      pages.push({ pageNumber: pageNum, lines: groupItemsIntoLines(textContent.items) })
    }
  } catch (err: unknown) {
    throw new PDFLoadError(
      'Failed to extract text from PDF.' + (err instanceof Error ? ` (${err.message})` : ''),
    )
  }

  return pages
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function groupItemsIntoLines(items: any[]): string[] {
  if (items.length === 0) return []

  const Y_TOLERANCE = 2
  const lineGroups: LineGroup[] = []

  for (const item of items) {
    const str: string = typeof item.str === 'string' ? item.str : ''
    if (!str.trim()) continue

    const y: number = item.transform[5] as number
    const x: number = item.transform[4] as number

    const group = lineGroups.find((g) => Math.abs(g.y - y) <= Y_TOLERANCE)

    if (group) {
      group.texts.push({ x, text: str })
    } else {
      lineGroups.push({ y, texts: [{ x, text: str }] })
    }
  }

  lineGroups.sort((a, b) => b.y - a.y)

  return lineGroups.map((group) => {
    group.texts.sort((a, b) => a.x - b.x)
    return group.texts.map((t) => t.text).join(' ')
  })
}

function isPasswordException(err: unknown): boolean {
  if (err instanceof Error) {
    return err.name === 'PasswordException'
  }
  if (typeof err === 'object' && err !== null) {
    return (err as Record<string, unknown>)['name'] === 'PasswordException'
  }
  return false
}
