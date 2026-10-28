import { proxyCall } from './osu'
import { dataCache } from './dataCache'
import type { GameMode } from './mode'
import type { RecCandidate, SearchPage } from './recommend'

/**
 * Mirror search (QA batch 2, item 4): sort + advanced filters +
 * cursor pagination for the Mirror page, built on the osu!
 * beatmapsets/search API via the proxy.
 *
 * Query syntax (verified against the osu! wiki "Beatmap search"
 * page, 2026-10-29): the `q` string accepts `creator=`, `stars>=`,
 * `stars<=`, `bpm>=`, `bpm<=`, `ar>=`, `od>=`, `hp>=`, `cs>=`,
 * `length>=`/`length<=` (seconds), with comparison operators.
 * Status/genre/language/sort travel as the API's own `s`/`g`/`l`/
 * `sort` params (the Edge Function already passes them through).
 *
 * Client-side re-filtering (`mirrorCandidateMatches`) stays the
 * guarantee for everything the candidate shape carries (status,
 * creator, SR, BPM, length, AR, OD, CS). Genre, language and HP are
 * server-side only: candidates don't carry them, so they rely on
 * the `g`/`l` params and the `hp` query clause.
 */

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export type MirrorSort =
  | 'updated_desc'
  | 'updated_asc'
  | 'plays_desc'
  | 'favourites_desc'
  | 'rating_desc'
  | 'title_asc'
  | 'title_desc'

export const MIRROR_SORTS: { value: MirrorSort; label: string }[] = [
  { value: 'updated_desc', label: 'Newest first (upload date)' },
  { value: 'updated_asc', label: 'Oldest first' },
  { value: 'plays_desc', label: 'Most played' },
  { value: 'favourites_desc', label: 'Most favourited' },
  { value: 'rating_desc', label: 'Highest rated' },
  { value: 'title_asc', label: 'Title A–Z' },
  { value: 'title_desc', label: 'Title Z–A' },
]

/** osu! website default: newest first, like the site's listing. */
export const DEFAULT_MIRROR_SORT: MirrorSort = 'updated_desc'

export type MirrorStatus = 'any' | 'ranked' | 'loved' | 'qualified' | 'pending' | 'graveyard'

export const MIRROR_STATUSES: { value: MirrorStatus; label: string }[] = [
  { value: 'any', label: 'Any status' },
  { value: 'ranked', label: 'Ranked' },
  { value: 'loved', label: 'Loved' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'pending', label: 'Pending' },
  { value: 'graveyard', label: 'Graveyard' },
]

/** Genre/language ids are the osu! website's (BeatmapsetSearch). 0 = any. */
export const MIRROR_GENRES: { value: number; label: string }[] = [
  { value: 0, label: 'Any genre' },
  { value: 1, label: 'Unspecified' },
  { value: 2, label: 'Video Game' },
  { value: 3, label: 'Anime' },
  { value: 4, label: 'Rock' },
  { value: 5, label: 'Pop' },
  { value: 6, label: 'Other' },
  { value: 7, label: 'Novelty' },
  { value: 8, label: 'Hip Hop' },
  { value: 9, label: 'Electronic' },
  { value: 10, label: 'Metal' },
  { value: 11, label: 'Classical' },
  { value: 12, label: 'Folk' },
  { value: 13, label: 'Jazz' },
]

export const MIRROR_LANGUAGES: { value: number; label: string }[] = [
  { value: 0, label: 'Any language' },
  { value: 1, label: 'Unspecified' },
  { value: 2, label: 'English' },
  { value: 3, label: 'Japanese' },
  { value: 4, label: 'Chinese' },
  { value: 5, label: 'Instrumental' },
  { value: 6, label: 'Korean' },
  { value: 7, label: 'French' },
  { value: 8, label: 'German' },
  { value: 9, label: 'Swedish' },
  { value: 10, label: 'Spanish' },
  { value: 11, label: 'Italian' },
  { value: 12, label: 'Russian' },
  { value: 13, label: 'Polish' },
  { value: 14, label: 'Other' },
]

export interface RangeFilter {
  min: number | null
  max: number | null
}

export interface MirrorFilters {
  status: MirrorStatus
  genre: number
  language: number
  /** Mapper/creator name (substring server-side via `creator=`). */
  creator: string
  sr: RangeFilter
  bpm: RangeFilter
  /** Length in seconds. */
  lengthSec: RangeFilter
  ar: RangeFilter
  od: RangeFilter
  /** HP is server-side only (candidates carry no HP). */
  hp: RangeFilter
  cs: RangeFilter
}

export function defaultMirrorFilters(): MirrorFilters {
  const empty = (): RangeFilter => ({ min: null, max: null })
  return {
    status: 'any',
    genre: 0,
    language: 0,
    creator: '',
    sr: empty(),
    bpm: empty(),
    lengthSec: empty(),
    ar: empty(),
    od: empty(),
    hp: empty(),
    cs: empty(),
  }
}

function fmtNum(n: number): string {
  return String(Math.round(n * 100) / 100)
}

function rangeClauses(key: string, range: RangeFilter): string[] {
  const out: string[] = []
  if (range.min !== null && Number.isFinite(range.min)) out.push(`${key}>=${fmtNum(range.min)}`)
  if (range.max !== null && Number.isFinite(range.max)) out.push(`${key}<=${fmtNum(range.max)}`)
  return out
}

/**
 * Build the osu! `q` string: free text + creator + stat ranges.
 * A creator name containing whitespace is double-quoted (the site's
 * parser treats `creator="name here"` as one value); embedded quotes
 * are stripped so a name can never break out of the clause.
 */
export function buildMirrorQueryText(userText: string, filters: MirrorFilters): string {
  const parts: string[] = []
  const text = userText.trim()
  if (text) parts.push(text)
  const creator = filters.creator.trim().replace(/"/g, '')
  if (creator) {
    parts.push(/\s/.test(creator) ? `creator="${creator}"` : `creator=${creator}`)
  }
  parts.push(...rangeClauses('stars', filters.sr))
  parts.push(...rangeClauses('bpm', filters.bpm))
  parts.push(...rangeClauses('length', filters.lengthSec))
  parts.push(...rangeClauses('ar', filters.ar))
  parts.push(...rangeClauses('od', filters.od))
  parts.push(...rangeClauses('hp', filters.hp))
  parts.push(...rangeClauses('cs', filters.cs))
  return parts.join(' ')
}

// ---------------------------------------------------------------------------
// Client-side re-filtering (the guarantee)
// ---------------------------------------------------------------------------

function inRange(value: number, range: RangeFilter): boolean {
  if (range.min !== null && value < range.min) return false
  if (range.max !== null && value > range.max) return false
  return true
}

/** Re-check a candidate against the filters. Unknown values (0) pass. */
export function mirrorCandidateMatches(candidate: RecCandidate, filters: MirrorFilters): boolean {
  if (filters.status !== 'any' && candidate.status !== filters.status) return false
  const creator = filters.creator.trim().toLowerCase()
  if (creator && !candidate.creator.toLowerCase().includes(creator)) return false
  if (!inRange(candidate.sr, filters.sr)) return false
  if (candidate.bpm > 0 && !inRange(candidate.bpm, filters.bpm)) return false
  if (candidate.lengthSec > 0 && !inRange(candidate.lengthSec, filters.lengthSec)) return false
  if (candidate.ar > 0 && !inRange(candidate.ar, filters.ar)) return false
  if (candidate.od > 0 && !inRange(candidate.od, filters.od)) return false
  // CS doubles as the mania key count; a 0 CS means "unknown".
  if (candidate.cs > 0 && !inRange(candidate.cs, filters.cs)) return false
  return true
}

// ---------------------------------------------------------------------------
// Cached page fetch
// ---------------------------------------------------------------------------

export interface MirrorPageRequest {
  mode: GameMode
  queryText: string
  filters: MirrorFilters
  sort: MirrorSort
  cursor?: string | null
}

export const MIRROR_PAGE_TTL_MS = 5 * 60 * 1000

export function mirrorPageCacheKey(req: MirrorPageRequest): string {
  return JSON.stringify([
    'mirror',
    req.mode,
    req.queryText,
    req.filters.status,
    req.filters.genre,
    req.filters.language,
    req.sort,
    req.cursor ?? null,
  ])
}

function normalizePage(page: unknown): SearchPage {
  if (!page || typeof page !== 'object' || !Array.isArray((page as SearchPage).beatmapsets)) {
    const total =
      page && typeof page === 'object' && typeof (page as SearchPage).total === 'number'
        ? (page as SearchPage).total
        : undefined
    return { beatmapsets: [], cursor_string: null, total }
  }
  return page as SearchPage
}

/**
 * One cursor page of Mirror search, cached per (mode, query, filters,
 * sort, cursor). `fresh` skips the cache read (Refresh) but still
 * overwrites the entry, so the next identical search is instant.
 */
export async function fetchMirrorPage(
  req: MirrorPageRequest,
  opts: { fresh?: boolean } = {},
): Promise<SearchPage> {
  const key = mirrorPageCacheKey(req)
  if (!opts.fresh) {
    const hit = dataCache.get<SearchPage>(key)
    if (hit) return hit
  }
  const page = normalizePage(
    await proxyCall<SearchPage>('searchBeatmapsets', {
      mode: req.mode,
      query: req.queryText.trim() || undefined,
      cursor_string: req.cursor ?? undefined,
      filters: {
        status: req.filters.status,
        // Genre/language 0 means "any": omit the param entirely
        // rather than sending g=0/l=0, which the API may read as a
        // literal id instead of "no filter".
        ...(req.filters.genre > 0 ? { genre: req.filters.genre } : {}),
        ...(req.filters.language > 0 ? { language: req.filters.language } : {}),
        sort: req.sort,
      },
    }),
  )
  dataCache.set(key, page, MIRROR_PAGE_TTL_MS)
  return page
}
