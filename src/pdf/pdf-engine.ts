import { PDFLoadError, PDFPasswordError } from '../core/types'

const PDFJS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs'
const WORKER_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs'

interface PdfjsTextItem {
  str: string
  transform: number[]
}

interface PdfjsTextContent {
  items: PdfjsTextItem[]
}

interface PdfjsPage {
  getTextContent(): Promise<PdfjsTextContent>
}

interface PdfjsDocument {
  numPages: number
  getPage(pageNum: number): Promise<PdfjsPage>
}

interface PdfjsLib {
  GlobalWorkerOptions: { workerSrc: string }
  getDocument(params: { data: ArrayBuffer; password: string }): { promise: Promise<PdfjsDocument> }
}

let pdfjsPromise: Promise<PdfjsLib> | null = null

function getPdfjs(): Promise<PdfjsLib> {
  if (!pdfjsPromise) {
    pdfjsPromise = import(/* @vite-ignore */ PDFJS_CDN)
      .then((mod: { default?: PdfjsLib } & PdfjsLib) => {
        const lib = (mod.default ?? mod) as PdfjsLib
        lib.GlobalWorkerOptions.workerSrc = WORKER_CDN
        return lib
      })
      .catch((err: unknown) => {
        pdfjsPromise = null
        throw err
      })
  }
  return pdfjsPromise
}

export interface RawPage {
  pageNumber: number
  lines: string[]
}

interface LineGroup {
  y: number
  texts: Array<{ x: number; text: string }>
}

export async function loadAndExtract(buffer: ArrayBuffer, password: string): Promise<RawPage[]> {
  const pdfjsLib = await getPdfjs()

  let pdfDocument: PdfjsDocument

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

export function groupItemsIntoLines(items: PdfjsTextItem[]): string[] {
  if (items.length === 0) return []

  const Y_TOLERANCE = 2
  const lineGroups: LineGroup[] = []

  for (const item of items) {
    const str: string = typeof item.str === 'string' ? item.str : ''
    if (!str.trim()) continue

    const y: number = item.transform[5]
    const x: number = item.transform[4]

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

export function isPasswordException(err: unknown): boolean {
  if (err instanceof Error) {
    return err.name === 'PasswordException'
  }
  if (typeof err === 'object' && err !== null) {
    return (err as Record<string, unknown>)['name'] === 'PasswordException'
  }
  return false
}
