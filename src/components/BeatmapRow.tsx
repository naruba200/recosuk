import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { GameMode } from '../lib/mode'
import type { RecCandidate } from '../lib/recommend'
import { essentialTags, formatLength, modeTagLabel } from '../lib/recommend'
import { usePreviewPlayer } from '../lib/previewPlayer'
import { useCapabilities } from '../lib/capabilities'
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
 * locked for guests. Their real persistence is M5; for accounts the
 * buttons are live-looking placeholders titled accordingly (no fake
 * server writes). Preview + Download are real for every tier.
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

function Stars() {
  return (
    <>
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className="material-symbols-outlined text-[16px]"
          style={i < 4 ? { fontVariationSettings: "'FILL' 1" } : undefined}
        >
          star
        </span>
      ))}
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
  const navigate = useNavigate()
  const [saved, setSaved] = useState(false)
  const playing = preview.isPlaying(c.beatmapsetId)
  const isDownloaded = downloaded

  const goAuth = () => navigate('/auth')

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
        <div className="flex items-center gap-0.5 text-[#FFCC22] px-2 py-1 bg-surface-container rounded-full">
          <LockedButton
            allowed={caps.canRate}
            lockedTitle="Create a free account to rate beatmaps"
            onLocked={goAuth}
            className="flex items-center gap-0.5"
            aria-label={caps.canRate ? 'Rate this map (full rating arrives in M5)' : 'Rate this map'}
          >
            <Stars />
          </LockedButton>
        </div>
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
          <LockedButton
            allowed={caps.canSave}
            lockedTitle="Create a free account to save maps"
            onLocked={goAuth}
            onClick={() => setSaved((v) => !v)}
            className="w-9 h-9 rounded-full bg-surface-container hover:bg-secondary hover:text-on-secondary text-on-surface flex items-center justify-center transition-all shadow-sm"
            aria-label="Save to list"
          >
            <span className="material-symbols-outlined text-[18px]">{saved ? 'bookmark_check' : 'bookmark_add'}</span>
          </LockedButton>
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
