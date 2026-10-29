import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { GameMode } from '../lib/mode'
import { modeLabel } from '../lib/mode'
import type { RecCandidate } from '../lib/recommend'
import { essentialTags, formatLength, modeTagLabel } from '../lib/recommend'
import { usePreviewPlayer } from '../lib/previewPlayer'
import { useCapabilities } from '../lib/capabilities'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import {
  addToList,
  createList,
  listsContainingSet,
  loadLists,
  removeFromList,
  type UserList,
} from '../lib/lists'
import {
  loadFeedbackForBeatmap,
  upsertFeedback,
  type FeedbackEntry,
} from '../lib/feedback'
import LockedButton from './LockedButton'
import DownloadButton from './DownloadButton'

/**
 * One recommendation/mirror result row, shared by Recommendations
 * (Generated + Unlimited), Welcome Recs and Mirror. Markup follows the
 * Stitch card rows: cover, SR pill, title/artist, reason line, metric
 * chips, and the trailing action suite (preview / download+mirrors /
 * save / rate / skip).
 *
 * Gating (§6): Save and Rate render through LockedButton — visible but
 * locked for guests. For accounts they are live (M5): Save opens a
 * list picker popover (lists CRUD in Supabase, RLS-gated), Rate opens
 * a 5-star popover that upserts map_feedback (rating + tried) and
 * feeds the per-mode learning loop. Preview + Download are real for
 * every tier.
 */

interface BeatmapRowProps {
  candidate: RecCandidate
  mode: GameMode
  seenKeyValue: string
  downloaded?: boolean
  /** Unlimited feed only: renders the Skip (✕) action. */
  onSkip?: () => void
  onDownloaded?: () => void
}

function Stars({ filled }: { filled: number }) {
  return (
    <>
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className="material-symbols-outlined text-[16px]"
          style={i < filled ? { fontVariationSettings: "'FILL' 1" } : undefined}
        >
          star
        </span>
      ))}
    </>
  )
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** Backdrop that closes a popover on any outside click. */
function PopoverBackdrop({ onClose }: { onClose: () => void }) {
  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 z-20 cursor-default"
      onClick={onClose}
    />
  )
}

function SavePopover({
  candidate: c,
  mode,
  userId,
  containing,
  onContainingChange,
  onClose,
}: {
  candidate: RecCandidate
  mode: GameMode
  userId: string
  containing: string[]
  onContainingChange: (ids: string[]) => void
  onClose: () => void
}) {
  const [lists, setLists] = useState<UserList[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    let live = true
    setError(null)
    Promise.all([
      loadLists(supabase, userId),
      listsContainingSet(supabase, userId, c.beatmapsetId),
    ])
      .then(([loaded, ids]) => {
        if (!live) return
        setLists(loaded)
        onContainingChange(ids)
      })
      .catch((err) => {
        if (live) setError(errorMessage(err))
      })
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, c.beatmapsetId])

  const toggle = async (list: UserList) => {
    if (busyId) return
    setBusyId(list.id)
    setError(null)
    try {
      if (containing.includes(list.id)) {
        await removeFromList(supabase, list.id, c.beatmapsetId)
        onContainingChange(containing.filter((id) => id !== list.id))
      } else {
        await addToList(supabase, {
          listId: list.id,
          beatmapsetId: c.beatmapsetId,
          beatmapId: c.beatmapId,
          mode,
        })
        onContainingChange([...containing, list.id])
      }
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  const createAndAdd = async () => {
    const name = newName.trim()
    if (!name || creating) return
    setCreating(true)
    setError(null)
    try {
      const list = await createList(supabase, userId, name)
      await addToList(supabase, {
        listId: list.id,
        beatmapsetId: c.beatmapsetId,
        beatmapId: c.beatmapId,
        mode,
      })
      setLists((prev) => (prev ? [list, ...prev] : [list]))
      onContainingChange([...containing, list.id])
      setNewName('')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setCreating(false)
    }
  }

  return (
    <>
      <PopoverBackdrop onClose={onClose} />
      <div className="absolute right-0 top-11 z-30 w-64 rounded-DEFAULT bg-surface-container-high shadow-xl p-3 flex flex-col gap-1">
        <span className="px-1 font-label-sm text-[10px] uppercase tracking-wider text-on-surface-variant">
          Save to list
        </span>
        {lists === null && !error && (
          <p className="px-1 py-1 font-body-sm text-body-sm text-on-surface-variant">Loading your lists…</p>
        )}
        {lists !== null && lists.length === 0 && (
          <p className="px-1 py-1 font-body-sm text-body-sm text-on-surface-variant">
            No lists yet — create one below.
          </p>
        )}
        {lists?.map((list) => (
          <button
            key={list.id}
            className="px-2 py-1.5 rounded hover:bg-surface-container-highest text-on-surface font-label-md text-label-md text-left flex items-center gap-2"
            type="button"
            disabled={busyId === list.id}
            onClick={() => void toggle(list)}
          >
            <span className="material-symbols-outlined text-[18px]">
              {containing.includes(list.id) ? 'check_box' : 'check_box_outline_blank'}
            </span>
            <span className="truncate flex-1">{list.name}</span>
          </button>
        ))}
        <div className="flex items-center gap-1.5 pt-1">
          <input
            className="flex-1 min-w-0 bg-surface-container px-3 py-1.5 rounded-full text-on-surface font-body-sm text-body-sm placeholder:text-outline focus:outline-none"
            placeholder="New list name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void createAndAdd()
            }}
          />
          <button
            className="px-3 py-1.5 rounded-full bg-primary-container text-on-primary-container font-label-sm text-label-sm flex-shrink-0 disabled:opacity-60"
            type="button"
            disabled={!newName.trim() || creating}
            onClick={() => void createAndAdd()}
          >
            {creating ? 'Saving…' : 'New list'}
          </button>
        </div>
        {error && (
          <p className="px-1 font-body-sm text-body-sm text-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </>
  )
}

function RatePopover({
  candidate: c,
  mode,
  userId,
  feedback,
  onFeedbackChange,
  onClose,
}: {
  candidate: RecCandidate
  mode: GameMode
  userId: string
  feedback: FeedbackEntry | null
  onFeedbackChange: (entry: FeedbackEntry) => void
  onClose: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const rating = feedback?.rating ?? null
  const status = feedback?.status ?? null

  const save = async (next: { rating: number | null; status: 'tried' | 'skipped' }) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const entry = await upsertFeedback(supabase, userId, {
        beatmapId: c.beatmapId,
        beatmapsetId: c.beatmapsetId,
        mode,
        status: next.status,
        rating: next.rating,
      })
      onFeedbackChange(entry)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  // Clicking the current rating clears the stars (keeps tried).
  const rate = (n: number) => void save({ rating: rating === n ? null : n, status: 'tried' })

  return (
    <>
      <PopoverBackdrop onClose={onClose} />
      <div className="absolute right-0 top-11 z-30 w-64 rounded-DEFAULT bg-surface-container-high shadow-xl p-3 flex flex-col gap-2">
        <span className="px-1 font-label-sm text-[10px] uppercase tracking-wider text-on-surface-variant">
          Rate this map
        </span>
        <div className="flex items-center gap-1 text-[#FFCC22]">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              className="p-0.5 hover:scale-110 transition-transform disabled:opacity-60"
              type="button"
              aria-label={`Rate ${n} star${n > 1 ? 's' : ''}`}
              title={`${n} star${n > 1 ? 's' : ''}`}
              disabled={busy}
              onClick={() => rate(n)}
            >
              <span
                className="material-symbols-outlined text-[24px]"
                style={rating !== null && n <= rating ? { fontVariationSettings: "'FILL' 1" } : undefined}
              >
                star
              </span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            className={`px-2.5 py-1 rounded-full font-label-sm text-label-sm ${status === 'tried' ? 'bg-primary-container text-on-primary-container' : 'bg-surface-container text-on-surface-variant'}`}
            type="button"
            disabled={busy}
            onClick={() => void save({ rating, status: 'tried' })}
          >
            Tried it
          </button>
          <button
            className={`px-2.5 py-1 rounded-full font-label-sm text-label-sm ${status === 'skipped' ? 'bg-primary-container text-on-primary-container' : 'bg-surface-container text-on-surface-variant'}`}
            type="button"
            disabled={busy}
            onClick={() => void save({ rating, status: 'skipped' })}
          >
            Skipped
          </button>
        </div>
        <p className="px-1 font-body-sm text-body-sm text-on-surface-variant">
          {rating !== null
            ? `Rated ${rating}★${status ? ` · ${status}` : ''} — your ${modeLabel(mode)} recommendations learn from this.`
            : status
              ? `Marked ${status} — tap a star to rate it.`
              : 'Tap a star to rate — ratings re-weight your next run in this mode.'}
        </p>
        {error && (
          <p className="px-1 font-body-sm text-body-sm text-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </>
  )
}

export default function BeatmapRow({
  candidate: c,
  mode,
  seenKeyValue,
  downloaded = false,
  onSkip,
  onDownloaded,
}: BeatmapRowProps) {
  const preview = usePreviewPlayer()
  const caps = useCapabilities()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [saveOpen, setSaveOpen] = useState(false)
  const [rateOpen, setRateOpen] = useState(false)
  const [containing, setContaining] = useState<string[] | null>(null)
  const [feedback, setFeedback] = useState<FeedbackEntry | null>(null)
  const playing = preview.isPlaying(c.beatmapsetId)
  const isDownloaded = downloaded

  const goAuth = () => navigate('/auth')

  // Account rows load their saved/rated state once (one small query
  // each). Guests never query: they have no rows to read.
  useEffect(() => {
    if (!caps.canSave || !user || !supabase) return
    let live = true
    listsContainingSet(supabase, user.id, c.beatmapsetId)
      .then((ids) => {
        if (live) setContaining(ids)
      })
      .catch(() => {
        /* the picker re-loads on open and reports errors there */
      })
    return () => {
      live = false
    }
  }, [caps.canSave, user, c.beatmapsetId])

  useEffect(() => {
    if (!caps.canRate || !user || !supabase) return
    let live = true
    loadFeedbackForBeatmap(supabase, user.id, c.beatmapId)
      .then((entry) => {
        if (live) setFeedback(entry)
      })
      .catch(() => {
        /* the popover reports errors when opened */
      })
    return () => {
      live = false
    }
  }, [caps.canRate, user, c.beatmapId])

  const inAnyList = (containing ?? []).length > 0

  return (
    <article className="group relative flex flex-col xl:flex-row items-start xl:items-center justify-between p-space-md bg-surface-container-low hover:bg-surface-container transition-all duration-200 rounded-lg shadow-sm gap-space-md">
      <div className="flex items-center gap-space-md flex-1 min-w-0 w-full">
        <div className="relative flex-shrink-0">
          <div className="w-14 h-14 rounded-full overflow-hidden p-0.5 bg-gradient-to-tr from-primary to-secondary">
            {c.cover ? (
              <img className="w-full h-full object-cover rounded-full group-hover:scale-105 transition-transform duration-300" alt="" src={c.cover} loading="lazy" />
            ) : (
              <div className="w-full h-full rounded-full bg-surface-container-highest"></div>
            )}
          </div>
          <div className="absolute -bottom-1 -right-1 px-1.5 py-0.5 bg-surface-container-lowest text-primary rounded-full font-label-sm text-[9px] font-bold">
            {modeTagLabel(c, mode)}
          </div>
        </div>
        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-space-xs mb-0.5">
            <span className="px-2 py-0.5 rounded-full bg-[#FFCC22] text-[#332200] font-label-sm text-label-sm font-extrabold flex items-center gap-1 shadow-sm">
              <span className="material-symbols-outlined text-[13px] leading-none">star</span>
              {/* SR range across the set's in-mode difficulties
                  (batch 5, item C): a set is not one difficulty.
                  Single value when every in-mode diff shares one SR. */}
              {c.srMin < c.srMax
                ? `${c.srMin.toFixed(2)}★ – ${c.srMax.toFixed(2)}★`
                : `${c.sr.toFixed(2)}★`}
            </span>
            <h3 className="font-headline-sm text-headline-sm text-on-surface truncate">{c.title}</h3>
            <span className="text-on-surface-variant font-body-sm text-body-sm">by {c.artist}</span>
            {isDownloaded && (
              <span className="px-2 py-0.5 rounded-full bg-surface-variant/80 text-outline font-label-sm text-[10px]">Already downloaded</span>
            )}
            {c.status === 'loved' && (
              <span className="px-2 py-0.5 rounded-full bg-secondary-container/60 text-secondary font-label-sm text-[10px] font-bold uppercase">Loved</span>
            )}
          </div>
          <p className="font-body-sm text-body-sm text-primary-fixed-dim leading-snug line-clamp-1 mb-2">{c.reason}</p>
          <div className="flex flex-wrap items-center gap-space-sm text-on-surface-variant font-label-sm text-label-sm">
            <div className="flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">speed</span>
              <span>{c.bpm} BPM</span>
            </div>
            <span className="text-outline-variant">•</span>
            <div className="flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">timer</span>
              <span>{formatLength(c.lengthSec)}</span>
            </div>
            <span className="text-outline-variant">•</span>
            <div className="flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">person</span>
              <span>mapped by {c.creator}</span>
            </div>
            {/* Skillset-vocabulary tags only (batch 5, item C) —
                raw mapper tags (song/series/meme tags) are not
                shown; no chips at all when none match. */}
            {essentialTags(c.tags).map((tag) => (
              <span key={tag} className="px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant text-[10px]">{tag}</span>
            ))}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between xl:justify-end gap-space-sm w-full xl:w-auto pt-2 xl:pt-0 border-t border-surface-container-highest/30 xl:border-none">
        {caps.canRate && user ? (
          <div className="relative">
            <button
              className="flex items-center gap-0.5 text-[#FFCC22] px-2 py-1 bg-surface-container hover:bg-surface-container-high rounded-full transition-colors"
              type="button"
              aria-label={feedback?.rating ? `Rated ${feedback.rating} stars — change rating` : 'Rate this map'}
              title="Rate this map"
              onClick={() => {
                setRateOpen((v) => !v)
                setSaveOpen(false)
              }}
            >
              <Stars filled={feedback?.rating ?? 0} />
            </button>
            {rateOpen && (
              <RatePopover
                candidate={c}
                mode={mode}
                userId={user.id}
                feedback={feedback}
                onFeedbackChange={setFeedback}
                onClose={() => setRateOpen(false)}
              />
            )}
          </div>
        ) : (
          <div className="flex items-center gap-0.5 text-[#FFCC22] px-2 py-1 bg-surface-container rounded-full">
            <LockedButton
              allowed={caps.canRate}
              lockedTitle="Create a free account to rate beatmaps"
              onLocked={goAuth}
              className="flex items-center gap-0.5"
              aria-label="Rate this map"
            >
              <Stars filled={4} />
            </LockedButton>
          </div>
        )}
        <div className="flex items-center gap-1.5 relative">
          <button
            className="w-9 h-9 rounded-full bg-surface-container hover:bg-primary-container hover:text-on-primary-container text-on-surface flex items-center justify-center transition-all shadow-sm"
            title={playing ? 'Pause preview' : 'Preview song'}
            type="button"
            onClick={() => preview.toggle(c.beatmapsetId, { title: c.title, artist: c.artist, cover: c.cover })}
          >
            <span className="material-symbols-outlined text-[18px]">{playing ? 'pause' : 'play_arrow'}</span>
          </button>
          <DownloadButton
            beatmapsetId={c.beatmapsetId}
            artist={c.artist}
            title={c.title}
            mode={mode}
            seenKeyValue={seenKeyValue}
            downloaded={isDownloaded}
            onDownloaded={onDownloaded}
          />
          {caps.canSave && user ? (
            <div className="relative">
              <button
                className="w-9 h-9 rounded-full bg-surface-container hover:bg-secondary hover:text-on-secondary text-on-surface flex items-center justify-center transition-all shadow-sm"
                type="button"
                aria-label={inAnyList ? 'Saved in a list — manage lists' : 'Save to list'}
                title={inAnyList ? 'Saved in a list — manage lists' : 'Save to a list'}
                onClick={() => {
                  setSaveOpen((v) => !v)
                  setRateOpen(false)
                }}
              >
                <span className="material-symbols-outlined text-[18px]">{inAnyList ? 'bookmark_check' : 'bookmark_add'}</span>
              </button>
              {saveOpen && (
                <SavePopover
                  candidate={c}
                  mode={mode}
                  userId={user.id}
                  containing={containing ?? []}
                  onContainingChange={setContaining}
                  onClose={() => setSaveOpen(false)}
                />
              )}
            </div>
          ) : (
            <LockedButton
              allowed={caps.canSave}
              lockedTitle="Create a free account to save maps"
              onLocked={goAuth}
              className="w-9 h-9 rounded-full bg-surface-container hover:bg-secondary hover:text-on-secondary text-on-surface flex items-center justify-center transition-all shadow-sm"
              aria-label="Save to list"
            >
              <span className="material-symbols-outlined text-[18px]">bookmark_add</span>
            </LockedButton>
          )}
          {onSkip && (
            <button
              aria-label="Skip map"
              className="w-9 h-9 rounded-full bg-surface-container hover:bg-surface-container-high hover:text-error text-on-surface-variant flex items-center justify-center transition-all shadow-sm"
              title="Skip map"
              type="button"
              onClick={onSkip}
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          )}
        </div>
      </div>
    </article>
  )
}
