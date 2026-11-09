/// <reference types="node" />
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * §AU — Collections single-song downloads use the native Auto
 * path (user decision 2026-11-09, same as Recommendations §AF):
 * the week-list rows, the ranked detail rows, and the History
 * redownload button all pass 'auto', so the main button follows
 * resolveNativeMirrorOrder (BeatConnect first by default, or the
 * user's Mirror Route Priority) instead of opening the official
 * osu! tab. Official stays in the expand menu. Beatmaps
 * (Mirror) rows keep official-first — out of scope for this
 * batch.
 *
 * The screens are hook-using components, so their call sites are
 * audited as source (same pattern as flatThemes.test.ts), while
 * the 'auto' behaviour itself is pinned by
 * resolvePrimaryDownload in downloadPrimary.test.ts (§AF).
 */

const collections = readFileSync(
  fileURLToPath(new URL('../../screens/Collections.tsx', import.meta.url)),
  'utf8',
)
const rankedDetail = readFileSync(
  fileURLToPath(new URL('../../screens/RankedDetail.tsx', import.meta.url)),
  'utf8',
)
const history = readFileSync(
  fileURLToPath(new URL('../../screens/History.tsx', import.meta.url)),
  'utf8',
)
const beatmapRow = readFileSync(
  fileURLToPath(new URL('../../components/BeatmapRow.tsx', import.meta.url)),
  'utf8',
)
const beatmaps = readFileSync(
  fileURLToPath(new URL('../../screens/Beatmaps.tsx', import.meta.url)),
  'utf8',
)

/** The JSX block of the first `<BeatmapRow ... />` in `src`. */
function beatmapRowBlock(src: string, label: string): string {
  const start = src.indexOf('<BeatmapRow')
  expect(start, `no <BeatmapRow in ${label}`).toBeGreaterThan(-1)
  const end = src.indexOf('/>', start)
  expect(end, `unterminated <BeatmapRow in ${label}`).toBeGreaterThan(start)
  return src.slice(start, end)
}

/** Every `<BeatmapRow ... />` block in `src`. */
function allBeatmapRowBlocks(src: string, label: string): string[] {
  const blocks: string[] = []
  let from = 0
  for (;;) {
    const start = src.indexOf('<BeatmapRow', from)
    if (start === -1) break
    const end = src.indexOf('/>', start)
    expect(end, `unterminated <BeatmapRow in ${label}`).toBeGreaterThan(start)
    blocks.push(src.slice(start, end))
    from = end + 2
  }
  expect(blocks.length, `no <BeatmapRow in ${label}`).toBeGreaterThan(0)
  return blocks
}

/** The JSX block of the first `<DownloadButton ... />` in `src`. */
function downloadButtonBlock(src: string, label: string): string {
  const start = src.indexOf('<DownloadButton')
  expect(start, `no <DownloadButton in ${label}`).toBeGreaterThan(-1)
  const end = src.indexOf('/>', start)
  expect(end, `unterminated <DownloadButton in ${label}`).toBeGreaterThan(start)
  return src.slice(start, end)
}

describe('Collections single-song downloads use Auto (§AU)', () => {
  it('Collections week rows pass downloadPrimary="auto" to BeatmapRow', () => {
    expect(beatmapRowBlock(collections, 'Collections.tsx')).toContain(
      'downloadPrimary="auto"',
    )
  })

  it('RankedDetail rows pass downloadPrimary="auto" to BeatmapRow', () => {
    expect(beatmapRowBlock(rankedDetail, 'RankedDetail.tsx')).toContain(
      'downloadPrimary="auto"',
    )
  })

  it('History redownload passes primary="auto" to DownloadButton', () => {
    expect(downloadButtonBlock(history, 'History.tsx')).toContain(
      'primary="auto"',
    )
  })

  it('BeatmapRow forwards downloadPrimary to its DownloadButton', () => {
    expect(beatmapRow).toContain('primary={downloadPrimary}')
  })

  it('Beatmaps (Mirror) rows keep official-first — out of scope', () => {
    const blocks = allBeatmapRowBlocks(beatmaps, 'Beatmaps.tsx')
    expect(blocks).toHaveLength(2)
    for (const block of blocks) {
      expect(block).not.toContain('downloadPrimary')
    }
  })
})
