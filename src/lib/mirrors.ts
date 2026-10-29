import { supabase } from './supabase'
import { seenStore } from './seenStore'

/**
 * Beatmap download sources. The official osu! download plus the
 * community mirrors from PLAN-v2 §7/M6 (fallback chain in the plan:
 * beatconnect → nerinyan → sayobot; catboy.best is the mirror menu
 * entry the RecOsuk UI has always offered). A `.osz` contains every
 * difficulty of the set regardless of mode — mirrors are per-set.
 *
 * URL patterns (verified against each mirror's public download API):
 *   official    https://osu.ppy.sh/beatmapsets/{id}/download
 *               (+ `?noVideo=1` when no-video is on — see below)
 *   catboy.best https://catboy.best/d/{id}
 *   Nerinyan    https://api.nerinyan.moe/d/{id}
 *   Beatconnect https://beatconnect.io/b/{id}
 *   Sayobot     https://txy1.sayobot.cn/beatmaps/download/full/{id}
 *
 * No-video variants (QA batch 2, researched 2026-10-29):
 *   catboy.best https://catboy.best/d/{id}n — the `{id}n` suffix IS
 *     catboy's no-video form: the hinai mirror FAQ
 *     (mirror.hinamizawa.ai) documents the ecosystem's no-video
 *     conventions and names the `{id}n` suffix "catboy style".
 *     Re-checked 2026-10-29 (batch 3): the FAQ still names the
 *     `{id}n` suffix as catboy style; no contradicting source was
 *     readable, so the form is unchanged.
 *   KNOWN UNVERIFIED BEHAVIOUR (batch 3, item D): on the user's
 *     local setup, every `{id}n` request failed with HTTP 425 (Too
 *     Early) while plain URLs were not reported failing. From this
 *     VM catboy returns 403 for BOTH forms (geo/bot blocking), so
 *     the 425 could not be reproduced and its cause is UNVERIFIED
 *     — whether catboy's no-video endpoint itself returns 425 or
 *     the user's browser/network triggers it is unknown. Do not
 *     claim a root cause. Mitigations live in songCopy.ts
 *     (same-mirror full-file fallthrough) and DownloadButton.tsx
 *     (visible full-file retry; no-video downloads are never
 *     marked done on the iframe handoff alone).
 *   beatconnect / Nerinyan / Sayobot: no no-video URL shape could be
 *     verified from a public doc actually read, so they FALL BACK to
 *     the full file even when the no-video setting is on. The
 *     osu-api-extended wiki confirms these hosts support a no-video
 *     CONCEPT, but gives no URL shape — do not guess one here. If a
 *     shape is verified later, add it with its source cited.
 *   official: `?noVideo=1` (batch 12, verified from osu!'s own game
 *     client source: `DownloadBeatmapSetRequest.cs` builds the
 *     target as `beatmapsets/{id}/download` plus `?noVideo=1` when
 *     no-video is requested). The official download uses the same
 *     hidden-iframe handoff as the mirrors on the first attempt
 *     (batch 13) — the browser's osu! session does the auth, so
 *     no redirect and no new tab; a Retry on an official row opens
 *     the page in a new tab as the visible fallback when the user
 *     is signed out (the iframe then fails silently).
 */
export interface MirrorUrlOptions {
  /** Request the mirror's no-video file variant where one is verified. */
  noVideo?: boolean
}

export interface MirrorSource {
  id: string
  name: string
  url: (beatmapsetId: number, opts?: MirrorUrlOptions) => string
}

export const MIRRORS: MirrorSource[] = [
  {
    id: 'official',
    name: 'osu! official',
    url: (id, opts) =>
      `https://osu.ppy.sh/beatmapsets/${id}/download${opts?.noVideo ? '?noVideo=1' : ''}`,
  },
  {
    id: 'catboy',
    name: 'catboy.best',
    url: (id, opts) => `https://catboy.best/d/${id}${opts?.noVideo ? 'n' : ''}`,
  },
  {
    id: 'nerinyan',
    name: 'Nerinyan',
    url: (id) => `https://api.nerinyan.moe/d/${id}`,
  },
  {
    id: 'beatconnect',
    name: 'Beatconnect',
    url: (id) => `https://beatconnect.io/b/${id}`,
  },
  {
    id: 'sayobot',
    name: 'Sayobot',
    url: (id) => `https://txy1.sayobot.cn/beatmaps/download/full/${id}`,
  },
]

export function mirrorById(id: string): MirrorSource {
  return MIRRORS.find((m) => m.id === id) ?? MIRRORS[0]
}

/**
 * Record a download: always into the local seen set (feeds the
 * recommendation dedupe for every tier, §13.2.4), and for signed-in
 * accounts also into download_history (best-effort, PLAN-v2 M6).
 */
export async function recordDownload(
  seenKeyValue: string,
  beatmapsetId: number,
  mirrorId: string,
): Promise<void> {
  seenStore.mark(seenKeyValue, 'downloaded', beatmapsetId)
  if (!supabase) return
  try {
    const { data } = await supabase.auth.getUser()
    if (!data.user) return
    await supabase.from('download_history').insert({
      user_id: data.user.id,
      beatmapset_id: beatmapsetId,
      mirror_used: mirrorId,
    })
  } catch {
    /* history is best-effort; the local seen mark already landed */
  }
}
