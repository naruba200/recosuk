import { beforeEach, describe, expect, it } from 'vitest'
import { getCurrentMode, resolveInitialMode, useModeStore } from '../modeStore'
import { useGuestStore } from '../guestStore'

describe('modeStore', () => {
  beforeEach(() => {
    localStorage.clear()
    useGuestStore.getState().clearGuest()
    useModeStore.setState({ mode: 'mania', userPicked: false })
  })

  it('defaults to mania when nothing is stored or linked', () => {
    expect(resolveInitialMode()).toBe('mania')
    expect(getCurrentMode()).toBe('mania')
  })

  it('prefers the guest session mode when one is linked', () => {
    useGuestStore.getState().linkGuest({
      osuUsername: 'taiko_fan',
      playmode: 'taiko',
      selectedMode: 'taiko',
    })
    expect(resolveInitialMode()).toBe('taiko')
  })

  it('an explicit stored choice wins over the guest default', () => {
    useGuestStore.getState().linkGuest({
      osuUsername: 'taiko_fan',
      playmode: 'taiko',
      selectedMode: 'taiko',
    })
    localStorage.setItem('recosuk-mode', 'fruits')
    expect(resolveInitialMode()).toBe('fruits')
  })

  it('setMode updates state, persists, and mirrors into the guest session', () => {
    useGuestStore.getState().linkGuest({ osuUsername: 'p', playmode: 'osu' })
    useModeStore.getState().setMode('fruits')
    expect(getCurrentMode()).toBe('fruits')
    expect(localStorage.getItem('recosuk-mode')).toBe('fruits')
    expect(useGuestStore.getState().session?.selectedMode).toBe('fruits')
    expect(useModeStore.getState().userPicked).toBe(true)
  })

  it('initMode adopts an external mode only before the user picks', () => {
    useModeStore.getState().initMode('taiko')
    expect(getCurrentMode()).toBe('taiko')
    useModeStore.getState().setMode('osu')
    useModeStore.getState().initMode('mania')
    expect(getCurrentMode()).toBe('osu')
  })

  it('ignores invalid mode values', () => {
    // @ts-expect-error deliberately invalid input
    useModeStore.getState().setMode('catch')
    expect(getCurrentMode()).toBe('mania')
  })
})
