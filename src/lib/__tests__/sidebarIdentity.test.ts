import { describe, expect, it } from 'vitest'
import { resolveSidebarIdentity } from '../profileService'

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
