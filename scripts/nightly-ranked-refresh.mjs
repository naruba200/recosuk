#!/usr/bin/env node
// RecOsuk nightly ranked refresh (§AO) — the client half of the
// nightly auto-update job.
//
// WHAT IT DOES: once a day (a cron runs this script), read the
// `ranked_compilations` table, find the CURRENT cards that are
// stale or missing, and call the Edge Function action
// `refreshRanked` ONCE per stale card. Fresh cards are skipped,
// unreachable cards (stored empty + partial) are skipped — they
// can never become reachable. The function does the compiling
// and storing with its own service-role key; this script never
// sees or needs that key.
//
// RUN:  SUPABASE_URL=... SUPABASE_ANON_KEY=... RANKED_REFRESH_TOKEN=...
//       node scripts/nightly-ranked-refresh.mjs
// EXIT: 0 when every stale card refreshed (or nothing was stale);
//       1 when the table could not be read or any card failed
//       (the failure is logged; the cron reports it).
//
// The period math below mirrors src/lib/rankedCards.ts
// (trailing 4 calendar weeks / trailing 12 calendar months /
// rolling week) — the cross-check tests in
// src/lib/__tests__/nightlyRefresh.test.ts run listCurrentCards
// against rankedCardsForWindow on identical dates, so the two
// cannot drift silently. TTLs mirror RANKED_WINDOWS (same test).

export const RANKED_TTLS = {
  week: 60 * 60 * 1000,
  month: 6 * 60 * 60 * 1000,
  year: 24 * 60 * 60 * 1000,
}

export const GAME_MODES = ['osu', 'taiko', 'fruits', 'mania']

function pad2(n) {
  return String(n).padStart(2, '0')
}

function monthWeekPeriod(year, month, weekIndex) {
  return `${year}-${pad2(month + 1)}-w${weekIndex + 1}`
}

function monthPeriod(year, month) {
  return `${year}-${pad2(month + 1)}`
}

/** The trailing 4 calendar month-week periods ending at nowMs. */
export function trailingWeekPeriods(nowMs) {
  const now = new Date(nowMs)
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth()
  const starts = []
  for (let m = month - 1; m <= month; m += 1) {
    const y = m < 0 ? year - 1 : year
    const mm = (m + 12) % 12
    for (let w = 0; w < 4; w += 1) {
      starts.push({ year: y, month: mm, week: w, startMs: Date.UTC(y, mm, [1, 8, 15, 22][w]) })
    }
  }
  return starts
    .filter((c) => c.startMs <= nowMs)
    .sort((a, b) => a.startMs - b.startMs)
    .slice(-4)
    .map((c) => monthWeekPeriod(c.year, c.month, c.week))
}

/** The trailing 12 calendar month periods ending at nowMs. */
export function trailingMonthPeriods(nowMs) {
  const now = new Date(nowMs)
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth()
  const periods = []
  for (let i = 11; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(year, month - i, 1))
    periods.push(monthPeriod(d.getUTCFullYear(), d.getUTCMonth()))
  }
  return periods
}

/**
 * Every current card across all 4 modes: 1 rolling week + 4
 * trailing weeks + 12 trailing months per mode (68 cards).
 */
export function listCurrentCards(nowMs = Date.now()) {
  const cards = []
  for (const mode of GAME_MODES) {
    cards.push({ mode, granularity: 'week', period: 'current', ttlMs: RANKED_TTLS.week })
    for (const period of trailingWeekPeriods(nowMs)) {
      cards.push({ mode, granularity: 'month', period, ttlMs: RANKED_TTLS.month })
    }
    for (const period of trailingMonthPeriods(nowMs)) {
      cards.push({ mode, granularity: 'year', period, ttlMs: RANKED_TTLS.year })
    }
  }
  return cards
}

/**
 * Which cards need a refresh: no stored row, or a stored row
 * older than the card's TTL. A stored row that is unreachable
 * (0 entries + partial) is never refreshed — its interval only
 * gets older. `storedRows` are the table rows as read from the
 * REST API (mode, granularity, period, entries, partial,
 * compiled_at).
 */
export function selectStaleCards(cards, storedRows, nowMs = Date.now()) {
  const byKey = new Map()
  for (const row of storedRows ?? []) {
    if (row && typeof row.mode === 'string' && typeof row.period === 'string') {
      byKey.set(`${row.mode}:${row.granularity}:${row.period}`, row)
    }
  }
  return cards.filter((card) => {
    const row = byKey.get(`${card.mode}:${card.granularity}:${card.period}`)
    if (!row) return true
    if (Array.isArray(row.entries) && row.entries.length === 0 && row.partial === true) {
      return false
    }
    const compiledAtMs = typeof row.compiled_at === 'string' ? Date.parse(row.compiled_at) : NaN
    if (!Number.isFinite(compiledAtMs)) return true
    return nowMs - compiledAtMs >= card.ttlMs
  })
}

// ---------------------------------------------------------------------------
// I/O (injected fetch so tests drive main without a network)
// ---------------------------------------------------------------------------

function restUrl(supabaseUrl) {
  return `${supabaseUrl.replace(/\/$/, '')}/rest/v1/ranked_compilations?select=mode,granularity,period,entries,partial,compiled_at`
}

function functionUrl(supabaseUrl) {
  return `${supabaseUrl.replace(/\/$/, '')}/functions/v1/osu-proxy`
}

async function readStoredRows(fetchFn, supabaseUrl, anonKey) {
  const res = await fetchFn(restUrl(supabaseUrl), {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      Accept: 'application/json',
    },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(
      `Could not read ranked_compilations (${res.status})${body ? `: ${body.slice(0, 200)}` : ''} — is migration 003 run?`,
    )
  }
  const rows = await res.json()
  if (!Array.isArray(rows)) throw new Error('ranked_compilations read returned a non-array response')
  return rows
}

async function refreshCard(fetchFn, supabaseUrl, anonKey, token, card) {
  const res = await fetchFn(functionUrl(supabaseUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      'x-refresh-token': token,
    },
    body: JSON.stringify({
      action: 'refreshRanked',
      mode: card.mode,
      granularity: card.granularity,
      period: card.period,
    }),
  })
  let payload = null
  try {
    payload = await res.json()
  } catch {
    payload = null
  }
  if (!res.ok) {
    const message =
      (payload && typeof payload.error === 'string' && payload.error) ||
      `refreshRanked failed (${res.status})`
    throw new Error(message)
  }
  return payload?.data ?? null
}

/**
 * One nightly run. Returns { refreshed, skipped, failed } and
 * logs a one-line summary per card. Throws only when the table
 * itself could not be read (nothing can be decided then).
 */
export async function main({
  fetchFn = fetch,
  env = process.env,
  nowMs = Date.now(),
  log = console.log,
} = {}) {
  const supabaseUrl = env.SUPABASE_URL
  const anonKey = env.SUPABASE_ANON_KEY
  const token = env.RANKED_REFRESH_TOKEN
  if (!supabaseUrl || !anonKey || !token) {
    throw new Error(
      'Missing env: set SUPABASE_URL, SUPABASE_ANON_KEY and RANKED_REFRESH_TOKEN (see the script header).',
    )
  }
  const cards = listCurrentCards(nowMs)
  const stored = await readStoredRows(fetchFn, supabaseUrl, anonKey)
  const stale = selectStaleCards(cards, stored, nowMs)
  const skipped = cards.length - stale.length
  log(`[nightly-ranked-refresh] ${cards.length} current cards, ${stored.length} stored rows, ${stale.length} stale, ${skipped} skipped (fresh or unreachable)`)
  let refreshed = 0
  const failed = []
  for (const card of stale) {
    const label = `${card.mode}/${card.granularity}/${card.period}`
    try {
      const data = await refreshCard(fetchFn, supabaseUrl, anonKey, token, card)
      refreshed += 1
      log(
        `[nightly-ranked-refresh] refreshed ${label}: ${data?.entries?.length ?? '?'} maps` +
          (data?.partial ? ' (partial)' : ''),
      )
    } catch (err) {
      failed.push(label)
      log(`[nightly-ranked-refresh] FAILED ${label}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  log(
    `[nightly-ranked-refresh] done: ${refreshed} refreshed, ${skipped} skipped, ${failed.length} failed`,
  )
  return { refreshed, skipped, failed }
}

// CLI entry: only when executed directly (`node
// scripts/nightly-ranked-refresh.mjs`), never on import (the
// test suite imports the helpers above).
if (process.argv[1]?.endsWith('nightly-ranked-refresh.mjs')) {
  main()
    .then((result) => {
      process.exit(result.failed.length > 0 ? 1 : 0)
    })
    .catch((err) => {
      console.error(`[nightly-ranked-refresh] ${err instanceof Error ? err.message : String(err)}`)
      process.exit(1)
    })
}
