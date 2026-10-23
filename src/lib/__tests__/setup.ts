// Test setup: minimal in-memory localStorage so the zustand persist
// middleware in guestStore works under the node test environment.
class MemoryStorage implements Storage {
  private map = new Map<string, string>()
  get length(): number {
    return this.map.size
  }
  clear(): void {
    this.map.clear()
  }
  getItem(key: string): string | null {
    return this.map.get(key) ?? null
  }
  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null
  }
  removeItem(key: string): void {
    this.map.delete(key)
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value))
  }
}

// Node ≥22 exposes a stub localStorage that only works with a
// --localstorage-file flag and otherwise silently drops writes, so
// probe it for real and install the shim unless it genuinely stores.
let storageWorks = false
try {
  globalThis.localStorage.setItem('__probe__', '1')
  storageWorks = globalThis.localStorage.getItem('__probe__') === '1'
  globalThis.localStorage.removeItem('__probe__')
} catch {
  storageWorks = false
}
if (!storageWorks) {
  Object.defineProperty(globalThis, 'localStorage', {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
  })
}
