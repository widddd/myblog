import React from 'react'
import { Realm, RealmContext } from '@mdxeditor/gurx'
import { disposeRealmSession } from './realmSession'

/**
 * A plugin for the editor.
 * @group Core
 */
export interface RealmPlugin {
  init?: (realm: Realm) => void
  update?: (realm: Realm) => void
  postInit?: (realm: Realm) => void
}

/**
 * A function that creates an editor plugin.
 * @typeParam Params - The parameters for the plugin.
 * @group Core
 */
export function realmPlugin<Params>(plugin: {
  /**
   * Called when the MDXEditor component is mounted and the plugin is initialized.
   */
  init?: (realm: Realm, params?: Params) => void

  /**
   * Called after the MDXEditor component is mounted and all plugins are initialized.
   */
  postInit?: (realm: Realm, params?: Params) => void
  /**
   * Called on each re-render. Use this to update the realm with updated property values.
   */
  update?: (realm: Realm, params?: Params) => void
}): (params?: Params) => RealmPlugin {
  return function (params?: Params) {
    return {
      init: (realm: Realm) => plugin.init?.(realm, params),
      postInit: (realm: Realm) => plugin.postInit?.(realm, params),
      update: (realm: Realm) => plugin.update?.(realm, params)
    }
  }
}

/** @internal */
export function RealmWithPlugins({ children, plugins }: { children: React.ReactNode; plugins: RealmPlugin[] }) {
  const [theRealm, setTheRealm] = React.useState<Realm | null>(null)

  React.useEffect(() => {
    const realm = new Realm()
    try {
      for (const plugin of plugins) {
        plugin.init?.(realm)
      }
      for (const plugin of plugins) {
        plugin.postInit?.(realm)
      }
    } catch (error) {
      try {
        disposeRealmSession(realm)
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], 'Realm plugin initialization and cleanup both failed')
      }
      throw error
    }
    setTheRealm(realm)
    return () => {
      disposeRealmSession(realm)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  React.useEffect(() => {
    if (theRealm) {
      for (const plugin of plugins) {
        plugin.update?.(theRealm)
      }
    }
  })

  if (!theRealm) {
    return null
  }

  return <RealmContext.Provider value={theRealm}>{children}</RealmContext.Provider>
}
