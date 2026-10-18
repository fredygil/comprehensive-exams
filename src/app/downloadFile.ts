/**
 * Saves a file the way the browser saves downloads (on Android, to the
 * Downloads folder, from where it can go to Drive).
 */
export function downloadFile(file: File) {
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = file.name
  document.body.append(link)
  link.click()
  link.remove()
  // Give the browser time to start the download before the URL goes.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
