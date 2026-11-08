import { useEffect, useMemo, useState } from 'react'
import type { GameMode } from '../lib/mode'
import {
  BUNDLED_USER_TAGS,
  defaultVisibleTags,
  expandedVisibleTags,
  findUserTag,
  loadUserTags,
  tagsForMode,
  type UserTag,
} from '../lib/userTags'

/**
 * User-tag picker (batch 11, part 4; one-section rework in
 * batch AN): single-select, filtered to the current mode. The
 * vocabulary starts as the bundled wiki list (so the picker is
 * usable before the Edge Function redeploy) and upgrades to the
 * live `GET /tags` result when it arrives in a recognisable
 * shape — `loadUserTags` falls back to the bundled list on any
 * failure, so there is no error state to show here.
 *
 * ONE section (§AN): by default the top tag of each group (12
 * tags — the first in wiki order; there is no usage data, so
 * "top" is wiki order, not most-used). Picking a tag shows that
 * tag + the next 2 in its group, alongside the other groups'
 * top tags. Selection behaviour is unchanged (one tag id out).
 *
 * A selected tag that the live vocabulary no longer lists for
 * this mode stays visible in the "Selected" row (with its
 * bundled description, when known) so the choice is never
 * silently hidden — tapping it clears the filter.
 */

interface UserTagPickerProps {
  /** Current mode; 'all' shows the union of every mode's tags. */
  mode: GameMode | 'all'
  /** Selected tag id ("group/name"), or null for no tag filter. */
  value: string | null
  onChange: (next: string | null) => void
}

export default function UserTagPicker({ mode, value, onChange }: UserTagPickerProps) {
  const [tags, setTags] = useState<UserTag[]>(BUNDLED_USER_TAGS)

  useEffect(() => {
    let live = true
    void loadUserTags().then((loaded) => {
      if (live) setTags(loaded)
    })
    return () => {
      live = false
    }
  }, [])

  const visible = useMemo(() => tagsForMode(tags, mode), [tags, mode])
  const shown = useMemo(
    () => (value ? expandedVisibleTags(visible, value) : defaultVisibleTags(visible)),
    [visible, value],
  )
  const selected = findUserTag(tags, value) ??
    (value
      ? { id: value, group: value.split('/')[0] ?? 'other', name: value.split('/').slice(1).join('/') || value, description: '', modes: null }
      : undefined)

  const pick = (tag: UserTag) => onChange(value === tag.id ? null : tag.id)

  return (
    <div className="flex flex-col gap-space-xs">
      {selected && (
        <div className="flex items-center gap-1.5">
          <span className="font-label-sm text-label-sm text-on-surface-variant">Selected:</span>
          <button
            className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary-container text-on-primary-container font-label-sm text-label-sm shadow-sm"
            type="button"
            title={selected.description || selected.id}
            aria-label={`Clear user tag ${selected.id}`}
            onClick={() => onChange(null)}
          >
            <span>{selected.id}</span>
            <span className="material-symbols-outlined text-[14px] leading-none">close</span>
          </button>
        </div>
      )}
      <section aria-label="User tags">
        <div className="flex flex-wrap gap-1.5 max-h-80 overflow-y-auto pr-1">
          {shown.map((tag) => {
            const isSelected = value === tag.id
            return (
              <button
                key={tag.id}
                className={
                  isSelected
                    ? 'px-2.5 py-1 rounded-full bg-primary-container text-on-primary-container font-label-sm text-label-sm shadow-sm'
                    : 'px-2.5 py-1 rounded-full bg-surface-container text-on-surface hover:bg-surface-container-high font-label-sm text-label-sm transition-colors'
                }
                type="button"
                aria-pressed={isSelected}
                title={tag.description || tag.id}
                onClick={() => pick(tag)}
              >
                {tag.name}
              </button>
            )
          })}
        </div>
      </section>
      <p className="font-body-sm text-[11px] leading-relaxed text-on-surface-variant">
        User tags are voted by players in lazer. Picking one filters
        the search on osu! itself — maps without enough votes for
        the tag will not appear.
      </p>
    </div>
  )
}
