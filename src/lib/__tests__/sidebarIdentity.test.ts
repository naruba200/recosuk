import { describe, expect, it } from 'vitest'
import {
  avatarUrlForUserId,
  resolveSidebarIdentity,
  resolveSidebarPpAvatar,
  storedSkillProfilePp,
} from '../profileService'

describe('resolveSidebarIdentity', () => {
  it('prefers the fetched profile name over everything else', () => {
    expect(
      resolveSidebarIdentity({
        profileUsername: 'CanonicalName',
        identityUsername: 'IdentityName',
        accountUsername: 'RowName',
        guestUsername: 'GuestName',
        pendingUsername: 'PendingName',
        email: 'user@example.com',
        resolving: false,
      }),
    ).toBe('CanonicalName')
  })

  it('prefers the profile-data identity over the account row and guest session', () => {
    expect(
      resolveSidebarIdentity({
        identityUsername: 'IdentityName',
        accountUsername: 'RowName',
        guestUsername: 'GuestName',
        email: 'user@example.com',
        resolving: false,
      }),
    ).toBe('IdentityName')
  })

  it('shows the account row name for signed-in users with no guest session', () => {
    expect(
      resolveSidebarIdentity({
        accountUsername: 'RowName',
        email: 'user@example.com',
        resolving: false,
      }),
    ).toBe('RowName')
  })

  it('prefers the account row over a stale guest session', () => {
    expect(
      resolveSidebarIdentity({
        accountUsername: 'RowName',
        guestUsername: 'GuestName',
        email: 'user@example.com',
        resolving: false,
      }),
    ).toBe('RowName')
  })

  it('shows the guest session name for guests', () => {
    expect(
      resolveSidebarIdentity({ guestUsername: 'GuestName', resolving: false }),
    ).toBe('GuestName')
  })

  it('shows the pending-link name while the account row is still loading', () => {
    expect(
      resolveSidebarIdentity({
        pendingUsername: 'PendingName',
        email: 'user@example.com',
        resolving: true,
      }),
    ).toBe('PendingName')
  })

  it('shows a known guest name instead of a placeholder while auth resolves', () => {
    expect(
      resolveSidebarIdentity({ guestUsername: 'GuestName', resolving: true }),
    ).toBe('GuestName')
  })

  it('returns null (placeholder) while resolving with no name known yet', () => {
    expect(
      resolveSidebarIdentity({ email: 'user@example.com', resolving: true }),
    ).toBeNull()
    expect(resolveSidebarIdentity({ resolving: true })).toBeNull()
  })

  it('falls back to the signed-in email once resolution settles with no link', () => {
    expect(
      resolveSidebarIdentity({ email: 'user@example.com', resolving: false }),
    ).toBe('user@example.com')
  })

  it('falls back to Guest when nothing is linked and resolution settled', () => {
    expect(resolveSidebarIdentity({ resolving: false })).toBe('Guest')
  })

  it('skips blank or whitespace-only names', () => {
    expect(
      resolveSidebarIdentity({
        accountUsername: '   ',
        guestUsername: '',
        email: 'user@example.com',
        resolving: false,
      }),
    ).toBe('user@example.com')
    expect(
      resolveSidebarIdentity({
        accountUsername: '  ',
        guestUsername: ' ',
        resolving: false,
      }),
    ).toBe('Guest')
  })
})

describe('storedSkillProfilePp / avatarUrlForUserId (batch 12, part 11)', () => {
  it('reads a finite non-negative pp, including a real 0', () => {
    expect(storedSkillProfilePp({ pp: 5284 })).toBe(5284)
    expect(storedSkillProfilePp({ pp: 0 })).toBe(0)
    expect(storedSkillProfilePp({ pp: 96.5 })).toBe(96.5)
  })

  it('returns null for missing, malformed, or impossible pp values', () => {
    expect(storedSkillProfilePp(null)).toBeNull()
    expect(storedSkillProfilePp(undefined)).toBeNull()
    expect(storedSkillProfilePp('5284')).toBeNull()
    expect(storedSkillProfilePp([1, 2])).toBeNull()
    expect(storedSkillProfilePp({})).toBeNull()
    expect(storedSkillProfilePp({ pp: '5284' })).toBeNull()
    expect(storedSkillProfilePp({ pp: Number.NaN })).toBeNull()
    expect(storedSkillProfilePp({ pp: -5 })).toBeNull()
  })

  it('builds the avatar URL only for usable ids', () => {
    expect(avatarUrlForUserId(123456)).toBe('https://a.ppy.sh/123456')
    expect(avatarUrlForUserId(null)).toBeNull()
    expect(avatarUrlForUserId(undefined)).toBeNull()
    expect(avatarUrlForUserId(0)).toBeNull()
    expect(avatarUrlForUserId(-2)).toBeNull()
    expect(avatarUrlForUserId(Number.NaN)).toBeNull()
  })
})

describe('resolveSidebarPpAvatar (batch 12, part 11)', () => {
  it('prefers the account stored profile for the current mode over the guest profile', () => {
    expect(
      resolveSidebarPpAvatar({
        accountSkillProfiles: { osu: { pp: 5284 }, mania: { pp: 1200 } },
        guestSkillProfile: { pp: 999 },
        accountUserId: 111,
        guestUserId: 222,
        mode: 'mania',
      }),
    ).toEqual({ pp: 1200, avatarUrl: 'https://a.ppy.sh/111' })
  })

  it('falls back to the guest profile and guest id when the account has nothing stored', () => {
    expect(
      resolveSidebarPpAvatar({
        accountSkillProfiles: {},
        guestSkillProfile: { pp: 750 },
        accountUserId: null,
        guestUserId: 222,
        mode: 'osu',
      }),
    ).toEqual({ pp: 750, avatarUrl: 'https://a.ppy.sh/222' })
    expect(
      resolveSidebarPpAvatar({
        accountSkillProfiles: { osu: { pp: 100 } },
        guestSkillProfile: { pp: 750 },
        mode: 'taiko',
      }),
    ).toEqual({ pp: 750, avatarUrl: null })
  })

  it('uses the pending-link id for the avatar when no account/guest id is known', () => {
    expect(
      resolveSidebarPpAvatar({ pendingUserId: 333, mode: 'osu' }),
    ).toEqual({ pp: null, avatarUrl: 'https://a.ppy.sh/333' })
  })

  it('returns nulls for unlinked users with nothing stored', () => {
    expect(resolveSidebarPpAvatar({ mode: 'fruits' })).toEqual({
      pp: null,
      avatarUrl: null,
    })
    expect(
      resolveSidebarPpAvatar({
        accountSkillProfiles: null,
        guestSkillProfile: 'not-a-profile',
        mode: 'osu',
      }),
    ).toEqual({ pp: null, avatarUrl: null })
  })
})
