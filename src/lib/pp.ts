import { isGameMode, type GameMode } from './mode'
import type { Beatmap, Performance, PerformanceAttributes } from 'rosu-pp-js'
import { proxyCall } from './osu'

/**
 * Max-PP ranges (2026-10-29): the PP for a perfect score (SS,
 * NoMod, lazer scoring) per difficulty, computed with rosu-pp-js
 * — the WASM port of the osu!lazer calculators — from the real
 * `.osu` file text. NEVER a hand-rolled formula (standing rework
 * rule): the numbers track upstream by dependency bump, and the
 * cache key carries the calculator version so a bump invalidates
 * every stored value automatically.
 *
 * DELIVERY (probe-verified 2026-10-29): the BUNDLER build is
 * installed from the author's published release tarball
 * (rosu_pp_js_bundler.tar.gz) — never the npm-registry artifact,
 * whose Node-target glue cannot initialise in a browser. Vite
 * bundles the .wasm natively, no plugin. The .wasm is fetched by
 * npm at build time, so it never enters a snapshot push.
 *
 * CURRENCY (mandatory labelling, see BeatmapRow): rosu-pp-js
 * 4.0.1 ports the October 2025 upstream commits and has NOT
 * absorbed the July 3, 2026 rework (Reading skill, harmonic
 * speed summation) for osu/taiko/catch. Shipped numbers for
 * those modes are exact-for-October-2025 and must be labelled
 * as such, never presented as current-formula. Mania was
 * untouched by the July 2026 rework and is current.
 */

// ---------------------------------------------------------------------------
// Calculator identity (version-checked by tests against the installed
// package — bump the constant WITH the dependency, or the test fails)
// ---------------------------------------------------------------------------

/**
 * Installed rosu-pp-js version. Deliberately a plain constant, not
 * a JSON import: tsconfig has no resolveJsonModule and the dep's
 * exports map is unknown, so an import would be fragile. The
 * `pp.test.ts` version check reads node_modules/rosu-pp-js/
 * package.json and fails loudly if the two ever disagree.
 */
export const ROSU_PP_VERSION = '4.0.1'

export const ROSU_PP_CALCULATOR_ID = `rosu-pp-js@${ROSU_PP_VERSION}`

/** Formula vintage shipped by rosu-pp-js 4.0.1 (October 2025 upstream). */
export const ROSU_PP_FORMULA_LABEL = 'Oct 2025'

/** Modes whose formula is current in the shipped calculator. */
export function ppFormulaIsCurrent(mode: GameMode): boolean {
  return mode === 'mania'
}

/** Staleness copy shown on PP values for reworked modes (BeatmapRow). */
export const PP_STALENESS_NOTE =
  'Max PP for a perfect score · October 2025 formula — the July 2026 rework is not yet in this calculator.'

// ---------------------------------------------------------------------------
// Inputs / range
// ---------------------------------------------------------------------------

export interface PpDifficultyInput {
  beatmapId: number
  /** The difficulty's own ruleset (computation follows it). */
  mode: GameMode
  /** .osu checksum when the payload carries it (exact version key). */
  checksum?: string
  /** Fallback version signal when no checksum is present. */
  lastUpdated?: string
}

export interface PpRange {
  min: number
  max: number
}

/**
 * Cache key for one difficulty: (beatmap id, revision, calculator
 * version). Revision prefers the .osu checksum (exact file
 * version), then last_updated, then the bare id. The calculator
 * version is always present, so a rework bump misses every old
 * entry and recomputes.
 */
export function ppCacheKey(input: PpDifficultyInput): string {
  const revision =
    typeof input.checksum === 'string' && input.checksum !== ''
      ? input.checksum
      : typeof input.lastUpdated === 'string' && input.lastUpdated !== ''
        ? input.lastUpdated
        : 'unversioned'
  return `${input.beatmapId}:${ROSU_PP_CALCULATOR_ID}:${revision}`
}

/** Min/max over the computed values; null when nothing computed. */
export function aggregatePpRange(values: readonly (number | null | undefined)[]): PpRange | null {
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  for (const v of values) {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) continue
    if (v < min) min = v
    if (v > max) max = v
  }
  if (min === Number.POSITIVE_INFINITY) return null
  return { min: Math.round(min), max: Math.round(max) }
}

/** `120–890 pp`, collapsing a single value to `456 pp`; `—` when none. */
export function formatPpRange(range: PpRange | null): string {
  if (!range) return '—'
  if (range.min === range.max) return `${range.min} pp`
  return `${range.min}–${range.max} pp`
}

// ---------------------------------------------------------------------------
// Cache (IndexedDB, memory fallback, injectable for tests)
// ---------------------------------------------------------------------------

export interface PpCacheRecord {
  pp: number
  version: string
  beatmapId: number
  storedAt: number
}

export interface PpCacheBackend {
  get(key: string): Promise<PpCacheRecord | null>
  set(key: string, record: PpCacheRecord): Promise<void>
  clear(): Promise<void>
}

const PP_DB_NAME = 'recosuk-pp-cache'
const PP_STORE_NAME = 'pp-values'
const PP_CACHE_MAX_ENTRIES = 1000

/** In-memory backend: the fallback when IndexedDB is unavailable. */
export class MemoryPpCache implements PpCacheBackend {
  private readonly map = new Map<string, PpCacheRecord>()

  async get(key: string): Promise<PpCacheRecord | null> {
    return this.map.get(key) ?? null
  }

  async set(key: string, record: PpCacheRecord): Promise<void> {
    // Re-insert to refresh LRU order, then evict oldest first.
    this.map.delete(key)
    this.map.set(key, record)
    while (this.map.size > PP_CACHE_MAX_ENTRIES) {
      const oldest = this.map.keys().next().value
      if (oldest === undefined) break
      this.map.delete(oldest)
    }
  }

  async clear(): Promise<void> {
    this.map.clear()
  }
}

function openPpDb(idb: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = idb.open(PP_DB_NAME, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(PP_STORE_NAME)) {
        const store = db.createObjectStore(PP_STORE_NAME, { keyPath: 'key' })
        store.createIndex('storedAt', 'storedAt')
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'))
    request.onblocked = () => reject(new Error('IndexedDB open blocked'))
  })
}

function idbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
  })
}

class IndexedDbPpCache implements PpCacheBackend {
  private dbPromise: Promise<IDBDatabase> | null = null
  private fallback: MemoryPpCache | null = null
  private readonly idb: IDBFactory

  constructor(idb: IDBFactory) {
    this.idb = idb
  }

  /** Null when IndexedDB is unusable — callers use the memory fallback. */
  private async ready(): Promise<IDBDatabase | null> {
    if (this.fallback) return null
    if (!this.dbPromise) {
      this.dbPromise = openPpDb(this.idb)
    }
    try {
      return await this.dbPromise
    } catch {
      this.fallback = new MemoryPpCache()
      this.dbPromise = null
      return null
    }
  }

  async get(key: string): Promise<PpCacheRecord | null> {
    const db = await this.ready()
    if (!db) return this.fallback?.get(key) ?? null
    try {
      const tx = db.transaction(PP_STORE_NAME, 'readonly')
      const record = await idbRequest(tx.objectStore(PP_STORE_NAME).get(key))
      if (!record || typeof record !== 'object') return null
      return record as PpCacheRecord
    } catch {
      return null
    }
  }

  async set(key: string, record: PpCacheRecord): Promise<void> {
    const db = await this.ready()
    if (!db) {
      await this.fallback?.set(key, record)
      return
    }
    try {
      const tx = db.transaction(PP_STORE_NAME, 'readwrite')
      const store = tx.objectStore(PP_STORE_NAME)
      store.put({ ...record, key })
      // Evict oldest-first when over the cap (storedAt index order).
      // count() runs after put() in this transaction, so it already
      // includes the record just written; never evict that record.
      // getAllKeys on the index returns keys in storedAt order.
      const count = await idbRequest(store.count())
      let excess = count - PP_CACHE_MAX_ENTRIES
      if (excess > 0) {
        const keys = await idbRequest(store.index('storedAt').getAllKeys())
        for (const cursorKey of keys) {
          if (excess <= 0) break
          if (cursorKey !== key) {
            store.delete(cursorKey)
            excess -= 1
          }
        }
      }
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'))
      })
    } catch {
      /* cache writes are best-effort; computation already succeeded */
    }
  }

  async clear(): Promise<void> {
    const db = await this.ready()
    if (!db) {
      await this.fallback?.clear()
      return
    }
    try {
      const tx = db.transaction(PP_STORE_NAME, 'readwrite')
      tx.objectStore(PP_STORE_NAME).clear()
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'))
      })
    } catch {
      /* ignore */
    }
  }
}

let defaultBackend: PpCacheBackend | null = null
let backendOverride: PpCacheBackend | null = null

/** Test hook: replace the cache backend (pass null to restore default). */
export function __setPpCacheBackendForTests(backend: PpCacheBackend | null): void {
  backendOverride = backend
  if (!backend) defaultBackend = null
}

function resolveBackend(): PpCacheBackend {
  if (backendOverride) return backendOverride
  if (defaultBackend) return defaultBackend
  const idb =
    typeof globalThis.indexedDB !== 'undefined' ? globalThis.indexedDB : null
  defaultBackend = idb ? new IndexedDbPpCache(idb) : new MemoryPpCache()
  return defaultBackend
}

async function readCachedPp(input: PpDifficultyInput): Promise<number | null> {
  try {
    const record = await resolveBackend().get(ppCacheKey(input))
    if (!record) return null
    // Stale calculator version = miss: recompute under the new formula.
    if (record.version !== ROSU_PP_VERSION) return null
    if (typeof record.pp !== 'number' || !Number.isFinite(record.pp) || record.pp < 0) {
      return null
    }
    return record.pp
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Engine (rosu-pp-js, behind an injectable seam for tests)
// ---------------------------------------------------------------------------

type RosuModule = typeof import('rosu-pp-js')

/** Minimal engine surface: max PP for a perfect play from .osu text. */
export interface PpEngine {
  computeMaxPp(osuText: string, mode: GameMode): number | null
}

function computeWithRosu(rosu: RosuModule, osuText: string, mode: GameMode): number | null {
  if (typeof osuText !== 'string' || !osuText.startsWith('osu file format v')) return null
  let map: Beatmap | null = null
  let perf: Performance | null = null
  let attrs: PerformanceAttributes | null = null
  try {
    map = new rosu.Beatmap(osuText)
    // Suspicious maps (limit-testers, not real gameplay) are
    // skipped by the library's own guidance: no PP, never a crash.
    if (map.isSuspicious()) return null
    const expected = {
      osu: rosu.GameMode.Osu,
      taiko: rosu.GameMode.Taiko,
      fruits: rosu.GameMode.Catch,
      mania: rosu.GameMode.Mania,
    }[mode]
    // Native difficulties already match; converts are converted so
    // the number follows the difficulty's declared mode.
    if (map.mode !== expected) {
      map.convert(expected)
    }
    // No score args + mods 0 + lazer = the SS/NoMod maximum.
    perf = new rosu.Performance({ mods: 0, lazer: true })
    attrs = perf.calculate(map)
    const pp = attrs.pp
    if (typeof pp !== 'number' || !Number.isFinite(pp) || pp < 0) return null
    return pp
  } catch {
    return null
  } finally {
    // WASM heap objects must be freed or the heap leaks per row.
    try {
      attrs?.free()
    } catch {
      /* ignore */
    }
    try {
      perf?.free()
    } catch {
      /* ignore */
    }
    try {
      map?.free()
    } catch {
      /* ignore */
    }
  }
}

let realEnginePromise: Promise<PpEngine> | null = null

/**
 * Shape check for the dynamically imported rosu-pp-js module.
 *
 * The bundler glue (`rosu_pp_js.js`) is 3 lines and has NO init
 * export to await: it imports the .wasm as an ES module and calls
 * `__wbg_set_wasm` at module top level, and the built chunk awaits
 * instantiation (top-level await) before the module resolves — so
 * `await import('rosu-pp-js')` already returns a fully-initialised
 * module. Verified against the installed glue 2026-10-30; do NOT
 * add an init call (there is none to call). This check exists for
 * the opposite failure: a broken/stale chunk resolving to a module
 * without the classes the engine needs. That used to surface as a
 * confusing TypeError deep in the compute call; now it fails here,
 * and the caller degrades to `—`.
 */
export function isValidRosuModule(mod: unknown): mod is RosuModule {
  if (!mod || typeof mod !== 'object') return false
  const m = mod as Partial<RosuModule>
  return (
    typeof m.Beatmap === 'function' &&
    typeof m.Performance === 'function' &&
    !!m.GameMode &&
    typeof (m.GameMode as { Osu?: unknown }).Osu === 'number'
  )
}

function loadRealEngine(): Promise<PpEngine> {
  if (!realEnginePromise) {
    realEnginePromise = (async (): Promise<PpEngine> => {
      const rosu = await import('rosu-pp-js')
      if (!isValidRosuModule(rosu)) {
        throw new Error('rosu-pp-js module shape is unexpected')
      }
      return { computeMaxPp: (osuText, mode) => computeWithRosu(rosu, osuText, mode) }
    })()
    realEnginePromise.catch(() => {
      realEnginePromise = null
    })
  }
  return realEnginePromise
}

// ---------------------------------------------------------------------------
// Fetch + compute orchestration (cache-first, deduped, throttled)
// ---------------------------------------------------------------------------

export interface PpComputeDeps {
  /** Injected engine (tests) or a promise of one; default: real WASM. */
  engine?: PpEngine | Promise<PpEngine>
  /** Injected .osu fetcher (tests); default: the osu-proxy action. */
  fetchOsuFile?: (beatmapId: number) => Promise<string | null>
}

async function defaultFetchOsuFile(beatmapId: number): Promise<string | null> {
  // Never send an invalid id to the proxy: the function 400s on it
  // and the console fills with failed requests for a row that could
  // never compute. A bad id is a local null, not a network call.
  if (!Number.isInteger(beatmapId) || beatmapId <= 0) return null
  try {
    const res = await proxyCall<{ beatmapId: number; osuFile: string }>('getBeatmapFile', {
      beatmapId,
    })
    if (!res || typeof res.osuFile !== 'string') return null
    if (!res.osuFile.startsWith('osu file format v')) return null
    return res.osuFile
  } catch {
    return null
  }
}

/** At most 3 .osu fetch+compute jobs in flight across all rows. */
const MAX_PP_CONCURRENT = 3
let ppActive = 0
const ppWaiters: Array<() => void> = []

async function withPpSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (ppActive >= MAX_PP_CONCURRENT) {
    await new Promise<void>((resolve) => {
      ppWaiters.push(resolve)
    })
  }
  ppActive += 1
  try {
    return await fn()
  } finally {
    ppActive -= 1
    ppWaiters.shift()?.()
  }
}

/** One computation per difficulty id, shared across mounted rows. */
const ppInflight = new Map<string, Promise<number | null>>()

async function computeAndCache(
  input: PpDifficultyInput,
  engine: PpEngine,
  fetchOsuFile: (beatmapId: number) => Promise<string | null>,
): Promise<number | null> {
  try {
    const cached = await readCachedPp(input)
    if (cached !== null) return cached
    const osuFile = await fetchOsuFile(input.beatmapId)
    if (!osuFile) return null
    const pp = engine.computeMaxPp(osuFile, input.mode)
    if (pp === null) return null
    // Failures are never cached: a retry on the next view is honest.
    try {
      await resolveBackend().set(ppCacheKey(input), {
        pp,
        version: ROSU_PP_VERSION,
        beatmapId: input.beatmapId,
        storedAt: Date.now(),
      })
    } catch {
      /* cache writes are best-effort */
    }
    return pp
  } catch {
    return null
  }
}

/** A difficulty the PP path may safely touch: numeric positive id + known mode. */
export function isValidPpDifficultyInput(input: unknown): input is PpDifficultyInput {
  if (!input || typeof input !== 'object') return false
  const { beatmapId, mode } = input as Partial<PpDifficultyInput>
  return (
    typeof beatmapId === 'number' &&
    Number.isInteger(beatmapId) &&
    beatmapId > 0 &&
    isGameMode(mode)
  )
}

function dedupedCompute(
  input: PpDifficultyInput,
  engine: PpEngine,
  fetchOsuFile: (beatmapId: number) => Promise<string | null>,
): Promise<number | null> {
  // A malformed difficulty (undefined entry, bad id, unknown mode)
  // must never throw out of the range computation: it is a local
  // null, and the other difficulties still compute.
  if (!isValidPpDifficultyInput(input)) return Promise.resolve(null)
  const key = ppCacheKey(input)
  const existing = ppInflight.get(key)
  if (existing) return existing
  const p = withPpSlot(() => computeAndCache(input, engine, fetchOsuFile)).finally(() => {
    if (ppInflight.get(key) === p) ppInflight.delete(key)
  })
  ppInflight.set(key, p)
  return p
}

/**
 * Max-PP range over a set's difficulties. Cache-first (no fetch
 * for cached difficulties), lazy WASM init only when at least one
 * difficulty misses, and never throws: any failure degrades to
 * the computed subset, or null when nothing computed.
 */
export async function getPpRange(
  difficulties: readonly PpDifficultyInput[],
  deps: PpComputeDeps = {},
): Promise<PpRange | null> {
  if (!Array.isArray(difficulties) || difficulties.length === 0) return null
  const values: (number | null)[] = await Promise.all(
    difficulties.map((d) => readCachedPp(d).catch(() => null)),
  )
  const missingIdx: number[] = []
  values.forEach((v, i) => {
    if (v === null) missingIdx.push(i)
  })
  if (missingIdx.length > 0) {
    let engine: PpEngine | null = null
    try {
      engine = await (deps.engine ?? loadRealEngine())
    } catch {
      engine = null
    }
    if (engine) {
      const fetchFn = deps.fetchOsuFile ?? defaultFetchOsuFile
      try {
        const computed = await Promise.all(
          missingIdx.map((i) => dedupedCompute(difficulties[i], engine as PpEngine, fetchFn)),
        )
        computed.forEach((pp, j) => {
          values[missingIdx[j]] = pp
        })
      } catch {
        // A compute failure must never reject the range: keep the
        // cache hits (and nulls) already collected above.
      }
    }
  }
  return aggregatePpRange(values)
}
