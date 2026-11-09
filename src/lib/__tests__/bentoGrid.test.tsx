import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'
import { RANKED_WINDOWS, type RankedCompilation } from '../rankedLists'
import type { RankedPeriodCard } from '../rankedCards'
import { RankedCardsGrid } from '../../screens/Collections'

/**
 * §AT — the ranked month/year cards as a Magic UI bento grid.
 * Same rendered-class style as appShellMenu.test.tsx: the grid
 * and the cards are asserted on their static markup, not on a
 * live browser. The node test env has no DOM, so the click
 * wiring is pinned by invoking the (hook-free) grid component
 * directly and calling the tile's onOpen prop.
 */

const monthWindow = RANKED_WINDOWS.find((w) => w.id === 'month') ?? RANKED_WINDOWS[0]

function fakeCompilation(count: number, withCover: boolean): RankedCompilation {
  return {
    entries: Array.from({ length: count }, (_, i) => ({
      candidate: {
        cover: withCover && i === 0 ? 'https://example.com/cover.jpg' : '',
        title: i === 0 ? 'First Song' : `Song ${i + 1}`,
        artist: i === 0 ? 'First Artist' : `Artist ${i + 1}`,
        beatmapsetId: 100 + i,
      },
    })),
  } as unknown as RankedCompilation
}

function fakeCard(period: string, label: string): RankedPeriodCard {
  return {
    granularity: 'month',
    period,
    label,
    startMs: 0,
    endMs: 1,
    window: monthWindow,
  }
}

function fakeCards(): RankedPeriodCard[] {
  return [
    fakeCard('2026-11-w1', 'Nov 1–7, 2026'),
    fakeCard('2026-10-w4', 'Oct 22–31, 2026'),
    fakeCard('2026-10-w3', 'Oct 15–21, 2026'),
    fakeCard('2026-10-w2', 'Oct 8–14, 2026'),
  ]
}

function fakeStates() {
  const state = (count: number, withCover: boolean) => ({
    compilation: fakeCompilation(count, withCover),
    compiling: false,
    error: null,
    stale: false,
    hidden: false,
  })
  return {
    '2026-11-w1': state(2, true),
    '2026-10-w4': state(3, false),
    '2026-10-w3': state(1, false),
    '2026-10-w2': state(5, false),
  }
}

function classOf(html: string, tag: string, mustContain: string): string | null {
  const matches = [...html.matchAll(new RegExp(`<${tag}[^>]*class="([^"]*)"`, 'g'))]
    .map((m) => m[1])
    .filter((cls) => cls.split(' ').includes(mustContain))
  return matches.length > 0 ? matches[0] : null
}

/** The BentoCard shells: divs whose class list has the standalone `group` token. */
function cardShells(html: string): string[] {
  return [...html.matchAll(/<div[^>]*class="([^"]*)"/g)]
    .map((m) => m[1])
    .filter((cls) => cls.split(' ').includes('group'))
}

function renderGrid() {
  return renderToStaticMarkup(
    <RankedCardsGrid cards={fakeCards()} cardStates={fakeStates()} onOpen={() => {}} />,
  )
}

describe('ranked bento grid (§AT)', () => {
  it('renders a uniform grid: 1 col on phones, 2 on sm, 4 on xl', () => {
    const html = renderGrid()
    const grid = classOf(html, 'div', 'grid-cols-1')
    expect(grid).not.toBeNull()
    expect(grid).toContain('grid')
    expect(grid).toContain('w-full')
    expect(grid).toContain('sm:grid-cols-2')
    expect(grid).toContain('xl:grid-cols-4')
    // No 3-column base from upstream, no fixed 22rem rows.
    expect(grid).not.toContain('grid-cols-3')
    expect(grid).not.toContain('auto-rows-[22rem]')
  })

  it('every card is the same size: one column at every width', () => {
    const html = renderGrid()
    const shells = cardShells(html)
    expect(shells).toHaveLength(4)
    for (const shell of shells) {
      expect(shell).toContain('col-span-1')
      expect(shell).not.toContain('col-span-3')
      expect(shell).not.toContain('lg:col-span-2')
    }
  })

  it('tile content is unchanged: label, count, #1 map, cover, CTA', () => {
    const html = renderGrid()
    expect(html).toContain('Nov 1–7, 2026')
    expect(html).toContain('2 maps')
    expect(html).toContain('#1 First Song — First Artist')
    expect(html).toContain('https://example.com/cover.jpg')
    // Each tile carries the bento CTA line twice (in-flow on
    // mobile, hover-revealed on desktop).
    expect(html.match(/Open list/g) ?? []).toHaveLength(8)
    // The tile is still a button with its per-card label.
    expect(html).toContain('aria-label="Nov 1–7, 2026 — 2 maps"')
  })

  it('clicking a card opens that period (wiring)', () => {
    // RankedCardsGrid uses no hooks, so it can be invoked as a
    // plain function to reach the tile props directly — the node
    // test env has no DOM for a real click dispatch.
    const opened: string[] = []
    const element = RankedCardsGrid({
      cards: fakeCards(),
      cardStates: fakeStates(),
      onOpen: (card) => opened.push(card.period),
    })
    // React 19 types default ReactElement's props to unknown, so
    // the element shapes are pinned explicitly here.
    type TileElement = ReactElement<{ onOpen: () => void }>
    type BentoCardElement = ReactElement<{ children: TileElement }>
    const bentoCards = element.props.children as BentoCardElement[]
    expect(bentoCards).toHaveLength(4)
    const tile = bentoCards[1].props.children as TileElement
    tile.props.onOpen()
    expect(opened).toEqual(['2026-10-w4'])
  })
})
