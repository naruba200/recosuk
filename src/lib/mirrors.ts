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
 *   catboy.best https://catboy.best/d/{id}
 *   Nerinyan    https://api.nerinyan.moe/d/{id}
 *   Beatconnect https://beatconnect.io/b/{id}
 *   Sayobot     https://txy1.sayobot.cn/beatmaps/download/full/{id}
 */
export interface MirrorSource {
  id: string
  name: string
  url: (beatmapsetId: number) => string
}

export const MIRRORS: MirrorSource[] = [
  {
    id: 'official',
    name: 'osu! official',
    url: (id) => `https://osu.ppy.sh/beatmapsets/${id}/download`,
  },
  {
    id: 'catboy',
    name: 'catboy.best',
    url: (id) => `https://catboy.best/d/${id}`,
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
