import { useEffect, useMemo, useState } from 'react'
import type { GameMode } from '../lib/mode'
import {
  BUNDLED_USER_TAGS,
  findUserTag,
  groupUserTags,
  loadUserTags,
  tagsForMode,
  type UserTag,
} from '../lib/userTags'

/**
 * User-tag picker (batch 11, part 4): single-select, grouped by
 * the wiki categories, filtered to the current mode. The
 * vocabulary starts as the bundled wiki list (so the picker is
 * usable before the Edge Function redeploy) and upgrades to the
 * live `GET /tags` result when it arrives in a recognisable
 * shape — `loadUserTags` falls back to the bundled list on any
 * failure, so there is no error state to show here.
 *
 * A selected tag that the live vocabulary no longer lists for
 * this mode stays visible in the "Selected" row (with its
 * bundled description, when known) so the choice is never
 * silently hidden — tapping it clears the filter.
 */

interface UserTagPickerProps {
  /** Current mode; 'all' shows the union (Mirror's all-modes tab). */
  mode: GameMode | 'all'
  /** Selected tag id ("group/name"), or null for no tag filter. */
  value: string | null
  onChange: (next: string | null) => void
}

export default function UserTagPicker({ mode, value, onChange }: UserTagPickerProps) {
  const [tags, setTags] = useState<UserTag[]>(BUNDLED_USER_TAGS)
  const [openGroups, setOpenGroups] = useState<ReadonlySet<string>>(new Set())

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
  const groups = useMemo(() => groupUserTags(visible), [visible])
  const selected = findUserTag(tags, value) ??
    (value
      ? { id: value, group: value.split('/')[0] ?? 'other', name: value.split('/').slice(1).join('/') || value, description: '', modes: null }
      : undefined)

  // The selected tag's group starts open so the selection is
  // visible in context; other groups start collapsed (122 tags
  // would otherwise flood the filter panel / drawer).
  useEffect(() => {
    if (selected) {
      setOpenGroups((prev) => {
        if (prev.has(selected.group)) return prev
        const next = new Set(prev)
        next.add(selected.group)
        return next
      })
    }
  }, [selected?.group])

  const toggleGroup = (group: string) =>
    setOpenGroups((prev) => {
      const next = new Set(prev)
      if (next.has(group)) next.delete(group)
      else next.add(group)
      return next
    })

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
      <div className="flex flex-col gap-1 max-h-80 overflow-y-auto pr-1">
        {groups.map(({ group, label, tags: groupTags }) => {
          const open = openGroups.has(group)
          return (
            <section key={group}>
              <button
                className="w-full flex items-center justify-between py-1 text-left"
                type="button"
                aria-expanded={open}
                onClick={() => toggleGroup(group)}
              >
                <span className="font-label-md text-label-md text-on-surface font-bold uppercase tracking-wider">
                  {label}
                  <span className="text-on-surface-variant font-normal normal-case tracking-normal"> · {groupTags.length}</span>
                </span>
                <span className="material-symbols-outlined text-on-surface-variant text-[18px]">
                  {open ? 'expand_less' : 'expand_more'}
                </span>
              </button>
              {open && (
                <div className="flex flex-wrap gap-1.5 pb-1">
                  {groupTags.map((tag) => {
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
              )}
            </section>
          )
        })}
      </div>
      <p className="font-body-sm text-[11px] leading-relaxed text-on-surface-variant">
        User tags are voted by players in lazer. Picking one filters
        the search on osu! itself — maps without enough votes for
        the tag will not appear.
      </p>
    </div>
  )
}
