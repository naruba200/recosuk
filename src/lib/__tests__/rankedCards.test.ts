import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { FakeDb } from './fakeSupabase'

const mocks = vi.hoisted(() => ({
  proxyCall: vi.fn(),
}))

vi.mock('../osu', () => ({
  proxyCall: mocks.proxyCall,
}))

import {
  RANKED_COMPILATIONS_TABLE,
  cardFromPeriod,
  compileCardCompilation,
  isCompilationFresh,
  isUnreachableCompilation,
  listStoredCompilations,
  loadStoredCompilation,
  monthCard,
  monthWeekCard,
  rankedCardListName,
  rankedCardsForWindow,
  storeCompilation,
  trailingMonths,
  trailingWeeks,
  weekCard,
  type RankedPeriodCard,
} from '../rankedCards'
import { RANKED_WINDOWS, type RankedCompilation } from '../rankedLists'
import type { GameMode } from '../mode'

/** Fixed "now": 2026-11-08T12:00:00Z (a Sunday, November has 30 days). */
const NOW = Date.parse('2026-11-08T12:00:00.000Z')

function client(db: FakeDb): SupabaseClient {
  return db as unknown as SupabaseClient
}

function storedRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    mode: 'mania',
    granularity: 'month',
    period: '2026-11-w1',
    entries: [
      { candidate: { beatmapsetId: 1, title: 'One' }, rank: 1, rankedDate: '2026-11-02T00:00:00.000Z' },
      { candidate: { beatmapsetId: 2, title: 'Two' }, rank: 2, rankedDate: '2026-11-03T00:00:00.000Z' },
    ],
    partial: false,
    scanned: 12,
    window_start: '2026-11-01T00:00:00.000Z',
    compiled_at: new Date(NOW - 1000).toISOString(),
    ...overrides,
  }
}

function compilation(): RankedCompilation {
  return {
    entries: [
      { candidate: { beatmapsetId: 9, title: 'Nine' } as RankedCompilation['entries'][number]['candidate'], rank: 1, rankedDate: '2026-11-02T00:00:00.000Z' },
    ],
    partial: false,
    scanned: 5,
    windowStart: '2026-11-01T00:00:00.000Z',
  }
}

describe('monthWeekCard (§AN cards)', () => {
  it('splits a calendar month into 4 weeks (UTC)', () => {
    const w1 = monthWeekCard(2026, 10, 0)
    expect(w1.period).toBe('2026-11-w1')
    expect(w1.label).toBe('Week 1 · Nov 1–7')
    expect(w1.startMs).toBe(Date.UTC(2026, 10, 1))
    expect(w1.endMs).toBe(Date.UTC(2026, 10, 8))
    expect(w1.granularity).toBe('month')
    expect(w1.window.id).toBe('month')
    const w4 = monthWeekCard(2026, 10, 3)
    expect(w4.period).toBe('2026-11-w4')
    expect(w4.label).toBe('Week 4 · Nov 22–30')
    expect(w4.startMs).toBe(Date.UTC(2026, 10, 22))
    expect(w4.endMs).toBe(Date.UTC(2026, 11, 1))
  })

  it('caps the last week at the month end (February)', () => {
    const feb4 = monthWeekCard(2026, 1, 3)
    expect(feb4.label).toBe('Week 4 · Feb 22–28')
    expect(feb4.endMs).toBe(Date.UTC(2026, 2, 1))
  })
})

describe('trailingWeeks (§AO rolling month view)', () => {
  it('is the trailing 4 calendar weeks ending at now (UTC)', () => {
    // NOW is 2026-11-08: the trailing 4 are Oct W3 + Oct W4 +
    // Nov W1 + Nov W2 (the current week, started Nov 8, counts).
    const cards = trailingWeeks(NOW)
    expect(cards).toHaveLength(4)
    expect(cards.map((c) => c.period)).toEqual([
      '2026-10-w3',
      '2026-10-w4',
      '2026-11-w1',
      '2026-11-w2',
    ])
    expect(cards.map((c) => c.label)).toEqual([
      'Week 3 · Oct 15–21',
      'Week 4 · Oct 22–31',
      'Week 1 · Nov 1–7',
      'Week 2 · Nov 8–14',
    ])
    for (const card of cards) {
      expect(card.granularity).toBe('month')
      expect(card.window.id).toBe('month')
    }
  })

  it('rolls forward: a December visit drops October', () => {
    const cards = trailingWeeks(Date.parse('2026-12-09T12:00:00.000Z'))
    expect(cards.map((c) => c.period)).toEqual([
      '2026-11-w3',
      '2026-11-w4',
      '2026-12-w1',
      '2026-12-w2',
    ])
  })

  it('on the 1st of a month the trailing 4 come from the month before', () => {
    const cards = trailingWeeks(Date.parse('2026-11-01T00:00:00.000Z'))
    expect(cards.map((c) => c.period)).toEqual([
      '2026-10-w2',
      '2026-10-w3',
      '2026-10-w4',
      '2026-11-w1',
    ])
  })
})

describe('trailingMonths (§AO rolling year view)', () => {
  it('is the trailing 12 calendar months ending at now (UTC)', () => {
    // NOW is 2026-11-08: Dec 2025 through Nov 2026.
    const cards = trailingMonths(NOW)
    expect(cards).toHaveLength(12)
    expect(cards[0].period).toBe('2025-12')
    expect(cards[0].label).toBe('December 2025')
    expect(cards[0].startMs).toBe(Date.UTC(2025, 11, 1))
    expect(cards[0].endMs).toBe(Date.UTC(2026, 0, 1))
    expect(cards[11].period).toBe('2026-11')
    expect(cards[11].label).toBe('November 2026')
    expect(cards[11].startMs).toBe(Date.UTC(2026, 10, 1))
    expect(cards[11].endMs).toBe(Date.UTC(2026, 11, 1))
    for (const card of cards) {
      expect(card.granularity).toBe('year')
      expect(card.window.id).toBe('year')
    }
  })

  it('rolls forward across the year boundary', () => {
    const cards = trailingMonths(Date.parse('2027-01-15T12:00:00.000Z'))
    expect(cards[0].period).toBe('2026-02')
    expect(cards[11].period).toBe('2027-01')
  })
})

describe('monthCard', () => {
  it('is one calendar month (UTC)', () => {
    const card = monthCard(2026, 2)
    expect(card.period).toBe('2026-03')
    expect(card.label).toBe('March 2026')
    expect(card.startMs).toBe(Date.UTC(2026, 2, 1))
    expect(card.endMs).toBe(Date.UTC(2026, 3, 1))
  })
})

describe('weekCard + rankedCardsForWindow', () => {
  it('is one rolling 7-day card with period "current"', () => {
    const card = weekCard(NOW)
    expect(card.period).toBe('current')
    expect(card.label).toBe('This week')
    expect(card.startMs).toBe(NOW - 7 * 24 * 60 * 60 * 1000)
    expect(card.endMs).toBe(NOW)
  })

  it('returns 1 card for week, 4 for month, 12 for year', () => {
    expect(rankedCardsForWindow('week', NOW)).toHaveLength(1)
    expect(rankedCardsForWindow('month', NOW)).toHaveLength(4)
    expect(rankedCardsForWindow('year', NOW)).toHaveLength(12)
  })

  it('names a card list with its period label', () => {
    const card: RankedPeriodCard = monthWeekCard(2026, 10, 1)
    expect(rankedCardListName('mania' as GameMode, card)).toBe(
      'Top 50 Ranked — Mania — Week 2 · Nov 8–14',
    )
  })
})

describe('cardFromPeriod (§AN detail route)', () => {
  it('rebuilds a month-week card from its key', () => {
    const card = cardFromPeriod('month', '2026-11-w4', NOW)
    expect(card?.label).toBe('Week 4 · Nov 22–30')
    expect(card?.period).toBe('2026-11-w4')
    expect(card?.startMs).toBe(Date.UTC(2026, 10, 22))
    expect(card?.endMs).toBe(Date.UTC(2026, 11, 1))
  })

  it('rebuilds a year-month card from its key', () => {
    const card = cardFromPeriod('year', '2026-03', NOW)
    expect(card?.label).toBe('March 2026')
    expect(card?.startMs).toBe(Date.UTC(2026, 2, 1))
    expect(card?.endMs).toBe(Date.UTC(2026, 3, 1))
  })

  it('resolves the rolling week from "current"', () => {
    expect(cardFromPeriod('week', 'current', NOW)?.label).toBe('This week')
  })

  it('returns null for unparseable keys', () => {
    expect(cardFromPeriod('month', '2026-13-w1', NOW)).toBeNull()
    expect(cardFromPeriod('month', '2026-11-w5', NOW)).toBeNull()
    expect(cardFromPeriod('month', '2026-11', NOW)).toBeNull()
    expect(cardFromPeriod('year', '2026-11-w1', NOW)).toBeNull()
    expect(cardFromPeriod('year', '2026-00', NOW)).toBeNull()
    expect(cardFromPeriod('week', '2026-11-w1', NOW)).toBeNull()
  })
})

describe('isCompilationFresh', () => {
  it('is fresh inside the TTL and stale at/after it', () => {
    const ttl = RANKED_WINDOWS[1].ttlMs // month: 6h
    expect(isCompilationFresh(NOW - ttl + 1000, ttl, NOW)).toBe(true)
    expect(isCompilationFresh(NOW - ttl, ttl, NOW)).toBe(false)
    expect(isCompilationFresh(NOW - ttl - 1000, ttl, NOW)).toBe(false)
    expect(isCompilationFresh(NaN, ttl, NOW)).toBe(false)
  })
})

describe('ranked_compilations DB layer (migration 003)', () => {
  it('reads a stored row back as a compilation', async () => {
    const db = new FakeDb({ [RANKED_COMPILATIONS_TABLE]: [storedRow()] })
    const stored = await loadStoredCompilation(client(db), 'mania', 'month', '2026-11-w1')
    expect(stored).not.toBeNull()
    expect(stored?.compilation.entries).toHaveLength(2)
    expect(stored?.compilation.entries[0].candidate.beatmapsetId).toBe(1)
    expect(stored?.compilation.partial).toBe(false)
    expect(stored?.compilation.scanned).toBe(12)
    expect(stored?.compiledAtMs).toBe(NOW - 1000)
  })

  it('returns null for a missing row, a null client, or a malformed row', async () => {
    const db = new FakeDb()
    expect(await loadStoredCompilation(client(db), 'mania', 'month', '2026-11-w1')).toBeNull()
    expect(await loadStoredCompilation(null, 'mania', 'month', '2026-11-w1')).toBeNull()
    const bad = new FakeDb({ [RANKED_COMPILATIONS_TABLE]: [storedRow({ entries: 'not-an-array' })] })
    expect(await loadStoredCompilation(client(bad), 'mania', 'month', '2026-11-w1')).toBeNull()
    const badEntry = new FakeDb({
      [RANKED_COMPILATIONS_TABLE]: [storedRow({ entries: [{ candidate: {}, rank: 1 }] })],
    })
    expect(await loadStoredCompilation(client(badEntry), 'mania', 'month', '2026-11-w1')).toBeNull()
  })

  it('stores a compilation and overwrites it on conflict', async () => {
    const db = new FakeDb()
    expect(await storeCompilation(client(db), 'mania', 'month', '2026-11-w1', compilation(), NOW)).toBe(true)
    const first = await loadStoredCompilation(client(db), 'mania', 'month', '2026-11-w1')
    expect(first?.compilation.scanned).toBe(5)
    const newer: RankedCompilation = { ...compilation(), scanned: 99 }
    expect(await storeCompilation(client(db), 'mania', 'month', '2026-11-w1', newer, NOW + 1000)).toBe(true)
    const second = await loadStoredCompilation(client(db), 'mania', 'month', '2026-11-w1')
    expect(second?.compilation.scanned).toBe(99)
    expect(second?.compiledAtMs).toBe(NOW + 1000)
    expect(db.tables[RANKED_COMPILATIONS_TABLE]).toHaveLength(1)
  })

  it('returns false for a null client (demo/unconfigured)', async () => {
    expect(await storeCompilation(null, 'mania', 'month', '2026-11-w1', compilation(), NOW)).toBe(false)
  })
})

describe('compileCardCompilation', () => {
  it('live-compiles one card through the interval scan (mocked proxy)', async () => {
    mocks.proxyCall.mockResolvedValue({
      beatmapsets: [
        {
          id: 7,
          title: 'In Week',
          artist: 'A',
          creator: 'mapper',
          status: 'ranked',
          play_count: 10,
          favourite_count: 0,
          ranked_date: '2026-11-03T00:00:00.000Z',
          covers: { card: 'cover-7' },
          beatmaps: [{ id: 70, mode: 'mania', version: 'Diff', difficulty_rating: 4, bpm: 170, total_length: 120, cs: 4, ar: 9, od: 8 }],
        },
        {
          id: 8,
          title: 'Too New',
          artist: 'A',
          creator: 'mapper',
          status: 'ranked',
          play_count: 99,
          favourite_count: 0,
          ranked_date: '2026-11-20T00:00:00.000Z',
          covers: { card: 'cover-8' },
          beatmaps: [{ id: 80, mode: 'mania', version: 'Diff', difficulty_rating: 4, bpm: 170, total_length: 120, cs: 4, ar: 9, od: 8 }],
        },
      ],
      cursor_string: null,
    })
    const card = monthWeekCard(2026, 10, 0) // Nov 1–7
    const compiled = await compileCardCompilation('mania' as GameMode, card, { now: NOW })
    expect(compiled.entries.map((e) => e.candidate.beatmapsetId)).toEqual([7])
  })
})

describe('isUnreachableCompilation (§AO hide rule)', () => {
  it('is unreachable only for 0 entries AND a partial scan', () => {
    const empty = (partial: boolean): RankedCompilation => ({
      entries: [],
      partial,
      scanned: 1000,
      windowStart: '2026-01-01T00:00:00.000Z',
    })
    expect(isUnreachableCompilation(empty(true))).toBe(true)
    // 0 entries but the scan reached the interval start: a
    // genuinely empty period (e.g. a future week), not unreachable.
    expect(isUnreachableCompilation(empty(false))).toBe(false)
    expect(isUnreachableCompilation(compilation())).toBe(false)
    expect(isUnreachableCompilation(null)).toBe(false)
    expect(isUnreachableCompilation(undefined)).toBe(false)
  })
})

describe('listStoredCompilations (§AO History tab)', () => {
  function historyRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return storedRow({
      period: '2026-10-w3',
      window_start: '2026-10-15T00:00:00.000Z',
      compiled_at: new Date(NOW - 2000).toISOString(),
      ...overrides,
    })
  }

  it('lists stored periods newest first, skipping empty rows', async () => {
    const db = new FakeDb({
      [RANKED_COMPILATIONS_TABLE]: [
        historyRow({ period: '2026-10-w3', window_start: '2026-10-15T00:00:00.000Z' }),
        historyRow({
          period: '2026-11-w1',
          granularity: 'month',
          window_start: '2026-11-01T00:00:00.000Z',
        }),
        // Unreachable (0 entries + partial): not history.
        historyRow({
          period: '2026-01',
          granularity: 'year',
          entries: [],
          partial: true,
          window_start: '2026-01-01T00:00:00.000Z',
        }),
        // Another mode: not this mode's history.
        historyRow({ mode: 'osu', period: '2026-11-w1', window_start: '2026-11-01T00:00:00.000Z' }),
      ],
    })
    const rows = await listStoredCompilations(client(db), 'mania')
    expect(rows).not.toBeNull()
    expect(rows?.map((r) => r.period)).toEqual(['2026-11-w1', '2026-10-w3'])
    expect(rows?.[0].label).toBe('Week 1 · Nov 1–7')
    expect(rows?.[0].entryCount).toBe(2)
    expect(rows?.[1].label).toBe('Week 3 · Oct 15–21')
  })

  it('returns an empty list when nothing is stored, null with no client or on read failure', async () => {
    const db = new FakeDb()
    expect(await listStoredCompilations(client(db), 'mania')).toEqual([])
    expect(await listStoredCompilations(null, 'mania')).toBeNull()
    // A read error (e.g. the table does not exist yet — migration
    // 003 not run) reads as null, never an empty list.
    const failing = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () => Promise.resolve({ data: null, error: { message: 'table missing' } }),
            }),
          }),
        }),
      }),
    } as unknown as SupabaseClient
    expect(await listStoredCompilations(failing, 'mania')).toBeNull()
  })
})
