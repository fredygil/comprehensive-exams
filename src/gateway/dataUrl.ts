/** Bytes as a data URL, e.g. 'data:image/png;base64,iVBOR...', for image and file parts. */
export function toDataUrl(bytes: Uint8Array<ArrayBuffer>, mime: string): Promise<string> {
  const blob = new Blob([bytes], { type: mime })
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}
