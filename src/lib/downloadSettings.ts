import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'

/**
 * Download preferences (QA batch 2). Local only, persisted in
 * localStorage — no backend table, no account needed: guests get the
 * same switches as accounts.
 *
 *   noVideo — "Download without video": mirror URLs use each mirror's
 *     no-video variant where one is verified (see mirrors.ts). Only
 *     catboy's form is verified today; other mirrors fall back to the
 *     full file, and the official osu! source is unaffected.
 *     Default OFF.
 *   autoCopy — "Auto-copy into osu! Songs folder" (item 8): when ON,
 *     each download ALSO writes the .osz into the user's picked
 *     Songs folder (handle in IndexedDB, see songsFolder.ts) via the
 *     File System Access API. The normal browser download always
 *     happens too. Default OFF — never auto-enabled.
 *   songsFolderName — display name of the picked folder (the handle
 *     itself lives in IndexedDB; the name is display-only).
 *   mirrorPriority — "Mirror Route Priority" (Settings): which
 *     native mirror is tried first. 'balanced' is the default
 *     (beatconnect first, or catboy first when no-video is on);
 *     any other value is a native mirror id put first, with the
 *     remaining mirrors keeping their default relative order
 *     (see resolveNativeMirrorOrder in downloadManager.ts).
 *     Unknown/stale values fall back to the default order.
 *     Default 'balanced'. Official is never part of this order:
 *     it stays pinned first in display and opens in a new tab.
 */

const memoryFallback = new Map<string, string>()

const downloadSettingsStorage: StateStorage = {
  getItem: (name) => {
    try {
      return globalThis.localStorage?.getItem(name) ?? memoryFallback.get(name) ?? null
    } catch {
      return memoryFallback.get(name) ?? null
    }
  },
  setItem: (name, value) => {
    memoryFallback.set(name, value)
    try {
      globalThis.localStorage?.setItem(name, value)
    } catch {
      /* in-memory copy above already holds it */
    }
  },
  removeItem: (name) => {
    memoryFallback.delete(name)
    try {
      globalThis.localStorage?.removeItem(name)
    } catch {
      /* ignore */
    }
  },
}

interface DownloadSettingsState {
  noVideo: boolean
  setNoVideo: (on: boolean) => void
  autoCopy: boolean
  setAutoCopy: (on: boolean) => void
  songsFolderName: string | null
  setSongsFolderName: (name: string | null) => void
  /** Stored Mirror Route Priority selection; 'balanced' = default order. */
  mirrorPriority: string
  setMirrorPriority: (priority: string) => void
}

/** Default Mirror Route Priority: the built-in order, nothing custom. */
export const MIRROR_PRIORITY_DEFAULT = 'balanced'

export const useDownloadSettings = create<DownloadSettingsState>()(
  persist(
    (set) => ({
      noVideo: false,
      setNoVideo: (on) => set({ noVideo: on }),
      autoCopy: false,
      setAutoCopy: (on) => set({ autoCopy: on }),
      songsFolderName: null,
      setSongsFolderName: (name) => set({ songsFolderName: name }),
      mirrorPriority: MIRROR_PRIORITY_DEFAULT,
      setMirrorPriority: (priority) => set({ mirrorPriority: priority }),
    }),
    {
      name: 'recosuk-download-settings',
      storage: createJSONStorage(() => downloadSettingsStorage),
      partialize: (state) => ({
        noVideo: state.noVideo,
        autoCopy: state.autoCopy,
        songsFolderName: state.songsFolderName,
        mirrorPriority: state.mirrorPriority,
      }),
    },
  ),
)

/** Non-hook accessor for the no-video flag (download path, tests). */
export function getNoVideo(): boolean {
  return useDownloadSettings.getState().noVideo
}

/** Non-hook accessor for the auto-copy toggle (download path). */
export function getAutoCopy(): boolean {
  return useDownloadSettings.getState().autoCopy
}

/** Non-hook accessor for the stored Mirror Route Priority (order resolution). */
export function getMirrorPriority(): string {
  return useDownloadSettings.getState().mirrorPriority
}
