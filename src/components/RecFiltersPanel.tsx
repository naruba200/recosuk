import type { GameMode } from '../lib/mode'
import type { SkillProfile } from '../lib/skillProfile'
import { defaultFiltersFor, type RecFilters } from '../lib/recommend'

/**
 * The Recommendations filter rail (Stitch markup) with real controlled
 * state. Filters narrow the pool before scoring — they never re-sort
 * (PLAN-v2 §3). Edits are draft state; "Apply filters" commits them
 * (which regenerates / restarts the feed), "Reset" restores the
 * profile-derived defaults.
 */

const TAG_CHIPS = ['jumpstream', 'chordjack', 'ln', 'stream', 'technical', 'stamina']
const KEY_COUNTS = [4, 5, 6, 7, 8]

interface Props {
  draft: RecFilters
  onDraftChange: (next: RecFilters) => void
  onApply: () => void
  profile: SkillProfile
  mode: GameMode
  appliedCount: number | null
}

export default function RecFiltersPanel({
  draft,
  onDraftChange,
  onApply,
  profile,
  mode,
  appliedCount,
}: Props) {
  const set = (patch: Partial<RecFilters>) => onDraftChange({ ...draft, ...patch })
  const tagChips = [...new Set([...profile.playstyleTags, ...TAG_CHIPS])].slice(0, 6)

  return (
    <aside className="lg:col-span-4 xl:col-span-3 flex flex-col gap-space-md bg-surface-container-low p-space-md rounded-lg shadow-md sticky top-20">
      <div className="flex items-center justify-between pb-space-xs">
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-primary text-[20px]">tune</span>
            <h2 className="font-headline-sm text-headline-sm text-on-surface">Filters</h2>
          </div>
          <span className="font-body-sm text-body-sm text-on-surface-variant">Filters narrow list. Ranking is pp-based.</span>
        </div>
      </div>

      {/* Star Rating Range */}
      <div className="flex flex-col gap-space-xs bg-surface-container p-space-sm rounded-DEFAULT">
        <div className="flex items-center justify-between">
          <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">Difficulty</span>
          <span className="font-label-md text-label-md text-primary font-bold">{draft.srMin.toFixed(1)}★ – {draft.srMax.toFixed(1)}★</span>
        </div>
        <label className="flex items-center gap-2 font-label-sm text-[10px] text-on-surface-variant">
          <span className="w-8">Min</span>
          <input className="w-full accent-[#d2bbff]" type="range" min={0} max={10} step={0.1} value={draft.srMin} onChange={(e) => set({ srMin: Math.min(Number(e.target.value), draft.srMax) })} />
        </label>
        <label className="flex items-center gap-2 font-label-sm text-[10px] text-on-surface-variant">
          <span className="w-8">Max</span>
          <input className="w-full accent-[#d2bbff]" type="range" min={0} max={10} step={0.1} value={draft.srMax} onChange={(e) => set({ srMax: Math.max(Number(e.target.value), draft.srMin) })} />
        </label>
        <div className="flex justify-between font-label-sm text-[10px] text-on-surface-variant">
          <span>0★</span>
          <span>{profile.srCeiling.toFixed(1)}★ Target</span>
          <span>10★</span>
        </div>
      </div>

      {/* BPM Range */}
      <div className="flex flex-col gap-space-xs bg-surface-container p-space-sm rounded-DEFAULT">
        <div className="flex items-center justify-between">
          <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">Tempo</span>
          <span className="font-label-md text-label-md text-secondary font-bold">{draft.bpmMin} – {draft.bpmMax} BPM</span>
        </div>
        <label className="flex items-center gap-2 font-label-sm text-[10px] text-on-surface-variant">
          <span className="w-8">Min</span>
          <input className="w-full accent-[#ffb0cc]" type="range" min={60} max={300} step={5} value={draft.bpmMin} onChange={(e) => set({ bpmMin: Math.min(Number(e.target.value), draft.bpmMax) })} />
        </label>
        <label className="flex items-center gap-2 font-label-sm text-[10px] text-on-surface-variant">
          <span className="w-8">Max</span>
          <input className="w-full accent-[#ffb0cc]" type="range" min={60} max={300} step={5} value={draft.bpmMax} onChange={(e) => set({ bpmMax: Math.max(Number(e.target.value), draft.bpmMin) })} />
        </label>
        <div className="flex justify-between font-label-sm text-[10px] text-on-surface-variant">
          <span>60</span>
          <span>{profile.bpmMean || 180} BPM avg</span>
          <span>300</span>
        </div>
      </div>

      {/* Key Count (Mania only, §2.1) */}
      {mode === 'mania' && (
        <div className="flex flex-col gap-space-xs">
          <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">Key Count (Mania)</span>
          <div className="grid grid-cols-3 gap-1.5">
            {KEY_COUNTS.map((k) => (
              <button
                key={k}
                className={draft.keyCount === k
                  ? 'py-1.5 text-center rounded-DEFAULT bg-primary text-on-primary font-label-md text-label-md font-bold shadow-[0_0_12px_rgba(210,187,255,0.4)]'
                  : 'py-1.5 text-center rounded-DEFAULT bg-surface-container hover:bg-surface-container-high text-on-surface-variant font-label-sm text-label-sm transition-colors'}
                type="button"
                onClick={() => set({ keyCount: draft.keyCount === k ? null : k })}
              >
                {k}K
              </button>
            ))}
            <button
              className={draft.keyCount === null
                ? 'py-1.5 text-center rounded-DEFAULT bg-primary text-on-primary font-label-md text-label-md font-bold shadow-[0_0_12px_rgba(210,187,255,0.4)]'
                : 'py-1.5 text-center rounded-DEFAULT bg-surface-container hover:bg-surface-container-high text-on-surface-variant font-label-sm text-label-sm transition-colors'}
              type="button"
              onClick={() => set({ keyCount: null })}
            >
              All
            </button>
          </div>
        </div>
      )}

      {/* Pattern tags */}
      <div className="flex flex-col gap-space-xs">
        <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">Pattern Skillsets</span>
        <div className="flex flex-wrap gap-1.5">
          {tagChips.map((tag) => (
            <button
              key={tag}
              className={draft.tagText === tag
                ? 'px-2.5 py-1 rounded-full bg-primary-container text-on-primary-container font-label-sm text-label-sm shadow-sm'
                : 'px-2.5 py-1 rounded-full bg-surface-container text-on-surface hover:bg-surface-container-high font-label-sm text-label-sm transition-colors'}
              type="button"
              onClick={() => set({ tagText: draft.tagText === tag ? '' : tag })}
            >
              {tag}
            </button>
          ))}
        </div>
        <input
          className="w-full bg-surface-container text-on-surface px-3 py-2 rounded-full font-body-sm text-body-sm focus:outline-none focus:bg-surface-container-highest transition-colors placeholder:text-outline-variant"
          placeholder="Or type a tag / keyword…"
          type="text"
          value={draft.tagText}
          onChange={(e) => set({ tagText: e.target.value })}
        />
      </div>

      {/* Status */}
      <div className="flex flex-col gap-space-xs">
        <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">Beatmap Status</span>
        <div className="flex flex-col gap-1">
          <label
            className={`flex items-center justify-between p-2 rounded-DEFAULT cursor-pointer ${draft.rankedLovedOnly ? 'bg-primary-container/20' : 'bg-surface-container hover:bg-surface-container-high'}`}
            onClick={() => set({ rankedLovedOnly: true })}
          >
            <span className={`font-label-sm text-label-sm ${draft.rankedLovedOnly ? 'text-primary font-semibold' : 'text-on-surface-variant'}`}>Ranked + Loved</span>
            <div className={`w-4 h-4 rounded-full flex items-center justify-center ${draft.rankedLovedOnly ? 'bg-primary' : 'bg-surface-container-highest'}`}>
              {draft.rankedLovedOnly && <span className="w-1.5 h-1.5 rounded-full bg-on-primary"></span>}
            </div>
          </label>
          <label
            className={`flex items-center justify-between p-2 rounded-DEFAULT cursor-pointer ${!draft.rankedLovedOnly ? 'bg-primary-container/20' : 'bg-surface-container hover:bg-surface-container-high'}`}
            onClick={() => set({ rankedLovedOnly: false })}
          >
            <span className={`font-label-sm text-label-sm ${!draft.rankedLovedOnly ? 'text-primary font-semibold' : 'text-on-surface-variant'}`}>Include Qualified / WIP</span>
            <div className={`w-4 h-4 rounded-full flex items-center justify-center ${!draft.rankedLovedOnly ? 'bg-primary' : 'bg-surface-container-highest'}`}>
              {!draft.rankedLovedOnly && <span className="w-1.5 h-1.5 rounded-full bg-on-primary"></span>}
            </div>
          </label>
        </div>
      </div>

      {/* Length */}
      <div className="flex flex-col gap-1 bg-surface-container p-space-sm rounded-DEFAULT">
        <div className="flex justify-between items-center">
          <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">Length</span>
          <span className="font-label-sm text-label-sm text-on-surface font-semibold">
            {Math.floor(draft.lenMinSec / 60)}:{String(draft.lenMinSec % 60).padStart(2, '0')} – {Math.floor(draft.lenMaxSec / 60)}:{String(draft.lenMaxSec % 60).padStart(2, '0')} min
          </span>
        </div>
        <label className="flex items-center gap-2 font-label-sm text-[10px] text-on-surface-variant">
          <span className="w-8">Min</span>
          <input className="w-full accent-[#80d0ff]" type="range" min={30} max={600} step={30} value={draft.lenMinSec} onChange={(e) => set({ lenMinSec: Math.min(Number(e.target.value), draft.lenMaxSec) })} />
        </label>
        <label className="flex items-center gap-2 font-label-sm text-[10px] text-on-surface-variant">
          <span className="w-8">Max</span>
          <input className="w-full accent-[#80d0ff]" type="range" min={30} max={600} step={30} value={draft.lenMaxSec} onChange={(e) => set({ lenMaxSec: Math.max(Number(e.target.value), draft.lenMinSec) })} />
        </label>
      </div>

      <div className="flex flex-col gap-2 pt-space-xs">
        <button className="w-full py-2.5 rounded-full bg-primary text-on-primary font-label-md text-label-md font-bold shadow-[0_0_14px_rgba(210,187,255,0.3)] hover:opacity-95 transition-opacity" type="button" onClick={onApply}>
          Apply filters{appliedCount !== null ? ` (${appliedCount} maps)` : ''}
        </button>
        <button className="w-full py-2 rounded-full text-on-surface-variant hover:text-on-surface hover:bg-surface-container font-label-sm text-label-sm transition-colors" type="button" onClick={() => onDraftChange(defaultFiltersFor(profile))}>
          Reset filters
        </button>
      </div>
    </aside>
  )
}
