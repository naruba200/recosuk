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
  loadStoredCompilation,
  monthsOfYear,
  rankedCardListName,
  rankedCardsForWindow,
  storeCompilation,
  weekCard,
  weeksOfMonth,
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

describe('weeksOfMonth (§AN cards)', () => {
  it('splits the current calendar month into 4 weeks (UTC)', () => {
    const cards = weeksOfMonth(NOW)
    expect(cards).toHaveLength(4)
    expect(cards.map((c) => c.period)).toEqual([
      '2026-11-w1',
      '2026-11-w2',
      '2026-11-w3',
      '2026-11-w4',
    ])
    expect(cards.map((c) => c.label)).toEqual([
      'Week 1 · Nov 1–7',
      'Week 2 · Nov 8–14',
      'Week 3 · Nov 15–21',
      'Week 4 · Nov 22–30',
    ])
    expect(cards[0].startMs).toBe(Date.UTC(2026, 10, 1))
    expect(cards[0].endMs).toBe(Date.UTC(2026, 10, 8))
    expect(cards[3].startMs).toBe(Date.UTC(2026, 10, 22))
    expect(cards[3].endMs).toBe(Date.UTC(2026, 11, 1))
    for (const card of cards) {
      expect(card.granularity).toBe('month')
      expect(card.window.id).toBe('month')
    }
  })

  it('caps the last week at the month end (February)', () => {
    const feb = weeksOfMonth(Date.parse('2026-02-10T12:00:00.000Z'))
    expect(feb[3].label).toBe('Week 4 · Feb 22–28')
    expect(feb[3].endMs).toBe(Date.UTC(2026, 2, 1))
  })
})

describe('monthsOfYear (§AN cards)', () => {
  it('lists the 12 months of the current calendar year (UTC)', () => {
    const cards = monthsOfYear(NOW)
    expect(cards).toHaveLength(12)
    expect(cards[0].period).toBe('2026-01')
    expect(cards[0].label).toBe('January 2026')
    expect(cards[0].startMs).toBe(Date.UTC(2026, 0, 1))
    expect(cards[0].endMs).toBe(Date.UTC(2026, 1, 1))
    expect(cards[11].period).toBe('2026-12')
    expect(cards[11].label).toBe('December 2026')
    expect(cards[11].startMs).toBe(Date.UTC(2026, 11, 1))
    expect(cards[11].endMs).toBe(Date.UTC(2027, 0, 1))
    for (const card of cards) {
      expect(card.granularity).toBe('year')
      expect(card.window.id).toBe('year')
    }
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
    const card: RankedPeriodCard = weeksOfMonth(NOW)[1]
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
    const card = weeksOfMonth(NOW)[0] // Nov 1–7
    const compiled = await compileCardCompilation('mania' as GameMode, card, { now: NOW })
    expect(compiled.entries.map((e) => e.candidate.beatmapsetId)).toEqual([7])
  })
})
