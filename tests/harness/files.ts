// Files the Student picks with the file picker, for `user.upload(...)`.
// The bytes don't need to be a real image: jsdom never decodes them.
import { PDFDocument } from 'pdf-lib'

/** A JPG or PNG photo; the bytes default to something unique to its name. */
export function photo(name: string, bytes: string = `photo bytes of ${name}`) {
  const type = name.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg'
  return new File([new TextEncoder().encode(bytes)], name, { type })
}

/** The data URL a file's bytes become, e.g. 'data:image/png;base64,...'. */
export function dataUrlOf(type: string, bytes: string) {
  return `data:${type};base64,${Buffer.from(bytes).toString('base64')}`
}

/**
 * A PDF like the ones Drive's scanner makes, with `pageCount` pages. Page n is
 * (300 + n) points wide, so a split-off Page can be told apart with
 * `pdfPageNumber` (pdf-lib can't read text back).
 */
export async function pdf(name: string, pageCount: number) {
  const doc = await PDFDocument.create()
  for (let n = 1; n <= pageCount; n++) doc.addPage([300 + n, 400])
  return new File([(await doc.save()).slice()], name, { type: 'application/pdf' })
}

/** Which page of a `pdf()` a single-page PDF is (1-based); throws unless it has exactly one page. */
export async function pdfPageNumber(bytes: Uint8Array) {
  // new Uint8Array: pdf-lib's instanceof checks fail on bytes from another realm.
  const doc = await PDFDocument.load(new Uint8Array(bytes))
  if (doc.getPageCount() !== 1) throw new Error(`expected 1 page, got ${doc.getPageCount()}`)
  return doc.getPage(0).getWidth() - 300
}

/** The bytes inside a base64 data URL ('data:application/pdf;base64,...'). */
export function bytesOfDataUrl(url: string) {
  return new Uint8Array(Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'))
}
