import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  persistProfile,
  type Identity,
  type ProfileData,
} from '../profileService'
import { FakeDb } from './fakeSupabase'

function accountClient(db: FakeDb): SupabaseClient {
  return {
    auth: {
      getUser: async () => ({
        data: { user: { id: 'account-user-1' } },
        error: null,
      }),
    },
    from: (table: string) => db.from(table),
  } as unknown as SupabaseClient
}

function profileData(pp: number): ProfileData {
  return {
    user: { id: 123, username: 'TestUser', playmode: 'osu' },
    topPlays: [],
    recentPlays: [],
    mostPlayed: [],
    skillProfile: { pp } as unknown as ProfileData['skillProfile'],
  }
}

const IDENTITY: Identity = {
  username: 'TestUser',
  osuUserId: 123,
  tier: 'account',
}

/**
 * The Dashboard recent-plays total ("+X pp across these plays") uses
 * the snapshot at/before the oldest shown play as its baseline. If
 * auto-refresh wrote snapshots, every refresh would shrink that
 * window — so auto-refresh must upsert the skill profile and write
 * NO stat_snapshots row. Only explicit "Sync now" / generation may
 * snapshot (snapshot:true).
 */
describe('persistProfile snapshot gating', () => {
  it('auto-refresh (snapshot:false) upserts the profile but inserts NO snapshot row', async () => {
    const db = new FakeDb()
    const client = accountClient(db)

    expect(
      await persistProfile(IDENTITY, 'osu', profileData(1500), {
        snapshot: false,
        client,
      }),
    ).toBe(true)
    expect(db.tables['profiles']?.length).toBe(1)
    expect(db.tables['profiles']?.[0]?.skill_profiles).toEqual({
      osu: { pp: 1500 },
    })
    expect(db.tables['stat_snapshots'] ?? []).toEqual([])

    // A second auto-refresh with new pp still writes no snapshot.
    expect(
      await persistProfile(IDENTITY, 'osu', profileData(1600), {
        snapshot: false,
        client,
      }),
    ).toBe(true)
    expect(db.tables['profiles']?.[0]?.skill_profiles).toEqual({
      osu: { pp: 1600 },
    })
    expect(db.tables['stat_snapshots'] ?? []).toEqual([])
  })

  it('explicit refresh (snapshot:true) inserts one snapshot row', async () => {
    const db = new FakeDb()
    const client = accountClient(db)

    expect(
      await persistProfile(IDENTITY, 'osu', profileData(1500), {
        snapshot: true,
        client,
      }),
    ).toBe(true)
    expect(db.tables['stat_snapshots']?.length).toBe(1)
    expect(db.tables['stat_snapshots']?.[0]).toMatchObject({
      user_id: 'account-user-1',
      mode: 'osu',
      pp: 1500,
    })
  })

  it('returns false without a client when no Supabase is configured', async () => {
    expect(
      await persistProfile(IDENTITY, 'osu', profileData(1500), {
        snapshot: true,
      }),
    ).toBe(false)
  })
})

describe('persistProfile snapshot throttle (batch AP item 2d)', () => {
  it('skips the snapshot insert when one exists within the last hour, but still upserts the profile', async () => {
    const db = new FakeDb()
    const client = accountClient(db)

    expect(await persistProfile(IDENTITY, 'osu', profileData(1500), { snapshot: true, client })).toBe(true)
    expect(db.tables['stat_snapshots']?.length).toBe(1)

    // A second explicit refresh minutes later: profile pp updates,
    // but no second snapshot row.
    expect(await persistProfile(IDENTITY, 'osu', profileData(1600), { snapshot: true, client })).toBe(true)
    expect(db.tables['profiles']?.[0]?.skill_profiles).toEqual({ osu: { pp: 1600 } })
    expect(db.tables['stat_snapshots']?.length).toBe(1)
  })

  it('inserts again once the last snapshot is older than an hour, and throttles per mode', async () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    const db = new FakeDb({
      stat_snapshots: [
        {
          id: 'old-1',
          user_id: 'account-user-1',
          mode: 'osu',
          pp: 1400,
          global_rank: 100,
          accuracy: 98,
          skill_profile: { pp: 1400 },
          created_at: twoHoursAgo,
        },
      ],
    })
    const client = accountClient(db)

    expect(await persistProfile(IDENTITY, 'osu', profileData(1500), { snapshot: true, client })).toBe(true)
    expect(db.tables['stat_snapshots']?.length).toBe(2)

    // A different mode has its own hourly window — it snapshots
    // even though osu! just did.
    expect(await persistProfile(IDENTITY, 'mania', profileData(2000), { snapshot: true, client })).toBe(true)
    expect(db.tables['stat_snapshots']?.length).toBe(3)
    expect(db.tables['stat_snapshots']?.[2]).toMatchObject({ mode: 'mania', pp: 2000 })
  })
})
