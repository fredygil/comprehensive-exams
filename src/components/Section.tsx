import { useId, type ReactNode } from 'react'

/** A titled part of a screen; exposed to tests as `getByRole('region', { name: title })`. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="card">
      <h2 id={id}>{title}</h2>
      {children}
    </section>
  )
}
