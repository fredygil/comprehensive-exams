// Page Splitter: a picked file → the Material to add, with one Page per page.
//
// A photo (JPG/PNG) is one Page. Runs anywhere (no canvas, no DOM).
import type { MaterialDraft, PageMime, PageOriginal } from '../store/store'

/** The file types the picker offers and the splitter accepts (the `accept` attribute). */
export const ACCEPTED_TYPES: readonly PageMime[] = ['image/jpeg', 'image/png']

/** Thrown for a file the splitter can't turn into Pages; the UI names the file. */
export class UnsupportedFileError extends Error {
  readonly fileName: string

  constructor(fileName: string) {
    super(`Unsupported file: ${fileName}`)
    this.name = 'UnsupportedFileError'
    this.fileName = fileName
  }
}

/** The file's Pages' originals, in order. */
export async function splitIntoPages(file: File): Promise<PageOriginal[]> {
  const mime = ACCEPTED_TYPES.find((type) => type === file.type)
  if (!mime) throw new UnsupportedFileError(file.name)
  return [{ bytes: new Uint8Array(await file.arrayBuffer()), mime }]
}

/** The Material a file becomes, named after the file without its extension. */
export async function materialFromFile(file: File): Promise<MaterialDraft> {
  return {
    name: file.name.replace(/\.[^.]+$/, ''),
    sourceFileName: file.name,
    pages: await splitIntoPages(file),
  }
}
