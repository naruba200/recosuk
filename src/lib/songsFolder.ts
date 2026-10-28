/**
 * osu! Songs-folder handle storage (QA batch 2, item 8).
 *
 * The File System Access API lets a page write straight into a
 * user-picked folder (Chromium desktop only). The directory handle
 * MUST live in IndexedDB — handles are not serializable, so
 * localStorage cannot hold them. Only the folder's display NAME is
 * kept in localStorage (via the download-settings store) so Settings
 * can show it without an IndexedDB read.
 *
 * Support matrix (verified by web search, 2026-10-29):
 *   Chrome 86+ / Edge 86+ / Opera 72+ (desktop): full pickers.
 *   Firefox: no pickers (OPFS only). Safari: no pickers (OPFS only).
 *   Mobile browsers: no pickers. Brave ships them switched off.
 * Always feature-detect: `isFileSystemAccessSupported()`.
 *
 * The stored permission can be revoked by the browser/user at any
 * time; every write re-checks it (`ensureFolderPermission`) and a
 * denial is reported honestly, never silently swallowed. Handles are
 * scoped to the picked folder only — the page can never write
 * outside it.
 */

const DB_NAME = 'recosuk-songs-folder'
const STORE_NAME = 'handles'
const HANDLE_KEY = 'songs-folder'

export interface NameStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

const FOLDER_NAME_KEY = 'recosuk-songs-folder-name'

function defaultNameStorage(): NameStorage | null {
  try {
    const ls = globalThis.localStorage
    if (!ls) return null
    return {
      getItem: (k) => ls.getItem(k),
      setItem: (k, v) => ls.setItem(k, v),
      removeItem: (k) => ls.removeItem(k),
    }
  } catch {
    return null
  }
}

export interface SongsFolderStoreDeps {
  indexedDB?: IDBFactory
  nameStorage?: NameStorage | null
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
  })
}

async function openDb(idb: IDBFactory): Promise<IDBDatabase> {
  const request = idb.open(DB_NAME, 1)
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains(STORE_NAME)) {
      request.result.createObjectStore(STORE_NAME)
    }
  }
  return requestToPromise(request)
}

export function createSongsFolderStore(deps: SongsFolderStoreDeps = {}) {
  const idb = deps.indexedDB ?? globalThis.indexedDB
  const names = deps.nameStorage !== undefined ? deps.nameStorage : defaultNameStorage()

  async function saveHandle(handle: FileSystemDirectoryHandle): Promise<void> {
    if (!idb) throw new Error('IndexedDB is unavailable')
    const db = await openDb(idb)
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      // Awaiting the put request's success is sufficient: later
      // transactions (including the next loadHandle) see the value.
      await requestToPromise(tx.objectStore(STORE_NAME).put(handle, HANDLE_KEY))
    } finally {
      db.close()
    }
    try {
      names?.setItem(FOLDER_NAME_KEY, handle.name)
    } catch {
      /* display name is best-effort */
    }
  }

  async function loadHandle(): Promise<FileSystemDirectoryHandle | null> {
    if (!idb) return null
    try {
      const db = await openDb(idb)
      try {
        const tx = db.transaction(STORE_NAME, 'readonly')
        const handle = await requestToPromise(
          tx.objectStore(STORE_NAME).get(HANDLE_KEY) as IDBRequest<FileSystemDirectoryHandle | undefined>,
        )
        return handle ?? null
      } finally {
        db.close()
      }
    } catch {
      return null
    }
  }

  async function forgetHandle(): Promise<void> {
    if (idb) {
      try {
        const db = await openDb(idb)
        try {
          const tx = db.transaction(STORE_NAME, 'readwrite')
          await requestToPromise(tx.objectStore(STORE_NAME).delete(HANDLE_KEY))
        } finally {
          db.close()
        }
      } catch {
        /* forgetting is best-effort */
      }
    }
    try {
      names?.removeItem(FOLDER_NAME_KEY)
    } catch {
      /* ignore */
    }
  }

  function getFolderName(): string | null {
    try {
      return names?.getItem(FOLDER_NAME_KEY) ?? null
    } catch {
      return null
    }
  }

  return { saveHandle, loadHandle, forgetHandle, getFolderName }
}

/** Default store backed by the real IndexedDB + localStorage. */
export const songsFolderStore = createSongsFolderStore()

/** True only where the real folder pickers exist (Chromium desktop). */
export function isFileSystemAccessSupported(): boolean {
  try {
    const w = globalThis.window as
      | { showDirectoryPicker?: unknown }
      | undefined
    if (typeof w?.showDirectoryPicker === 'function') return true
    const g = globalThis as { showDirectoryPicker?: unknown }
    return typeof g.showDirectoryPicker === 'function'
  } catch {
    return false
  }
}

/**
 * Re-check (and if needed re-request) read/write permission for a
 * stored handle. Must be called from a user gesture when a prompt is
 * needed — download clicks qualify. Returns false on denial/error.
 *
 * NOTE: this build's DOM lib does not type the permission methods on
 * FileSystemDirectoryHandle, so they are reached through a structural
 * interface and feature-detected at runtime.
 */
interface PermissionedDirectoryHandle extends FileSystemDirectoryHandle {
  queryPermission?: (descriptor: { mode: 'readwrite' }) => Promise<PermissionState>
  requestPermission?: (descriptor: { mode: 'readwrite' }) => Promise<PermissionState>
}

export async function ensureFolderPermission(
  handle: FileSystemDirectoryHandle,
): Promise<boolean> {
  try {
    const permissioned = handle as PermissionedDirectoryHandle
    if (typeof permissioned.queryPermission === 'function') {
      if ((await permissioned.queryPermission({ mode: 'readwrite' })) === 'granted') return true
    }
    if (typeof permissioned.requestPermission === 'function') {
      return (await permissioned.requestPermission({ mode: 'readwrite' })) === 'granted'
    }
    // Handles without a permission API (older Chromium): the write
    // itself is the check — report its outcome honestly downstream.
    return true
  } catch {
    return false
  }
}

/**
 * Ask the user to pick their osu! Songs folder and persist the
 * handle. Returns null when the API is unavailable or the user
 * cancels (AbortError) — both are ordinary, not errors.
 */
export async function pickSongsFolder(
  store: ReturnType<typeof createSongsFolderStore> = songsFolderStore,
): Promise<FileSystemDirectoryHandle | null> {
  if (!isFileSystemAccessSupported()) return null
  try {
    const w = globalThis.window as unknown as {
      showDirectoryPicker: (opts?: { mode?: string }) => Promise<FileSystemDirectoryHandle>
    }
    const handle = await w.showDirectoryPicker({ mode: 'readwrite' })
    await store.saveHandle(handle)
    return handle
  } catch {
    return null
  }
}
