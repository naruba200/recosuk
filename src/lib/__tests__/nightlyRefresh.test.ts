import { describe, expect, it } from 'vitest'
import {
  GAME_MODES,
  RANKED_TTLS,
  listCurrentCards,
  main,
  selectStaleCards,
  trailingMonthPeriods,
  trailingWeekPeriods,
} from '../../../scripts/nightly-ranked-refresh.mjs'
import { RANKED_WINDOWS } from '../rankedLists'
import { rankedCardsForWindow } from '../rankedCards'

/**
 * §AO — the nightly script's period math and stale selection
 * must agree with the client, or the job would refresh the wrong
 * cards (or none). These tests run the script's helpers against
 * src/lib on identical dates. `main` itself is driven with a
 * stub fetch — no network.
 */

const NOW = Date.parse('2026-11-09T12:00:00.000Z')

describe('listCurrentCards vs rankedCardsForWindow (§AO drift guard)', () => {
  it('covers exactly the current cards for every mode', () => {
    for (const nowMs of [
      NOW,
      Date.parse('2026-12-09T12:00:00.000Z'),
      Date.parse('2027-01-01T00:00:00.000Z'),
      Date.parse('2026-02-10T12:00:00.000Z'),
    ]) {
      const expected = new Set<string>()
      for (const mode of GAME_MODES) {
        for (const w of ['week', 'month', 'year'] as const) {
          for (const card of rankedCardsForWindow(w, nowMs)) {
            expected.add(`${mode}:${card.granularity}:${card.period}`)
          }
        }
      }
      const got = new Set(listCurrentCards(nowMs).map((c) => `${c.mode}:${c.granularity}:${c.period}`))
      expect(got).toEqual(expected)
      expect(listCurrentCards(nowMs)).toHaveLength(4 * (1 + 4 + 12))
    }
  })

  it('trailing periods match the client card lists', () => {
    expect(trailingWeekPeriods(NOW)).toEqual(
      rankedCardsForWindow('month', NOW).map((c) => c.period),
    )
    expect(trailingMonthPeriods(NOW)).toEqual(
      rankedCardsForWindow('year', NOW).map((c) => c.period),
    )
  })

  it('TTLs match RANKED_WINDOWS', () => {
    for (const w of RANKED_WINDOWS) {
      expect(RANKED_TTLS[w.id]).toBe(w.ttlMs)
    }
  })
})

describe('selectStaleCards', () => {
  const cards = [
    { mode: 'mania', granularity: 'week', period: 'current', ttlMs: RANKED_TTLS.week },
    { mode: 'mania', granularity: 'month', period: '2026-11-w1', ttlMs: RANKED_TTLS.month },
    { mode: 'mania', granularity: 'month', period: '2026-10-w4', ttlMs: RANKED_TTLS.month },
    { mode: 'mania', granularity: 'year', period: '2026-01', ttlMs: RANKED_TTLS.year },
  ]

  it('refreshes missing and stale rows, skips fresh and unreachable ones', () => {
    const stored = [
      // Fresh week row: skip.
      { mode: 'mania', granularity: 'week', period: 'current', entries: [{}, {}], partial: false, compiled_at: new Date(NOW - 1000).toISOString() },
      // Stale month row: refresh.
      { mode: 'mania', granularity: 'month', period: '2026-11-w1', entries: [{}, {}], partial: false, compiled_at: new Date(NOW - 7 * 60 * 60 * 1000).toISOString() },
      // Unreachable year row (0 entries + partial): never refresh.
      { mode: 'mania', granularity: 'year', period: '2026-01', entries: [], partial: true, compiled_at: new Date(NOW - 30 * 24 * 60 * 60 * 1000).toISOString() },
      // 2026-10-w4 has no row at all: refresh.
    ]
    const stale = selectStaleCards(cards, stored, NOW)
    expect(stale.map((c) => c.period).sort()).toEqual(['2026-10-w4', '2026-11-w1'])
  })

  it('treats an unparseable compiled_at as stale', () => {
    const stored = [
      { mode: 'mania', granularity: 'week', period: 'current', entries: [{}], partial: false, compiled_at: 'not-a-date' },
    ]
    expect(selectStaleCards(cards.slice(0, 1), stored, NOW)).toHaveLength(1)
  })
})

describe('main (stub fetch)', () => {
  const env = {
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_ANON_KEY: 'anon-key',
    RANKED_REFRESH_TOKEN: 'refresh-token',
  }

  it('calls refreshRanked once per stale card, with the token header', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = []
    const fetchFn = async (url: string, init?: RequestInit) => {
      calls.push({ url, init: init ?? {} })
      if (url.includes('/rest/v1/ranked_compilations')) {
        return {
          ok: true,
          json: async () => [
            // Every card is stored and fresh except one missing week row.
            ...listCurrentCards(NOW).slice(1).map((c) => ({
              mode: c.mode,
              granularity: c.granularity,
              period: c.period,
              entries: [{}, {}],
              partial: false,
              compiled_at: new Date(NOW - 1000).toISOString(),
            })),
          ],
        } as unknown as Response
      }
      return {
        ok: true,
        json: async () => ({ data: { entries: [{}, {}], partial: false } }),
      } as unknown as Response
    }
    const logs: string[] = []
    const result = await main({ fetchFn, env, nowMs: NOW, log: (m: string) => logs.push(m) })
    const refreshCalls = calls.filter((c) => c.url.includes('/functions/v1/osu-proxy'))
    expect(refreshCalls).toHaveLength(1)
    const body = JSON.parse(String(refreshCalls[0].init.body))
    expect(body).toEqual({
      action: 'refreshRanked',
      mode: 'osu',
      granularity: 'week',
      period: 'current',
    })
    expect((refreshCalls[0].init.headers as Record<string, string>)['x-refresh-token']).toBe(
      'refresh-token',
    )
    expect(result).toEqual({ refreshed: 1, skipped: 67, failed: [] })
  })

  it('counts a failed card and keeps going', async () => {
    const fetchFn = async (url: string) => {
      if (url.includes('/rest/v1/ranked_compilations')) {
        return { ok: true, json: async () => [] } as unknown as Response
      }
      return {
        ok: false,
        status: 401,
        json: async () => ({ error: 'bad token', status: 401 }),
      } as unknown as Response
    }
    const result = await main({ fetchFn, env, nowMs: NOW, log: () => undefined })
    expect(result.refreshed).toBe(0)
    expect(result.failed).toHaveLength(68)
  })

  it('throws when the table cannot be read (migration 003 not run)', async () => {
    const fetchFn = async () => {
      return { ok: false, status: 404, text: async () => 'PGRST205 table not found' } as unknown as Response
    }
    await expect(main({ fetchFn, env, nowMs: NOW, log: () => undefined })).rejects.toThrow(
      /migration 003/,
    )
  })

  it('throws when env is missing', async () => {
    await expect(
      main({ fetchFn: async () => ({}) as unknown as Response, env: {}, nowMs: NOW, log: () => undefined }),
    ).rejects.toThrow(/Missing env/)
  })
})
