import { useCallback, useState } from 'react'
import { GatewayError } from '../gateway/errors'
import { strings } from '../strings'

/**
 * A model call started from a screen (a Summary, an Explainer, a quiz...).
 * `run(call)` clears the last failure, runs the call and returns its result;
 * if it throws a GatewayError, `error` becomes its Spanish message and `run`
 * returns undefined (anything else is thrown on). Nothing is lost on failure,
 * so she can try again. Show `error` with <ModelCallError>.
 */
export function useModelCall() {
  const [error, setError] = useState<string | null>(null)
  const run = useCallback(async <T>(call: () => Promise<T>): Promise<T | undefined> => {
    setError(null)
    try {
      return await call()
    } catch (failure) {
      if (!(failure instanceof GatewayError)) throw failure
      setError(strings.errors[failure.kind])
      return undefined
    }
  }, [])
  return { error, run }
}
