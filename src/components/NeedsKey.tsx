// The "configura la clave" state for AI-dependent features.
//
//   const hasKey = useHasKey()
//   <button disabled={!hasKey}>Generar resumen</button>
//   {hasKey === false && <NeedsKeyNotice />}
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router'
import { useServices } from '../app/services'
import { strings } from '../strings'

/** true / false once known; undefined while the Store is still loading. */
export function useHasKey(): boolean | undefined {
  const { store } = useServices()
  return useLiveQuery(async () => (await store.getOpenRouterKey()) !== null, [store])
}

export function NeedsKeyNotice() {
  return (
    <div className="notice" role="note">
      <p>{strings.needsKey.message}</p>
      <Link to="/ajustes">{strings.needsKey.action}</Link>
    </div>
  )
}
