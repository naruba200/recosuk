import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import RecentPlaysSection from '../../components/RecentPlaysSection'
import type { OsuScore } from '../osu'
import type { StatSnapshot } from '../profileService'

function play(over: Partial<OsuScore> = {}): OsuScore {
  return {
    id: 1,
    accuracy: 0.98,
    pp: 120,
    max_combo: 500,
    mods: ['HD'],
    rank: 'S',
    created_at: '2026-10-30T10:00:00Z',
    beatmap: { id: 1, beatmapset_id: 1, difficulty_rating: 4.5, version: 'Insane', bpm: 180 },
    beatmapset: {
      id: 1,
      title: 'Test Map',
      artist: 'Test Artist',
      creator: 'Mapper',
      status: 'ranked',
      covers: { card: 'https://example.com/card.jpg' },
    },
    ...over,
  }
}

function snap(pp: number | null, created_at: string): StatSnapshot {
  return {
    id: `s-${created_at}`,
    mode: 'mania',
    pp,
    global_rank: null,
    accuracy: null,
    created_at,
  }
}

const snapshots = [
  snap(5200, '2026-10-20T08:00:00Z'),
  snap(5250, '2026-10-25T08:00:00Z'),
]

function render(props: {
  plays: OsuScore[]
  currentPp?: number
  snapshots?: StatSnapshot[] | null
  isAccount?: boolean
}) {
  return renderToStaticMarkup(
    <RecentPlaysSection
      plays={props.plays}
      currentPp={props.currentPp ?? 5284}
      // NB: explicit null must stay null (snapshots still loading) —
      // `??` would wrongly substitute the default array for it.
      snapshots={props.snapshots !== undefined ? props.snapshots : snapshots}
      isAccount={props.isAccount ?? true}
      modeLabel="Mania"
    />,
  )
}

describe('RecentPlaysSection (§AJ)', () => {
  it('renders each play with its result pp', () => {
    const html = render({
      plays: [
        play({ id: 1, pp: 120, beatmapset: { id: 1, title: 'First Map', artist: 'A', creator: 'M', status: 'ranked' } }),
        play({ id: 2, pp: 87, beatmapset: { id: 2, title: 'Second Map', artist: 'B', creator: 'M', status: 'ranked' } }),
      ],
    })
    expect(html).toContain('Recent plays')
    expect(html).toContain('First Map')
    expect(html).toContain('Second Map')
    expect(html).toContain('120 pp')
    expect(html).toContain('87 pp')
  })

  it('shows — for a play with null pp', () => {
    const html = render({ plays: [play({ pp: null })] })
    expect(html).toContain('—')
    expect(html).not.toContain('null pp')
  })

  it('shows the total with its period date, never the sum of the plays', () => {
    // The two plays are worth 120 + 87 = 207 pp summed — the total
    // must be the profile delta (5284 − 5250 = 34), not 207.
    const html = render({
      plays: [
        play({ id: 1, pp: 120, created_at: '2026-10-30T10:00:00Z' }),
        play({ id: 2, pp: 87, created_at: '2026-10-28T10:00:00Z' }),
      ],
    })
    expect(html).toContain('+34 pp')
    expect(html).toContain(new Date('2026-10-25T08:00:00Z').toLocaleDateString())
    expect(html).not.toContain('207 pp')
  })

  it('shows a negative gain with a minus sign', () => {
    const html = render({
      plays: [play({ created_at: '2026-10-30T10:00:00Z' })],
      currentPp: 5200,
    })
    expect(html).toContain('−50 pp')
  })

  it('shows mods, rank and date on a row', () => {
    const html = render({
      plays: [play({ mods: ['HD', 'HR'], rank: 'A', created_at: '2026-10-30T10:00:00Z' })],
    })
    expect(html).toContain('HDHR')
    expect(html).toContain('rank A')
    expect(html).toContain(new Date('2026-10-30T10:00:00Z').toLocaleDateString())
  })

  it('guests see the plays but no total', () => {
    const html = render({
      plays: [play({})],
      isAccount: false,
    })
    expect(html).toContain('Test Map')
    expect(html).not.toContain('+34 pp')
    expect(html).toContain('account-only')
  })

  it('accounts with no snapshots get an honest line and no total', () => {
    const html = render({ plays: [play({})], snapshots: [] })
    expect(html).toContain('Test Map')
    expect(html).not.toContain('+34 pp')
    expect(html).toContain('No snapshots yet')
  })

  it('shows an honest empty state with no recent plays', () => {
    const html = render({ plays: [], snapshots: [] })
    expect(html).toContain('No recent plays in Mania yet.')
    expect(html).not.toContain('+34 pp')
  })

  it('shows no total while snapshots are still loading', () => {
    const html = render({ plays: [play({})], snapshots: null })
    expect(html).toContain('Test Map')
    expect(html).not.toContain('+34 pp')
    expect(html).not.toContain('No snapshots yet')
  })
})
