// Converted from Stitch export: stitch-raw/10-lists.html
import { useEffect, useRef, useState } from 'react'
import AppShell from '../components/AppShell'
import LockedPage from '../components/LockedPage'
import DownloadButton from '../components/DownloadButton'
import { useAuth } from '../lib/auth'
import { useSidebarIdentity } from '../lib/profileService'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { MODE_ACCENTS, useModeStore } from '../lib/modeStore'
import { modeLabel, type GameMode } from '../lib/mode'
import { useDownloadSettings } from '../lib/downloadSettings'
import { useDownloadQueue } from '../lib/downloadQueue'
import { scheduleBulkDownload } from '../lib/bulkDownload'
import { seenKey, seenStore } from '../lib/seenStore'
import {
  createList,
  deleteList,
  loadListItems,
  loadLists,
  removeFromList,
  renameList,
  type ListItemRow,
  type UserList,
} from '../lib/lists'
import {
  fetchBeatmapsetSummary,
  type BeatmapsetSummary,
} from '../lib/beatmapsets'
function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

interface DetailItem {
  row: ListItemRow
  summary: BeatmapsetSummary | null
}

function ModeChip({ mode }: { mode: GameMode | null }) {
  if (!mode) {
    return (
      <span className="px-2 py-0.5 rounded-full bg-surface-container-highest text-on-surface-variant font-label-sm text-[11px]">
        Unknown mode
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container-highest text-on-surface font-label-sm text-[11px]">
      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: MODE_ACCENTS[mode] }} />
      {modeLabel(mode)}
    </span>
  )
}

function ListsReal({ userId, username }: { userId: string; username: string | null }) {
  const globalMode = useModeStore((s) => s.mode)
  const noVideo = useDownloadSettings((s) => s.noVideo)
  const register = useDownloadQueue((s) => s.register)
  // Seen key for download recording: the account's osu! username,
  // falling back to a Lists-local key until identity resolves
  // (same fallback pattern as Beatmaps/Collections).
  const seenKeyValue = seenKey('account', username ?? 'lists')
  const [lists, setLists] = useState<UserList[] | null>(null)
  const [counts, setCounts] = useState<Record<string, ListItemRow[]>>({})
  const [error, setError] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<DetailItem[] | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameName, setRenameName] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [downloadedTick, setDownloadedTick] = useState(0)
  // Download All (batch 11, part 7): one staggered run at a time;
  // starting another cancels the pending handoffs of the first.
  // Unmount cancels the pending chain too. Already-handed-off
  // items stay in the dock (their browser downloads cannot be
  // recalled); closing a list detail does NOT cancel its run —
  // the user asked for those files.
  const [bulkActiveListId, setBulkActiveListId] = useState<string | null>(null)
  const bulkCancelRef = useRef<(() => void) | null>(null)
  useEffect(
    () => () => {
      bulkCancelRef.current?.()
      bulkCancelRef.current = null
    },
    [],
  )

  const downloadAllForList = (list: UserList, items: DetailItem[]) => {
    if (bulkActiveListId !== null || items.length === 0) return
    bulkCancelRef.current?.()
    setBulkActiveListId(list.id)
    bulkCancelRef.current = scheduleBulkDownload(
      items.map(({ row, summary }) => ({
        beatmapsetId: row.beatmapset_id,
        artist: summary?.artist ?? '',
        title: summary ? summary.title : `Beatmapset #${row.beatmapset_id}`,
      })),
      {
        register,
        seenKeyValue,
        noVideo,
        onSettled: () => {
          setBulkActiveListId(null)
          bulkCancelRef.current = null
        },
      },
    )
  }

  const refreshLists = async () => {
    const loaded = await loadLists(supabase, userId)
    setLists(loaded)
    const byList: Record<string, ListItemRow[]> = {}
    await Promise.all(
      loaded.map(async (list) => {
        byList[list.id] = await loadListItems(supabase, list.id)
      }),
    )
    setCounts(byList)
    return loaded
  }

  useEffect(() => {
    let live = true
    setError(null)
    refreshLists().catch((err) => {
      if (live) setError(errorMessage(err))
    })
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  const openDetail = async (list: UserList) => {
    setSelectedId(list.id)
    setDetail(null)
    setDetailError(null)
    setDetailLoading(true)
    try {
      const rows = counts[list.id] ?? (await loadListItems(supabase, list.id))
      const items = await Promise.all(
        rows.map(async (row): Promise<DetailItem> => {
          const summary = await fetchBeatmapsetSummary(row.beatmapset_id, {
            mode: row.mode ?? undefined,
            beatmapId: row.beatmap_id ?? undefined,
          })
          return { row, summary }
        }),
      )
      setDetail(items)
    } catch (err) {
      setDetailError(errorMessage(err))
    } finally {
      setDetailLoading(false)
    }
  }

  const create = async () => {
    const name = newName.trim()
    if (!name || creating) return
    setCreating(true)
    setError(null)
    try {
      const list = await createList(supabase, userId, name)
      setLists((prev) => (prev ? [list, ...prev] : [list]))
      setCounts((prev) => ({ ...prev, [list.id]: [] }))
      setNewName('')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setCreating(false)
    }
  }

  const rename = async (list: UserList) => {
    const name = renameName.trim()
    if (!name) return
    setBusyId(list.id)
    try {
      const updated = await renameList(supabase, list.id, name)
      setLists((prev) => prev?.map((l) => (l.id === list.id ? updated : l)) ?? null)
      setRenamingId(null)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (list: UserList) => {
    setBusyId(list.id)
    try {
      await deleteList(supabase, list.id)
      setLists((prev) => prev?.filter((l) => l.id !== list.id) ?? null)
      setCounts((prev) => {
        const next = { ...prev }
        delete next[list.id]
        return next
      })
      if (selectedId === list.id) {
        setSelectedId(null)
        setDetail(null)
      }
      setConfirmDeleteId(null)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  const removeItem = async (list: UserList, item: DetailItem) => {
    setBusyId(item.row.id)
    try {
      await removeFromList(supabase, list.id, item.row.beatmapset_id)
      setDetail((prev) => prev?.filter((d) => d.row.id !== item.row.id) ?? null)
      setCounts((prev) => ({
        ...prev,
        [list.id]: (prev[list.id] ?? []).filter((r) => r.id !== item.row.id),
      }))
    } catch (err) {
      setDetailError(errorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  const totalMaps = Object.values(counts).reduce((n, rows) => n + rows.length, 0)
  const anySummaryMissing = detail?.some((d) => d.summary === null) ?? false
  // Re-read on tick so per-song buttons show the done state after
  // a download (same pattern as Recommendations/Beatmaps).
  void downloadedTick
  const downloadedIds = seenStore.load(seenKeyValue).downloaded

  return (
    <div className="flex flex-col w-full">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-space-lg mb-space-xl">
        <div className="flex flex-col gap-space-xs max-w-2xl">
          <div className="flex items-center gap-space-sm mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
            <span className="font-label-sm text-label-sm uppercase tracking-wider text-primary">
              Playlists &amp; Collections Engine
            </span>
          </div>
          <h1 className="font-headline-xl text-headline-xl text-on-surface tracking-tight">Your lists</h1>
          <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">
            Custom beatmap collections across all rhythm modes. Save maps from any card with the
            bookmark button.
          </p>
        </div>
      </div>

      {error && (
        <p className="mb-space-md font-body-sm text-body-sm text-error" role="alert">
          {error}
        </p>
      )}

      <div className="flex items-center gap-space-sm mb-space-lg">
        <input
          className="flex-1 max-w-sm bg-surface-container px-4 py-2.5 rounded-full text-on-surface placeholder:text-outline-variant font-body-md text-body-md focus:outline-none focus:bg-surface-container-high transition-all"
          placeholder="New list name…"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void create()
          }}
        />
        <button
          className="px-space-lg py-2.5 rounded-full bg-secondary-container text-on-secondary font-headline-sm text-label-md flex items-center gap-space-xs shadow-sm hover:brightness-110 active:scale-95 transition-all disabled:opacity-60"
          type="button"
          disabled={!newName.trim() || creating}
          onClick={() => void create()}
        >
          <span className="material-symbols-outlined text-[20px]">add</span>
          <span>{creating ? 'Creating…' : 'New list'}</span>
        </button>
      </div>

      {lists === null && !error && (
        <p className="font-body-md text-body-md text-on-surface-variant">Loading your lists…</p>
      )}

      {lists !== null && lists.length === 0 && (
        <div className="p-space-lg rounded-DEFAULT bg-surface-container-low">
          <p className="font-body-md text-body-md text-on-surface-variant">
            You have no lists yet. Create one above, then save maps from Recommendations or Beatmaps
            with the bookmark button on any card.
          </p>
        </div>
      )}

      {lists !== null && lists.length > 0 && (
        <div className="flex flex-wrap items-center gap-space-sm mb-space-lg text-on-surface-variant font-label-sm text-label-sm">
          <span>
            <strong className="font-bold text-primary">{lists.length}</strong> active collections
          </span>
          <span>·</span>
          <span>
            <strong className="font-bold text-tertiary">{totalMaps}</strong> beatmaps total
          </span>
        </div>
      )}

      <div className="flex flex-col gap-space-md">
        {lists?.map((list) => {
          const rows = counts[list.id] ?? []
          const byMode = rows.reduce<Partial<Record<GameMode, number>>>((acc, row) => {
            if (row.mode) acc[row.mode] = (acc[row.mode] ?? 0) + 1
            return acc
          }, {})
          const isOpen = selectedId === list.id
          return (
            <div
              key={list.id}
              className="flex flex-col gap-space-md p-space-lg rounded-DEFAULT bg-surface-container transition-all hover:bg-surface-container-high"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-md">
                <div className="flex flex-col min-w-0">
                  {renamingId === list.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        className="bg-surface-container-low px-3 py-1.5 rounded-full text-on-surface font-headline-sm text-headline-sm focus:outline-none"
                        value={renameName}
                        onChange={(e) => setRenameName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void rename(list)
                          if (e.key === 'Escape') setRenamingId(null)
                        }}
                      />
                      <button
                        className="px-3 py-1.5 rounded-full bg-primary-container text-on-primary-container font-label-sm text-label-sm disabled:opacity-60"
                        type="button"
                        disabled={!renameName.trim() || busyId === list.id}
                        onClick={() => void rename(list)}
                      >
                        Save
                      </button>
                      <button
                        className="px-3 py-1.5 rounded-full bg-surface-container-highest text-on-surface font-label-sm text-label-sm"
                        type="button"
                        onClick={() => setRenamingId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <h2 className="font-headline-sm text-headline-sm text-on-surface truncate">{list.name}</h2>
                  )}
                  <div className="flex items-center gap-space-sm mt-1 flex-wrap">
                    <span className="font-label-sm text-label-sm text-primary font-bold">
                      {rows.length} beatmap{rows.length === 1 ? '' : 's'}
                    </span>
                    {(Object.keys(byMode) as GameMode[]).map((m) => (
                      <span key={m} className="flex items-center gap-1">
                        <ModeChip mode={m} />
                        <span className="font-label-sm text-label-sm text-on-surface-variant">({byMode[m]})</span>
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-space-xs flex-shrink-0">
                  <button
                    className="px-space-md py-2 rounded-full bg-primary text-on-primary font-label-md text-label-md font-semibold flex items-center gap-1.5 hover:bg-primary-fixed hover:text-on-primary-fixed transition-all active:scale-95"
                    type="button"
                    onClick={() => {
                      if (isOpen) {
                        setSelectedId(null)
                        setDetail(null)
                      } else {
                        void openDetail(list)
                      }
                    }}
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      {isOpen ? 'expand_less' : 'expand_more'}
                    </span>
                    <span>{isOpen ? 'Hide maps' : 'View maps'}</span>
                  </button>
                  <button
                    className="w-9 h-9 rounded-full bg-surface-container-highest text-on-surface hover:text-primary flex items-center justify-center transition-colors"
                    title="Rename list"
                    type="button"
                    onClick={() => {
                      setRenamingId(list.id)
                      setRenameName(list.name)
                    }}
                  >
                    <span className="material-symbols-outlined text-[18px]">edit</span>
                  </button>
                  {confirmDeleteId === list.id ? (
                    <>
                      <button
                        className="px-3 py-2 rounded-full bg-error text-on-error font-label-md text-label-md disabled:opacity-60"
                        type="button"
                        disabled={busyId === list.id}
                        onClick={() => void remove(list)}
                      >
                        Delete list?
                      </button>
                      <button
                        className="px-3 py-2 rounded-full bg-surface-container-highest text-on-surface font-label-md text-label-md"
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                      >
                        Keep
                      </button>
                    </>
                  ) : (
                    <button
                      className="w-9 h-9 rounded-full bg-surface-container-highest text-on-surface hover:text-error flex items-center justify-center transition-colors"
                      title="Delete list"
                      type="button"
                      onClick={() => setConfirmDeleteId(list.id)}
                    >
                      <span className="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                  )}
                </div>
              </div>

              {isOpen && (
                <div className="flex flex-col gap-2">
                  {detailLoading && (
                    <p className="font-body-sm text-body-sm text-on-surface-variant">Loading maps…</p>
                  )}
                  {detailError && (
                    <p className="font-body-sm text-body-sm text-error" role="alert">
                      {detailError}
                    </p>
                  )}
                  {detail !== null && detail.length === 0 && (
                    <p className="font-body-sm text-body-sm text-on-surface-variant">
                      This list is empty. Save maps from Recommendations or Beatmaps with the bookmark
                      button on any card.
                    </p>
                  )}
                  {anySummaryMissing && (
                    <p className="font-body-sm text-body-sm text-on-surface-variant">
                      Some map details could not be loaded — the proxy may need a redeploy for the
                      beatmap lookup. The saved maps themselves are intact.
                    </p>
                  )}
                  {detail !== null && detail.length > 0 && (
                    <div className="flex items-center justify-end">
                      <button
                        className="flex items-center gap-1.5 px-space-md py-2 rounded-full bg-surface-container-high text-on-surface font-label-md text-label-md hover:bg-surface-container-highest transition-all disabled:opacity-60"
                        type="button"
                        disabled={bulkActiveListId !== null}
                        onClick={() => downloadAllForList(list, detail)}
                        aria-label={`Download all ${detail.length} maps in ${list.name}`}
                      >
                        <span className="material-symbols-outlined text-[16px]">download</span>
                        <span>
                          {bulkActiveListId === list.id
                            ? 'Queuing downloads…'
                            : `Download all (${detail.length})`}
                        </span>
                      </button>
                    </div>
                  )}
                  {detail?.map(({ row, summary }) => (
                    <div
                      key={row.id}
                      className="flex items-center gap-3 p-2 rounded-lg bg-surface-container-low"
                    >
                      <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 bg-surface-container-highest">
                        {summary?.cover ? (
                          <img className="w-full h-full object-cover" alt="" src={summary.cover} loading="lazy" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <span className="material-symbols-outlined text-on-surface-variant">music_note</span>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="font-label-md text-label-md text-on-surface truncate">
                          {summary ? summary.title : `Beatmapset #${row.beatmapset_id}`}
                        </span>
                        <span className="font-label-sm text-label-sm text-on-surface-variant truncate">
                          {summary
                            ? `by ${summary.artist}${summary.srMin !== null && summary.srMax !== null ? ` · ${summary.srMin.toFixed(2)}★ – ${summary.srMax.toFixed(2)}★` : ''}`
                            : 'Details unavailable'}
                        </span>
                      </div>
                      <ModeChip mode={row.mode} />
                      <DownloadButton
                        beatmapsetId={row.beatmapset_id}
                        artist={summary?.artist ?? ''}
                        title={summary ? summary.title : `Beatmapset #${row.beatmapset_id}`}
                        mode={row.mode ?? globalMode}
                        seenKeyValue={seenKeyValue}
                        downloaded={downloadedIds.includes(row.beatmapset_id)}
                        onDownloaded={() => setDownloadedTick((n) => n + 1)}
                      />
                      <button
                        className="w-8 h-8 rounded-full hover:bg-surface-container-high text-on-surface-variant hover:text-error flex items-center justify-center flex-shrink-0 disabled:opacity-60"
                        type="button"
                        aria-label={`Remove ${summary?.title ?? row.beatmapset_id} from ${list.name}`}
                        title="Remove from list"
                        disabled={busyId === row.id}
                        onClick={() => void removeItem(list, { row, summary })}
                      >
                        <span className="material-symbols-outlined text-[18px]">close</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function Lists() {
  const { user, tier } = useAuth()
  const { username: sidebarName, pp: sidebarPp, avatarUrl: sidebarAvatarUrl } =
    useSidebarIdentity()
  const pageIdentity = {
    username: sidebarName ?? 'Loading…',
    pp: sidebarPp,
    avatarUrl: sidebarAvatarUrl ?? undefined,
    tierLabel: tier === 'account' ? 'account' : tier === 'guest' ? 'guest' : 'free tier',
  }
  const isReal = tier === 'account' && !!user && isSupabaseConfigured
  return (
    <AppShell identity={pageIdentity}>
      {isReal && user ? (
        <ListsReal userId={user.id} username={sidebarName} />
      ) : (
        <LockedPage
          title="Your lists"
          description="Lists are saved to your RecOsuk account. Create a free account to build and keep your own beatmap collections."
        />
      )}
    </AppShell>
  )
}
