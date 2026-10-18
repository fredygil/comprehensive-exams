/**
 * Asks the browser not to evict the app's data when the tablet runs low on
 * space. Runs on every launch until granted: Chrome may refuse on the first
 * launch and grant later (for example once the app is installed).
 */
export async function requestPersistentStorage() {
  const storage = navigator.storage
  if (!storage?.persist) return
  try {
    if (await storage.persisted()) return
    await storage.persist()
  } catch {
    // Not fatal: the app works without it, the data is just evictable.
  }
}
