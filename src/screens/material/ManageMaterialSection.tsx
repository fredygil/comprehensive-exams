import { useState, type FormEvent } from 'react'
import { useServices } from '../../app/services'
import { Section } from '../../components/Section'
import type { Material } from '../../store/store'
import { strings } from '../../strings'

/** Renaming a Material. */
export function ManageMaterialSection({ material }: { material: Material }) {
  const { store } = useServices()
  const [name, setName] = useState(material.name)
  const text = strings.material.manage
  const changed = name.trim() !== material.name

  async function rename(event: FormEvent) {
    event.preventDefault()
    await store.renameMaterial(material.id, name)
  }

  return (
    <Section title={text.title}>
      <form onSubmit={rename} className="row">
        <label>
          {text.name}
          <input value={name} required onChange={(e) => setName(e.target.value)} />
        </label>
        <button type="submit" disabled={!name.trim() || !changed}>
          {text.rename}
        </button>
      </form>
    </Section>
  )
}
