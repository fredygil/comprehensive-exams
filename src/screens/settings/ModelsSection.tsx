import { useState, type FormEvent } from 'react'
import { useServices } from '../../app/services'
import { Section } from '../../components/Section'
import { DEFAULT_MODELS, JOBS, type Job } from '../../settings/models'
import { strings } from '../../strings'

export function ModelsSection({ savedModels }: { savedModels: Record<Job, string> }) {
  const { store } = useServices()
  const [models, setModels] = useState(savedModels)
  const [saved, setSaved] = useState(false)
  const text = strings.settings.models

  async function save(event: FormEvent) {
    event.preventDefault()
    await store.saveModels(models)
    setSaved(true)
  }

  async function reset() {
    await store.resetModels()
    setModels(DEFAULT_MODELS)
    setSaved(true)
  }

  return (
    <Section title={text.title}>
      <p className="hint">{text.help}</p>
      <form onSubmit={save} className="stack">
        {JOBS.map((job) => (
          <div key={job} className="field">
            <label htmlFor={`model-${job}`}>{text.jobs[job]}</label>
            <input
              id={`model-${job}`}
              aria-describedby={`model-${job}-default`}
              value={models[job]}
              placeholder={DEFAULT_MODELS[job]}
              spellCheck={false}
              autoCapitalize="off"
              onChange={(e) => {
                setModels({ ...models, [job]: e.target.value })
                setSaved(false)
              }}
            />
            <span id={`model-${job}-default`} className="hint">
              {text.defaultHint(DEFAULT_MODELS[job])}
            </span>
          </div>
        ))}
        <div className="row">
          <button type="submit">{text.save}</button>
          <button type="button" onClick={reset}>
            {text.reset}
          </button>
          {saved && <span role="status">{text.saved}</span>}
        </div>
      </form>
    </Section>
  )
}
