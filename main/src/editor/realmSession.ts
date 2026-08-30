import { Realm } from '@mdxeditor/gurx'

const realmCleanups = new WeakMap<Realm, Set<() => void>>()

export function registerRealmCleanup(realm: Realm, cleanup: () => void): () => void {
  let cleanups = realmCleanups.get(realm)
  if (!cleanups) {
    cleanups = new Set()
    realmCleanups.set(realm, cleanups)
  }
  cleanups.add(cleanup)
  return () => {
    cleanups.delete(cleanup)
  }
}

export function disposeRealmSession(realm: Realm): void {
  const cleanups = realmCleanups.get(realm)
  realmCleanups.delete(realm)
  if (!cleanups) {
    return
  }

  let hasError = false
  let firstError: unknown
  for (const cleanup of [...cleanups].reverse()) {
    try {
      cleanup()
    } catch (error) {
      if (!hasError) {
        hasError = true
        firstError = error
      }
    }
  }
  if (hasError) {
    throw firstError instanceof Error ? firstError : new Error('Realm cleanup failed with a non-Error value')
  }
}
