import { describe, expect, it, beforeEach } from 'vitest'
import { createSongsFolderStore, isFileSystemAccessSupported, isTauriShell } from '../songsFolder'

/**
 * Minimal in-memory IndexedDB fake: only the surface the store uses
 * (open + onupgradeneeded, transaction, put/get/delete requests).
 * Requests settle on microtasks, like the real API; onupgradeneeded
 * fires before onsuccess on first creation, mirroring the real
 * open flow.
 */

type Handler = ((event: unknown) => void) | null

interface FakeRequestLike {
  result: unknown
  error: unknown
  onsuccess: Handler
  onerror: Handler
  onupgradeneeded: Handler
}

function makeRequest(run: () => unknown): FakeRequestLike {
  const req: FakeRequestLike = {
    result: undefined,
    error: null,
    onsuccess: null,
    onerror: null,
    onupgradeneeded: null,
  }
  queueMicrotask(() => {
    try {
      req.result = run()
      req.onsuccess?.({})
    } catch (err) {
      req.error = err
      req.onerror?.({})
    }
  })
  return req
}

class FakeObjectStore {
  private map: Map<unknown, unknown>
  constructor(map: Map<unknown, unknown>) {
    this.map = map
  }
  put(value: unknown, key: unknown): FakeRequestLike {
    return makeRequest(() => {
      this.map.set(key, value)
      return key
    })
  }
  get(key: unknown): FakeRequestLike {
    return makeRequest(() => this.map.get(key))
  }
  delete(key: unknown): FakeRequestLike {
    return makeRequest(() => {
      this.map.delete(key)
      return undefined
    })
  }
}

class FakeTransaction {
  private map: Map<unknown, unknown>
  constructor(map: Map<unknown, unknown>) {
    this.map = map
  }
  objectStore(): FakeObjectStore {
    return new FakeObjectStore(this.map)
  }
}

class FakeDatabase {
  stores = new Map<string, Map<unknown, unknown>>()
  objectStoreNames = {
    contains: (name: string) => this.stores.has(name),
  }
  createObjectStore(name: string): unknown {
    if (!this.stores.has(name)) this.stores.set(name, new Map())
    return {}
  }
  transaction(storeName: string): FakeTransaction {
    const map = this.stores.get(storeName) ?? new Map()
    this.stores.set(storeName, map)
    return new FakeTransaction(map)
  }
  close(): void {}
}

class FakeIDBFactory {
  dbs = new Map<string, FakeDatabase>()
  open(name: string): FakeRequestLike {
    const req: FakeRequestLike = {
      result: undefined,
      error: null,
      onsuccess: null,
      onerror: null,
      onupgradeneeded: null,
    }
    queueMicrotask(() => {
      let db = this.dbs.get(name)
      const isNew = !db
      if (!db) {
        db = new FakeDatabase()
        this.dbs.set(name, db)
      }
      req.result = db
      if (isNew) req.onupgradeneeded?.({})
      req.onsuccess?.({})
    })
    return req
  }
}

function memoryNameStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v)
    },
    removeItem: (k: string) => {
      map.delete(k)
    },
  }
}

const fakeHandle = (name: string) =>
  ({ name, kind: 'directory' }) as unknown as FileSystemDirectoryHandle

describe('songsFolderStore (IndexedDB stubbed)', () => {
  let idb: FakeIDBFactory
  let names: ReturnType<typeof memoryNameStorage>

  beforeEach(() => {
    idb = new FakeIDBFactory()
    names = memoryNameStorage()
  })

  function store() {
    return createSongsFolderStore({
      indexedDB: idb as unknown as IDBFactory,
      nameStorage: names,
    })
  }

  it('round-trips a handle through save/load and reports the folder name', async () => {
    const s = store()
    await s.saveHandle(fakeHandle('Songs'))
    const loaded = await s.loadHandle()
    expect(loaded).toBeDefined()
    expect((loaded as unknown as { name: string }).name).toBe('Songs')
    expect(s.getFolderName()).toBe('Songs')
  })

  it('returns null when nothing was saved', async () => {
    const s = store()
    expect(await s.loadHandle()).toBeNull()
    expect(s.getFolderName()).toBeNull()
  })

  it('forgetHandle clears both the handle and the display name', async () => {
    const s = store()
    await s.saveHandle(fakeHandle('Songs'))
    await s.forgetHandle()
    expect(await s.loadHandle()).toBeNull()
    expect(s.getFolderName()).toBeNull()
  })

  it('overwriting the handle replaces it', async () => {
    const s = store()
    await s.saveHandle(fakeHandle('Old'))
    await s.saveHandle(fakeHandle('New'))
    expect(((await s.loadHandle()) as unknown as { name: string }).name).toBe('New')
    expect(s.getFolderName()).toBe('New')
  })

  it('loadHandle returns null when IndexedDB is unavailable', async () => {
    const s = createSongsFolderStore({
      indexedDB: undefined,
      nameStorage: names,
    })
    // No global indexedDB in the node test env, so this must not throw.
    expect(await s.loadHandle()).toBeNull()
  })
})

describe('isFileSystemAccessSupported', () => {
  it('is false without a window picker (node test env)', () => {
    expect(isFileSystemAccessSupported()).toBe(false)
  })
})

describe('isTauriShell (guarded presence check, copy-only)', () => {
  it('is false for a plain window object', () => {
    expect(isTauriShell({})).toBe(false)
    expect(isTauriShell({ showDirectoryPicker: () => {} })).toBe(false)
  })

  it('is true when __TAURI__ is present', () => {
    expect(isTauriShell({ __TAURI__: {} })).toBe(true)
    expect(isTauriShell({ __TAURI__: undefined })).toBe(true)
  })

  it('is false (never throws) for non-objects and no window', () => {
    expect(isTauriShell(null)).toBe(false)
    expect(isTauriShell(undefined)).toBe(false)
    expect(isTauriShell('tauri')).toBe(false)
    expect(isTauriShell()).toBe(false)
  })
})
