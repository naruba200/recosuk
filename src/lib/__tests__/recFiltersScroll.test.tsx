import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { AuthProvider } from '../auth'
import RecFiltersPanel from '../../components/RecFiltersPanel'
import { RecommendationsDemo } from '../../screens/Recommendations'
import { RecommendationsUnlimitedDemo } from '../../screens/RecommendationsUnlimited'
import type { RecFilters } from '../recommend'
import type { SkillProfile } from '../skillProfile'

/**
 * §AL — the Recommendations filter rail scrolls inside its own box,
 * separate from the list (which keeps window scroll). The rail is
 * rendered three times: once as the shared RecFiltersPanel (used by
 * both Real views) and once inline in each Demo. All three asides
 * must carry the same independent-scroll classes.
 */

// Independent-scroll rule (§AL): sticky offset top-20 (5rem) + 1rem
// bottom gap, in dynamic viewport units.
const SCROLL_CLASSES = [
  'sticky',
  'top-20',
  'max-h-[calc(100dvh-6rem)]',
  'overflow-y-auto',
  'overscroll-contain',
]

function tagClass(html: string, tag: 'aside' | 'main', mustContain: string): string {
  // The demo renders inside AppShell, whose sidebar is an <aside> and
  // whose content wrapper is a <main> — pick the grid column by its
  // distinguishing class instead of assuming a single tag.
  const matches = [...html.matchAll(new RegExp(`<${tag} class="([^"]*)"`, 'g'))]
    .map((m) => m[1])
    .filter((cls) => cls.split(' ').includes(mustContain))
  expect(matches.length, `expected exactly one <${tag}> containing ${mustContain}`).toBe(1)
  return matches[0]
}

function expectIndependentScroll(classAttr: string): void {
  for (const cls of SCROLL_CLASSES) {
    expect(classAttr.split(' ')).toContain(cls)
  }
  // Sidebar grid placement is unchanged.
  expect(classAttr.split(' ')).toContain('lg:col-span-4')
  expect(classAttr.split(' ')).toContain('xl:col-span-3')
}

const draft: RecFilters = {
  srMin: 4.0,
  srMax: 5.5,
  bpmMin: 150,
  bpmMax: 200,
  lenMinSec: 60,
  lenMaxSec: 300,
  rankedLovedOnly: true,
  keyCount: null,
  userTag: null,
}

const profile: SkillProfile = {
  mode: 'osu',
  pp: 1000,
  globalRank: 10000,
  countryRank: 100,
  accuracy: 97,
  playCount: 500,
  comfortSrMin: 4.0,
  comfortSrMax: 5.0,
  comfortAccuracy: 96,
  srCeiling: 5.5,
  ceilingAccuracy: null,
  bpmSweetMin: 170,
  bpmSweetMax: 190,
  bpmMean: 180,
  avgAr: 0,
  keyCounts: {},
  mainKeyCount: null,
  keySharePct: null,
  accuracyBands: [],
  modUsage: [],
  playstyleTags: [],
  recentAccuracy: null,
  topPlayCount: 50,
  isStarter: false,
  generatedAt: '2026-11-04T00:00:00.000Z',
}

describe('§AL filter rail independent scroll', () => {
  it('RecFiltersPanel aside scrolls in its own box (both Real views)', () => {
    const html = renderToStaticMarkup(
      <RecFiltersPanel
        draft={draft}
        onDraftChange={() => {}}
        onApply={() => {}}
        profile={profile}
        mode="osu"
        appliedCount={12}
      />,
    )
    expectIndependentScroll(tagClass(html, 'aside', 'lg:col-span-4'))
  })

  it('RecommendationsDemo aside scrolls in its own box', () => {
    // The demo renders NavLinks, so it needs a Router context.
    const html = renderToStaticMarkup(
      <AuthProvider>
        <MemoryRouter>
          <RecommendationsDemo />
        </MemoryRouter>
      </AuthProvider>,
    )
    expectIndependentScroll(tagClass(html, 'aside', 'lg:col-span-4'))
  })

  it('RecommendationsUnlimitedDemo aside scrolls in its own box', () => {
    const html = renderToStaticMarkup(
      <AuthProvider>
        <MemoryRouter>
          <RecommendationsUnlimitedDemo />
        </MemoryRouter>
      </AuthProvider>,
    )
    expectIndependentScroll(tagClass(html, 'aside', 'lg:col-span-4'))
  })

  it('the list keeps window scroll — no own scroll container on <main>', () => {
    for (const html of [
      renderToStaticMarkup(
        <AuthProvider>
          <MemoryRouter>
            <RecommendationsDemo />
          </MemoryRouter>
        </AuthProvider>,
      ),
      renderToStaticMarkup(
        <AuthProvider>
          <MemoryRouter>
            <RecommendationsUnlimitedDemo />
          </MemoryRouter>
        </AuthProvider>,
      ),
    ]) {
      const mainClass = tagClass(html, 'main', 'lg:col-span-8')
      expect(mainClass.split(' ')).not.toContain('overflow-y-auto')
      expect(mainClass.split(' ')).not.toContain('overflow-y-scroll')
      expect(mainClass).not.toContain('max-h-[')
    }
  })
})
