import { beforeEach, describe, expect, it } from 'vitest'
import { useGuestStore } from '../guestStore'

describe('guestStore', () => {
  beforeEach(() => {
    useGuestStore.getState().clearGuest()
    localStorage.clear()
  })

  it('starts with no session', () => {
    expect(useGuestStore.getState().session).toBeNull()
  })

  it('linkGuest stores the linked osu! identity', () => {
    useGuestStore.getState().linkGuest({
      osuUsername: 'sora_playz',
      osuUserId: 123456,
      playmode: 'mania',
      selectedMode: 'mania',
    })
    const session = useGuestStore.getState().session
    expect(session).not.toBeNull()
    expect(session?.osuUsername).toBe('sora_playz')
    expect(session?.osuUserId).toBe(123456)
    expect(session?.playmode).toBe('mania')
    expect(session?.selectedMode).toBe('mania')
    expect(session?.skillProfiles).toEqual({})
    expect(typeof session?.generatedAt).toBe('string')
    expect(Number.isNaN(Date.parse(session!.generatedAt))).toBe(false)
  })

  it('linkGuest defaults the other mode fields sensibly', () => {
    useGuestStore.getState().linkGuest({
      osuUsername: 'taiko_fan',
      selectedMode: 'taiko',
    })
    const session = useGuestStore.getState().session
    expect(session?.playmode).toBe('taiko')
    expect(session?.selectedMode).toBe('taiko')
    expect(session?.osuUserId).toBeNull()
  })

  it('persists the session to localStorage under recosuk-guest', () => {
    useGuestStore.getState().linkGuest({ osuUsername: 'persist_me', playmode: 'osu' })
    const raw = localStorage.getItem('recosuk-guest')
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw as string) as {
      state: { session: { osuUsername: string } | null }
    }
    expect(parsed.state.session?.osuUsername).toBe('persist_me')
  })

  it('setGuestMode updates only the selected mode of an active session', () => {
    useGuestStore.getState().linkGuest({
      osuUsername: 'sora_playz',
      playmode: 'mania',
      selectedMode: 'mania',
    })
    useGuestStore.getState().setGuestMode('fruits')
    const session = useGuestStore.getState().session
    expect(session?.selectedMode).toBe('fruits')
    expect(session?.playmode).toBe('mania')
  })

  it('setGuestMode is a no-op without a session', () => {
    useGuestStore.getState().setGuestMode('taiko')
    expect(useGuestStore.getState().session).toBeNull()
  })

  it('clearGuest removes the session', () => {
    useGuestStore.getState().linkGuest({ osuUsername: 'sora_playz' })
    expect(useGuestStore.getState().session).not.toBeNull()
    useGuestStore.getState().clearGuest()
    expect(useGuestStore.getState().session).toBeNull()
  })
})
