// Page Splitter: a picked file → the Material to add, with one Page per page.
//
// A photo (JPG/PNG) is one Page. A PDF is split with pdf-lib into one
// single-page PDF per page, in order, so each Page is read and shown on its
// own. Runs anywhere (no canvas, no DOM).
import { PDFDocument } from 'pdf-lib'
import type { MaterialDraft, PageMime, PageOriginal } from '../store/store'

/** The file types the picker offers and the splitter accepts (the `accept` attribute). */
export const ACCEPTED_TYPES: readonly PageMime[] = ['application/pdf', 'image/jpeg', 'image/png']

/** Thrown for a file the splitter can't turn into Pages; the UI names the file. */
export class UnsupportedFileError extends Error {
  readonly fileName: string

  constructor(fileName: string) {
    super(`Unsupported file: ${fileName}`)
    this.name = 'UnsupportedFileError'
    this.fileName = fileName
  }
}

/** Thrown for a PDF that can't be opened (damaged, or really encrypted); the UI names the file. */
export class UnreadablePdfError extends Error {
  readonly fileName: string

  constructor(fileName: string, cause: unknown) {
    super(`Unreadable PDF: ${fileName}`, { cause })
    this.name = 'UnreadablePdfError'
    this.fileName = fileName
  }
}

/** The file's Pages' originals, in order. */
export async function splitIntoPages(file: File): Promise<PageOriginal[]> {
  const mime = ACCEPTED_TYPES.find((type) => type === file.type)
  if (!mime) throw new UnsupportedFileError(file.name)
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (mime !== 'application/pdf') return [{ bytes, mime }]
  let pages: Uint8Array<ArrayBuffer>[]
  try {
    pages = await splitPdf(bytes)
  } catch (error) {
    // pdf-lib fails in many ways (no header, broken structure, ...): all mean "can't open it".
    throw new UnreadablePdfError(file.name, error)
  }
  if (pages.length === 0) throw new UnreadablePdfError(file.name, 'no pages')
  return pages.map((page) => ({ bytes: page, mime }))
}

/** One single-page PDF per page of the PDF, in order. */
async function splitPdf(bytes: Uint8Array<ArrayBuffer>) {
  // ignoreEncryption: scanner PDFs often carry an owner password only.
  const source = await PDFDocument.load(bytes, { ignoreEncryption: true })
  const pages: Uint8Array<ArrayBuffer>[] = []
  for (const index of source.getPageIndices()) {
    const single = await PDFDocument.create()
    const [page] = await single.copyPages(source, [index])
    single.addPage(page)
    // slice(): a Uint8Array<ArrayBuffer> of exactly the saved bytes.
    pages.push((await single.save()).slice())
  }
  return pages
}

/** The Material a file becomes, named after the file without its extension. */
export async function materialFromFile(file: File): Promise<MaterialDraft> {
  return {
    name: file.name.replace(/\.[^.]+$/, ''),
    sourceFileName: file.name,
    pages: await splitIntoPages(file),
  }
}
