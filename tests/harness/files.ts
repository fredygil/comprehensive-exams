// Files the Student picks with the file picker, for `user.upload(...)`.
// The bytes don't need to be a real image: jsdom never decodes them.

/** A JPG or PNG photo; the bytes default to something unique to its name. */
export function photo(name: string, bytes: string = `photo bytes of ${name}`) {
  const type = name.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg'
  return new File([new TextEncoder().encode(bytes)], name, { type })
}

/** The data URL a file's bytes become, e.g. 'data:image/png;base64,...'. */
export function dataUrlOf(type: string, bytes: string) {
  return `data:${type};base64,${Buffer.from(bytes).toString('base64')}`
}
