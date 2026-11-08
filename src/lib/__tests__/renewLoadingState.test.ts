import { describe, expect, it } from 'vitest'
import { listLoadingState } from '../listLoadingState'

// Batch AM: a Renew press clears the stale batch at press time and
// shows the spinner while the run is in flight; every other generate
// (first load, mode change, filter apply) keeps the skeleton cards.
// The press → clear → spinner → restore interaction itself is
// live-only (no jsdom in this harness) — see test plan §AM.
describe('listLoadingState (batch AM: Renew spinner vs skeletons)', () => {
  it('shows the spinner while a Renew run is in flight with an empty list', () => {
    expect(
      listLoadingState({ busy: true, renewing: true, itemCount: 0, error: null }),
    ).toBe('spinner')
  })

  it('shows skeletons for a first load / mode change (busy, empty, not a Renew run)', () => {
    expect(
      listLoadingState({ busy: true, renewing: false, itemCount: 0, error: null }),
    ).toBe('skeletons')
  })

  it('shows nothing while rows are on screen', () => {
    expect(
      listLoadingState({ busy: true, renewing: true, itemCount: 30, error: null }),
    ).toBe('none')
    expect(
      listLoadingState({ busy: false, renewing: false, itemCount: 30, error: null }),
    ).toBe('none')
  })

  it('shows nothing when idle with an empty list (empty state, not loading)', () => {
    expect(
      listLoadingState({ busy: false, renewing: false, itemCount: 0, error: null }),
    ).toBe('none')
  })

  it('shows nothing when the run errored (the error panel renders instead)', () => {
    expect(
      listLoadingState({ busy: true, renewing: true, itemCount: 0, error: 'boom' }),
    ).toBe('none')
    expect(
      listLoadingState({ busy: false, renewing: false, itemCount: 0, error: 'boom' }),
    ).toBe('none')
  })
})
