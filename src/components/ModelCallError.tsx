/** Why the last model call failed (useModelCall's `error`), or nothing. */
export function ModelCallError({ error }: { error: string | null }) {
  if (!error) return null
  return (
    <p role="alert" className="error">
      {error}
    </p>
  )
}
