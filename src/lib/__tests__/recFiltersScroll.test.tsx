import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { AuthProvider } from '../auth'
import RecFiltersPanel from '../../components/RecFiltersPanel'
import { RecommendationsReal } from '../../screens/Recommendations'
import { FeedReal } from '../../screens/RecommendationsUnlimited'
import type { ProfileData } from '../profileService'
import type { RecFilters } from '../recommend'
import type { SkillProfile } from '../skillProfile'

/**
 * §AL — the Recommendations filter rail scrolls inside its own box,
 * separate from the list (which keeps window scroll). The rail is
 * the shared RecFiltersPanel, rendered by both Real views
 * (RecommendationsReal + FeedReal); the aside must carry the same
 * independent-scroll classes in both.
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
  // The Real views render inside a grid whose sidebar is an <aside>
  // and whose content wrapper is a <main> — pick the grid column by
  // its distinguishing class instead of assuming a single tag.
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

const data: ProfileData = {
  user: { id: 1, username: 'test', playmode: 'osu' },
  topPlays: [],
  recentPlays: [],
  mostPlayed: [],
  skillProfile: profile,
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

  it('RecommendationsReal aside scrolls in its own box', () => {
    const html = renderToStaticMarkup(
      <AuthProvider>
        <MemoryRouter>
          <RecommendationsReal
            data={data}
            filters={draft}
            draft={draft}
            onFiltersChange={() => {}}
            onDraftChange={() => {}}
            resumeRef={{ current: null }}
            active
          />
        </MemoryRouter>
      </AuthProvider>,
    )
    expectIndependentScroll(tagClass(html, 'aside', 'lg:col-span-4'))
  })

  it('FeedReal aside scrolls in its own box', () => {
    const html = renderToStaticMarkup(
      <AuthProvider>
        <MemoryRouter>
          <FeedReal
            data={data}
            filters={draft}
            draft={draft}
            onFiltersChange={() => {}}
            onDraftChange={() => {}}
            active
            renderBackToTop={false}
          />
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
            <RecommendationsReal
              data={data}
              filters={draft}
              draft={draft}
              onFiltersChange={() => {}}
              onDraftChange={() => {}}
              resumeRef={{ current: null }}
              active
            />
          </MemoryRouter>
        </AuthProvider>,
      ),
      renderToStaticMarkup(
        <AuthProvider>
          <MemoryRouter>
            <FeedReal
              data={data}
              filters={draft}
              draft={draft}
              onFiltersChange={() => {}}
              onDraftChange={() => {}}
              active
              renderBackToTop={false}
            />
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
