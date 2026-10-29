// Converted from Stitch export: stitch-raw/11-history.html
import { useEffect, useMemo, useState } from 'react'
import AppShell from '../components/AppShell'
import ExampleBlock from '../components/ExampleBlock'
import { useAuth } from '../lib/auth'
import { useSidebarIdentity } from '../lib/profileService'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { MODE_ACCENTS } from '../lib/modeStore'
import { GAME_MODES, modeLabel, type GameMode } from '../lib/mode'
import {
  deleteFeedback,
  loadAllFeedback,
  upsertFeedback,
  type FeedbackEntry,
  type FeedbackStatus,
} from '../lib/feedback'
import {
  fetchBeatmapsetSummary,
  type BeatmapsetSummary,
} from '../lib/beatmapsets'
import {
  seenKey,
  seenStore,
  takeRecentDownloaded,
  useSeenVersion,
} from '../lib/seenStore'

/** Cap on rendered download rows: the store is id-only, so each
 * row costs one (cached) beatmapset lookup. */
const DOWNLOAD_HISTORY_LIMIT = 50
function HistoryDemo() {
  return (
      <ExampleBlock note="Example — create an account to track tried & rated maps. Nothing here is saved yet.">
        <div className="flex flex-col w-full">
          {/* Dynamic Top Ambient Aura */}
          <div className="relative w-full overflow-hidden">
            <div className="absolute -top-24 left-1/4 w-[500px] h-[220px] bg-primary-container/10 rounded-full blur-[100px] pointer-events-none">
            </div>
            <div className="absolute -top-20 right-1/3 w-[360px] h-[180px] bg-secondary/10 rounded-full blur-[90px] pointer-events-none">
            </div>
            {/* Header Section */}
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-space-lg mb-space-lg">
              <div className="flex flex-col gap-space-xs max-w-3xl">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-full bg-surface-container-high text-primary font-label-sm text-label-sm tracking-wider uppercase">Adaptive Training Log
                  </span>
                  <span className="w-1.5 h-1.5 rounded-full bg-tertiary">
                  </span>
                  <span className="font-label-sm text-label-sm text-on-surface-variant">osu!mania 7K Calibrator
                  </span>
                </div>
                <h1 className="font-headline-xl text-headline-xl text-on-surface tracking-tight">Tried and rated
                </h1>
                <p className="font-body-md text-body-md text-on-surface-variant">{' '}Track played recommendation outcomes, inspect your training accuracy, and view how your feedback calibrates future algorithmic drills.{' '}
                </p>
              </div>
              {/* Quick Session Indicator */}
              <div className="flex items-center gap-space-sm bg-surface-container-low px-space-md py-space-sm rounded-DEFAULT">
                <span className="w-2.5 h-2.5 rounded-full bg-primary-container animate-pulse shadow-[0_0_8px_rgba(164,118,255,0.7)]">
                </span>
                <div className="flex flex-col">
                  <span className="font-label-sm text-[10px] text-on-surface-variant uppercase tracking-wider">Calibration State
                  </span>
                  <span className="font-label-md text-label-md text-primary font-semibold">Active · High fidelity
                  </span>
                </div>
              </div>
            </div>
            {/* Top Summary Strip / Diagnostic Ribbon */}
            <div className="w-full bg-surface-container-low p-space-md rounded-DEFAULT shadow-md mb-space-xl">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-space-md items-center">
                {/* Metric 1 */}
                <div className="flex items-center gap-space-md px-space-sm">
                  <div className="w-12 h-12 rounded-full bg-surface-container-high flex items-center justify-center text-primary shadow-[0_0_12px_rgba(164,118,255,0.2)]">
                    <span className="material-symbols-outlined text-[24px]">checklist
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <div className="flex items-baseline gap-1.5">
                      <span className="font-metric-display text-headline-md text-on-surface">38
                      </span>
                      <span className="font-label-sm text-label-sm text-on-surface-variant">maps
                      </span>
                    </div>
                    <span className="font-label-sm text-label-sm text-on-surface-variant">Total tried in cohort
                    </span>
                  </div>
                </div>
                {/* Metric 2 */}
                <div className="flex items-center gap-space-md px-space-sm">
                  <div className="w-12 h-12 rounded-full bg-surface-container-high flex items-center justify-center text-[#FFCC22] shadow-[0_0_12px_rgba(255,204,34,0.2)]">
                    <span className="material-symbols-outlined text-[24px]">grade
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <div className="flex items-baseline gap-1.5">
                      <span className="font-metric-display text-headline-md text-on-surface">3.9
                      </span>
                      <span className="font-label-sm text-label-sm text-[#FFCC22]">★
                      </span>
                    </div>
                    <span className="font-label-sm text-label-sm text-on-surface-variant">Average user rating
                    </span>
                  </div>
                </div>
                {/* Metric 3 */}
                <div className="flex items-center gap-space-md px-space-sm">
                  <div className="w-12 h-12 rounded-full bg-surface-container-high flex items-center justify-center text-tertiary shadow-[0_0_12px_rgba(128,208,255,0.2)]">
                    <span className="material-symbols-outlined text-[24px]">query_stats
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <div className="flex items-baseline gap-1.5">
                      <span className="font-metric-display text-headline-md text-on-surface">93.4%
                      </span>
                    </div>
                    <span className="font-label-sm text-label-sm text-on-surface-variant">Mean accuracy logged
                    </span>
                  </div>
                </div>
                {/* Live Status Pill */}
                <div className="flex flex-col justify-center bg-surface-container p-space-sm rounded-DEFAULT">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-label-sm text-[11px] text-primary uppercase font-bold tracking-wider flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[13px] text-primary">auto_fix_high
                      </span>{' '}Engine Synced{' '}
                    </span>
                    <span className="font-label-sm text-[11px] text-on-surface-variant">14:15 Bancho
                    </span>
                  </div>
                  <p className="font-label-sm text-[11px] text-on-surface-variant leading-tight truncate">{' '}Weights re-calibrated · 6 maps updated today{' '}
                  </p>
                </div>
              </div>
            </div>
          </div>
          {/* Main Dual Rail Content Grid */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-space-xl">
            {/* Left Column: Filter Bar & Feed (8 Cols on XL) */}
            <div className="xl:col-span-8 flex flex-col gap-space-lg">
              {/* Filter Bar Capsule */}
              <div className="flex flex-wrap items-center justify-between gap-space-md bg-surface-container-low p-space-sm rounded-DEFAULT">
                {/* Segmented Tab Controls */}
                <div className="inline-flex p-1 bg-surface-container rounded-full" id="history-tab-group">
                  <button className="px-space-md py-1.5 rounded-full font-label-md text-label-md bg-primary-container text-on-primary-container font-semibold shadow-sm transition-all tab-btn" data-filter="all" type="button">{' '}All (42){' '}
                  </button>
                  <button className="px-space-md py-1.5 rounded-full font-label-md text-label-md text-on-surface-variant hover:text-on-surface transition-all tab-btn" data-filter="tried" type="button">{' '}Tried (38){' '}
                  </button>
                  <button className="px-space-md py-1.5 rounded-full font-label-md text-label-md text-on-surface-variant hover:text-on-surface transition-all tab-btn" data-filter="skipped" type="button">{' '}Skipped (4){' '}
                  </button>
                </div>
                {/* Right Filter Dropdown & Search */}
                <div className="flex items-center gap-space-sm flex-1 sm:flex-initial justify-end">
                  {/* Stars Filter Pill */}
                  <div className="relative">
                    <button className="flex items-center gap-1.5 bg-surface-container px-space-md py-2 rounded-full font-label-md text-label-md text-on-surface hover:bg-surface-container-high transition-colors" type="button">
                      <span className="material-symbols-outlined text-[16px] text-[#FFCC22]">star
                      </span>
                      <span>≥ 4 Stars
                      </span>
                      <span className="material-symbols-outlined text-[16px] text-on-surface-variant ml-0.5">expand_more
                      </span>
                    </button>
                  </div>
                  {/* Mode / Key pill */}
                  <span className="px-space-md py-2 rounded-full bg-surface-container text-on-surface-variant font-label-md text-label-md font-medium hidden sm:inline-flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-primary">
                    </span>{' '}Mania 7K{' '}
                  </span>
                </div>
              </div>
              {/* Quick Search Bar inside Stage Track */}
              <div className="relative w-full">
                <div className="absolute inset-y-0 left-0 pl-space-md flex items-center pointer-events-none text-on-surface-variant">
                  <span className="material-symbols-outlined text-[18px]">search
                  </span>
                </div>
                <input className="w-full bg-surface-container-low text-on-surface placeholder:text-outline text-body-md font-body-md pl-11 pr-space-lg py-3 rounded-full focus:outline-none focus:bg-surface-container transition-all" placeholder="Search history by beatmap, artist, pattern tags (e.g. jumpstream, LN)..." type="text" />
                <div className="absolute inset-y-0 right-0 pr-space-md flex items-center pointer-events-none">
                  <kbd className="px-2 py-0.5 text-[10px] font-label-sm bg-surface-container-high text-on-surface-variant rounded">ESC
                  </kbd>
                </div>
              </div>
              {/* Slider Beatmap List Container */}
              <div className="flex flex-col gap-space-sm" id="beatmap-history-list">
                {/* ROW 1: 5-Star Rated, Tried (Camellia) */}
                <div className="group relative bg-surface-container-low hover:bg-surface-container p-space-md rounded-DEFAULT transition-all duration-200 shadow-sm flex flex-col gap-space-sm">
                  <div className="flex items-start sm:items-center justify-between gap-space-md flex-col sm:flex-row">
                    {/* Left Info Cluster */}
                    <div className="flex items-center gap-space-md min-w-0 flex-1">
                      {/* Lead Artwork Capsule with Mania Glow Ring */}
                      <div className="relative flex-shrink-0">
                        <div className="w-14 h-14 rounded-full overflow-hidden p-0.5 bg-gradient-to-tr from-primary to-secondary shadow-[0_0_14px_rgba(164,118,255,0.45)]">
                          <div className="w-full h-full rounded-full bg-surface-container-highest flex items-center justify-center overflow-hidden">
                            <img className="w-full h-full object-cover" data-alt="Cybernetic anime art style album artwork featuring neon violet crystalline energy beams, mechanical sound synthesizers, and abstract speed geometric patterns in deep purple, magenta, and cyan hues" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAtV7q5GPG7vblI91FsRVqgrfSRpPC8hjDq65VpxsHSZdNx4MJI5RljZ-s8TJqBzl1P9A6O40lr5Md0A3FXpk1Ax2RihToG12OjZ6SIFGLI31jzkBFte8SUk8epc3mi6wZKn0Josm9KC8bucFM1oulyorrvndUtlGHEjTMI_jCSH5ntALn-fqaHQXzHInkhlx42T3Rhz-sUZW3InJKNiQhLgjGKpPIOFcUyMXSa5GI8AD5RzgX-pJlx" />
                          </div>
                        </div>
                        <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-surface-container-lowest flex items-center justify-center text-[10px] font-headline-sm text-primary font-bold">{' '}7K{' '}
                        </div>
                      </div>
                      {/* Meta Stack */}
                      <div className="flex flex-col min-w-0 flex-1">
                        <div className="flex items-center gap-space-xs flex-wrap">
                          <span className="font-headline-sm text-headline-sm text-on-surface truncate">Exit This Earth's Atomosphere
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-[#FFCC22]/15 text-[#FFCC22] font-label-sm text-[11px] font-bold flex items-center gap-0.5">
                            <span className="material-symbols-outlined text-[12px]">star
                            </span>{' '}5.24{' '}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-on-surface-variant font-label-sm text-label-sm mt-0.5">
                          <span className="text-on-surface font-medium truncate">Camellia
                          </span>
                          <span>·
                          </span>
                          <span>182 BPM
                          </span>
                          <span>·
                          </span>
                          <span>2:44
                          </span>
                          <span>·
                          </span>
                          <span className="text-outline">mapped by Evening
                          </span>
                        </div>
                      </div>
                    </div>
                    {/* Right Status & Accuracy */}
                    <div className="flex items-center gap-space-md self-end sm:self-center">
                      <div className="flex flex-col items-end">
                        <span className="px-2.5 py-1 rounded-full bg-[#22c55e]/15 text-[#22c55e] font-label-md text-label-md font-bold flex items-center gap-1 shadow-sm">
                          <span className="material-symbols-outlined text-[15px]">verified
                          </span>{' '}Tried · 96.84%{' '}
                        </span>
                        <span className="text-[11px] font-label-sm text-on-surface-variant mt-1">S rank · 0 misses
                        </span>
                      </div>
                    </div>
                  </div>
                  {/* Bottom Evaluation Track: Tags, User Rating Stars, Algorithmic Note, Actions */}
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-sm pt-space-xs border-t-0">
                    {/* Tags & User Rating */}
                    <div className="flex items-center gap-space-md flex-wrap">
                      <div className="flex items-center gap-1 text-[#FFCC22]" title="Your Rating: 5/5 stars">
                        <span className="material-symbols-outlined text-[18px]">star
                        </span>
                        <span className="material-symbols-outlined text-[18px]">star
                        </span>
                        <span className="material-symbols-outlined text-[18px]">star
                        </span>
                        <span className="material-symbols-outlined text-[18px]">star
                        </span>
                        <span className="material-symbols-outlined text-[18px]">star
                        </span>
                      </div>
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="px-2 py-0.5 rounded-full bg-surface-container font-label-sm text-[11px] text-on-surface-variant">jumpstream
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-surface-container font-label-sm text-[11px] text-on-surface-variant">chordjack
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-surface-container font-label-sm text-[11px] text-on-surface-variant">technical
                        </span>
                      </div>
                    </div>
                    {/* Algorithmic Feed Note & Interactive Suite */}
                    <div className="flex items-center gap-space-md justify-between lg:justify-end flex-1">
                      <div className="flex items-center gap-1.5 text-primary font-label-sm text-label-sm">
                        <span className="material-symbols-outlined text-[16px] text-primary">auto_awesome
                        </span>
                        <span>More maps like this will rank higher for you
                        </span>
                      </div>
                      {/* Actions Suite */}
                      <div className="flex items-center gap-1">
                        <button className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant hover:text-primary hover:bg-surface-container-high transition-colors" title="Preview Audio" type="button">
                          <span className="material-symbols-outlined text-[18px]">volume_up
                          </span>
                        </button>
                        <button className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant hover:text-secondary hover:bg-surface-container-high transition-colors" title="Bookmark" type="button">
                          <span className="material-symbols-outlined text-[18px]">bookmark
                          </span>
                        </button>
                        <button className="px-3 py-1 rounded-full bg-primary-container text-on-primary-container font-label-sm text-label-sm font-semibold hover:opacity-95 transition-opacity flex items-center gap-1" type="button">
                          <span className="material-symbols-outlined text-[14px]">sports_esports
                          </span>
                          <span>Replay
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                {/* ROW 2: 5-Star Rated, Tried (xi - Ascension to Heaven) */}
                <div className="group relative bg-surface-container-low hover:bg-surface-container p-space-md rounded-DEFAULT transition-all duration-200 shadow-sm flex flex-col gap-space-sm">
                  <div className="flex items-start sm:items-center justify-between gap-space-md flex-col sm:flex-row">
                    <div className="flex items-center gap-space-md min-w-0 flex-1">
                      <div className="relative flex-shrink-0">
                        <div className="w-14 h-14 rounded-full overflow-hidden p-0.5 bg-gradient-to-tr from-primary to-secondary shadow-[0_0_14px_rgba(164,118,255,0.45)]">
                          <div className="w-full h-full rounded-full bg-surface-container-highest flex items-center justify-center overflow-hidden">
                            <img className="w-full h-full object-cover" data-alt="Heavenly fantasy orchestral anime landscape with celestial towers, dramatic purple and twilight pink clouds, glowing stairways ascending into starlight, highly rendered classical digital art" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBgiGXv0Lb7bgq-bPRzewpVEAfPscEWdrLb9m9qXJulU7hNa1f8GT0aKZEmEYpTlrzKOaCPP_W5SMrw0Hs2RC4p7TMRiUQZqz6ylTsGvrCcn8S4YJA5oQOJQbsSWEmuXP0ATGB5-K5GvuatPG4Su2438JFlNUaU3frscrbhIwpK7qFihUq4jU_4iZwywJ2De_e1tloNszud8c83YDh2JKCW4PzJ3ZPJlJgLzxzIZhcOPeezwSRBaYxg" />
                          </div>
                        </div>
                        <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-surface-container-lowest flex items-center justify-center text-[10px] font-headline-sm text-primary font-bold">{' '}7K{' '}
                        </div>
                      </div>
                      <div className="flex flex-col min-w-0 flex-1">
                        <div className="flex items-center gap-space-xs flex-wrap">
                          <span className="font-headline-sm text-headline-sm text-on-surface truncate">Ascension to Heaven
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-[#FFCC22]/15 text-[#FFCC22] font-label-sm text-[11px] font-bold flex items-center gap-0.5">
                            <span className="material-symbols-outlined text-[12px]">star
                            </span>{' '}5.21{' '}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-on-surface-variant font-label-sm text-label-sm mt-0.5">
                          <span className="text-on-surface font-medium truncate">xi
                          </span>
                          <span>·
                          </span>
                          <span>190 BPM
                          </span>
                          <span>·
                          </span>
                          <span>3:05
                          </span>
                          <span>·
                          </span>
                          <span className="text-outline">mapped by Kroytz
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-space-md self-end sm:self-center">
                      <div className="flex flex-col items-end">
                        <span className="px-2.5 py-1 rounded-full bg-[#22c55e]/15 text-[#22c55e] font-label-md text-label-md font-bold flex items-center gap-1 shadow-sm">
                          <span className="material-symbols-outlined text-[15px]">verified
                          </span>{' '}Tried · 94.31%{' '}
                        </span>
                        <span className="text-[11px] font-label-sm text-on-surface-variant mt-1">S rank · 1 miss
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-sm pt-space-xs">
                    <div className="flex items-center gap-space-md flex-wrap">
                      <div className="flex items-center gap-1 text-[#FFCC22]" title="Your Rating: 5/5 stars">
                        <span className="material-symbols-outlined text-[18px]">star
                        </span>
                        <span className="material-symbols-outlined text-[18px]">star
                        </span>
                        <span className="material-symbols-outlined text-[18px]">star
                        </span>
                        <span className="material-symbols-outlined text-[18px]">star
                        </span>
                        <span className="material-symbols-outlined text-[18px]">star
                        </span>
                      </div>
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="px-2 py-0.5 rounded-full bg-surface-container font-label-sm text-[11px] text-on-surface-variant">jumpstream
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-surface-container font-label-sm text-[11px] text-on-surface-variant">LN
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-surface-container font-label-sm text-[11px] text-on-surface-variant">technical
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-space-md justify-between lg:justify-end flex-1">
                      <div className="flex items-center gap-1.5 text-primary font-label-sm text-label-sm">
                        <span className="material-symbols-outlined text-[16px] text-primary">auto_awesome
                        </span>
                        <span>More maps like this will rank higher for you
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant hover:text-primary hover:bg-surface-container-high transition-colors" title="Preview Audio" type="button">
                          <span className="material-symbols-outlined text-[18px]">volume_up
                          </span>
                        </button>
                        <button className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant hover:text-secondary hover:bg-surface-container-high transition-colors" title="Bookmark" type="button">
                          <span className="material-symbols-outlined text-[18px]">bookmark
                          </span>
                        </button>
                        <button className="px-3 py-1 rounded-full bg-primary-container text-on-primary-container font-label-sm text-label-sm font-semibold hover:opacity-95 transition-opacity flex items-center gap-1" type="button">
                          <span className="material-symbols-outlined text-[14px]">sports_esports
                          </span>
                          <span>Replay
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                {/* ROW 3: 4-Star Rated, Tried (LeaF - Doppelganger) */}
                <div className="group relative bg-surface-container-low hover:bg-surface-container p-space-md rounded-DEFAULT transition-all duration-200 shadow-sm flex flex-col gap-space-sm">
                  <div className="flex items-start sm:items-center justify-between gap-space-md flex-col sm:flex-row">
                    <div className="flex items-center gap-space-md min-w-0 flex-1">
                      <div className="relative flex-shrink-0">
                        <div className="w-14 h-14 rounded-full overflow-hidden p-0.5 bg-gradient-to-tr from-primary/60 to-surface-container-high">
                          <div className="w-full h-full rounded-full bg-surface-container-highest flex items-center justify-center overflow-hidden">
                            <img className="w-full h-full object-cover" data-alt="Surreal psychological horror anime album art depicting mirrored silhouette figures with glowing red and violet glitch effects in a dark geometric void, dark synth aesthetic" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAkuZBv_X5c5NpT0ybwCOao3EQdzO5AF8d4f01T7F-f0a4IPJRxDzZvTUJvVMKdI_9YUO80toSf-qVC02lP1c_9mmMxhXt-_aW1MxYe3VJemEEpVvl7fhbNiDSKna_AGMPyc7umuMeBidx74W9Bnw2A2kjp2s1DMVRM18L3Zd1aGDiEwfC7_BxeXDpoIlfpd3eCbm-GUBRzLf8JNIvmIhYxbGnCs95ClkOQG6m58VpJv52boRGd0f-5" />
                          </div>
                        </div>
                        <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-surface-container-lowest flex items-center justify-center text-[10px] font-headline-sm text-primary font-bold">{' '}7K{' '}
                        </div>
                      </div>
                      <div className="flex flex-col min-w-0 flex-1">
                        <div className="flex items-center gap-space-xs flex-wrap">
                          <span className="font-headline-sm text-headline-sm text-on-surface truncate">Doppelganger
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-[#FFCC22]/15 text-[#FFCC22] font-label-sm text-[11px] font-bold flex items-center gap-0.5">
                            <span className="material-symbols-outlined text-[12px]">star
                            </span>{' '}5.14{' '}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-on-surface-variant font-label-sm text-label-sm mt-0.5">
                          <span className="text-on-surface font-medium truncate">LeaF
                          </span>
                          <span>·
                          </span>
                          <span>178 BPM
                          </span>
                          <span>·
                          </span>
                          <span>2:32
                          </span>
                          <span>·
                          </span>
                          <span className="text-outline">mapped by Critical
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-space-md self-end sm:self-center">
                      <div className="flex flex-col items-end">
                        <span className="px-2.5 py-1 rounded-full bg-[#22c55e]/15 text-[#22c55e] font-label-md text-label-md font-bold flex items-center gap-1 shadow-sm">
                          <span className="material-symbols-outlined text-[15px]">verified
                          </span>{' '}Tried · 92.10%{' '}
                        </span>
                        <span className="text-[11px] font-label-sm text-on-surface-variant mt-1">A rank · 4 misses
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-sm pt-space-xs">
                    <div className="flex items-center gap-space-md flex-wrap">
                      <div className="flex items-center gap-1 text-[#FFCC22]" title="Your Rating: 4/5 stars">
                        <span className="material-symbols-outlined text-[18px]">star
                        </span>
                        <span className="material-symbols-outlined text-[18px]">star
                        </span>
                        <span className="material-symbols-outlined text-[18px]">star
                        </span>
                        <span className="material-symbols-outlined text-[18px]">star
                        </span>
                        <span className="material-symbols-outlined text-[18px] text-outline-variant">star
                        </span>
                      </div>
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="px-2 py-0.5 rounded-full bg-surface-container font-label-sm text-[11px] text-on-surface-variant">chordjack
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-surface-container font-label-sm text-[11px] text-on-surface-variant">technical
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-space-md justify-between lg:justify-end flex-1">
                      <div className="flex items-center gap-1.5 text-on-surface-variant font-label-sm text-label-sm">
                        <span className="material-symbols-outlined text-[16px] text-tertiary">tune
                        </span>
                        <span>Balanced weighting — pattern frequency retained in 5.0★ drills
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant hover:text-primary hover:bg-surface-container-high transition-colors" title="Preview Audio" type="button">
                          <span className="material-symbols-outlined text-[18px]">volume_up
                          </span>
                        </button>
                        <button className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant hover:text-secondary hover:bg-surface-container-high transition-colors" title="Bookmark" type="button">
                          <span className="material-symbols-outlined text-[18px]">bookmark
                          </span>
                        </button>
                        <button className="px-3 py-1 rounded-full bg-surface-container-high text-on-surface font-label-sm text-label-sm font-semibold hover:bg-primary hover:text-on-primary transition-all flex items-center gap-1" type="button">
                          <span className="material-symbols-outlined text-[14px]">sports_esports
                          </span>
                          <span>Replay
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                {/* ROW 4: Skipped Row (Camellia - Blastix Riotz) */}
                <div className="group relative bg-surface-container-lowest/80 hover:bg-surface-container-low p-space-md rounded-DEFAULT transition-all duration-200 shadow-none flex flex-col gap-space-sm opacity-80 hover:opacity-100">
                  <div className="flex items-start sm:items-center justify-between gap-space-md flex-col sm:flex-row">
                    <div className="flex items-center gap-space-md min-w-0 flex-1">
                      <div className="relative flex-shrink-0">
                        <div className="w-14 h-14 rounded-full overflow-hidden p-0.5 bg-surface-container-high">
                          <div className="w-full h-full rounded-full bg-surface-container-highest flex items-center justify-center overflow-hidden grayscale">
                            <img className="w-full h-full object-cover" data-alt="High-intensity speedcore techno beatmap background artwork with aggressive orange and purple lightning bolts, shattered geometric crystals, and chaotic digital distortion" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCqFBq0dBjG3z5nKC9JJv5RGuaiaFPpNwdSLmjnXemTHZZ4ER8VshCGSwEzTrn7T8A-Hl9eMNF6ntvaUnFRN22kUPjPYaEwqHrz-qGxnmJBELRy8mB4AyP7GESFcpOXVnv1vnz9c5Qh6GO03gfmnCKy_q4mkMfZTgb5T9EF5uhAuPiTZwOzPVsniOdQIwSjtUOCL4VgFWsx77dMhq7v0WrtvytET62ccob4Eqv2otyhwLmaomXsfZQq" />
                          </div>
                        </div>
                        <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-surface-container-high flex items-center justify-center text-[10px] font-headline-sm text-outline font-bold">{' '}7K{' '}
                        </div>
                      </div>
                      <div className="flex flex-col min-w-0 flex-1">
                        <div className="flex items-center gap-space-xs flex-wrap">
                          <span className="font-headline-sm text-headline-sm text-on-surface/80 truncate">Blastix Riotz
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant font-label-sm text-[11px] font-bold flex items-center gap-0.5">
                            <span className="material-symbols-outlined text-[12px]">star
                            </span>{' '}5.38{' '}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-on-surface-variant font-label-sm text-label-sm mt-0.5">
                          <span className="text-on-surface-variant font-medium truncate">Camellia
                          </span>
                          <span>·
                          </span>
                          <span>210 BPM
                          </span>
                          <span>·
                          </span>
                          <span>2:15
                          </span>
                          <span>·
                          </span>
                          <span className="text-outline">mapped by FreshChicken
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-space-md self-end sm:self-center">
                      <div className="flex flex-col items-end">
                        <span className="px-2.5 py-1 rounded-full bg-surface-container-high text-on-surface-variant font-label-md text-label-md font-semibold flex items-center gap-1">
                          <span className="material-symbols-outlined text-[15px]">fast_forward
                          </span>{' '}Skipped{' '}
                        </span>
                        <span className="text-[11px] font-label-sm text-outline mt-1">Not played in session
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-sm pt-space-xs">
                    <div className="flex items-center gap-space-md flex-wrap">
                      <div className="flex items-center gap-1 text-outline-variant" title="Unrated">
                        <span className="material-symbols-outlined text-[18px]">star
                        </span>
                        <span className="material-symbols-outlined text-[18px]">star
                        </span>
                        <span className="material-symbols-outlined text-[18px]">star
                        </span>
                        <span className="material-symbols-outlined text-[18px]">star
                        </span>
                        <span className="material-symbols-outlined text-[18px]">star
                        </span>
                      </div>
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="px-2 py-0.5 rounded-full bg-surface-container-high font-label-sm text-[11px] text-outline">jumpstream
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-surface-container-high font-label-sm text-[11px] text-outline">chordjack
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-surface-container-high font-label-sm text-[11px] text-outline">speed
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-space-md justify-between lg:justify-end flex-1">
                      <div className="flex items-center gap-1.5 text-outline font-label-sm text-label-sm">
                        <span className="material-symbols-outlined text-[16px]">hourglass_disabled
                        </span>
                        <span>De-prioritised in immediate queue · Can reappear in stamina refresh
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button className="w-8 h-8 rounded-full bg-surface-container-high flex items-center justify-center text-outline hover:text-on-surface hover:bg-surface-container transition-colors" title="Preview Audio" type="button">
                          <span className="material-symbols-outlined text-[18px]">volume_up
                          </span>
                        </button>
                        <button className="px-3 py-1 rounded-full bg-surface-container-high text-on-surface-variant font-label-sm text-label-sm font-semibold hover:bg-primary-container hover:text-on-primary-container transition-all flex items-center gap-1" type="button">
                          <span>Try anyway
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                {/* ROW 5: 3-Star Rated, Tried (xi - Blue Zenith) */}
                <div className="group relative bg-surface-container-low hover:bg-surface-container p-space-md rounded-DEFAULT transition-all duration-200 shadow-sm flex flex-col gap-space-sm">
                  <div className="flex items-start sm:items-center justify-between gap-space-md flex-col sm:flex-row">
                    <div className="flex items-center gap-space-md min-w-0 flex-1">
                      <div className="relative flex-shrink-0">
                        <div className="w-14 h-14 rounded-full overflow-hidden p-0.5 bg-gradient-to-tr from-tertiary-container to-surface-container-high">
                          <div className="w-full h-full rounded-full bg-surface-container-highest flex items-center justify-center overflow-hidden">
                            <img className="w-full h-full object-cover" data-alt="Dynamic soaring blue sky and white wings concept art, soaring over endless cyan ocean with majestic bright clouds and subtle violet aura, high fantasy speed atmosphere" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAi4rMvvHLmxPSuy2Mpo2UcTdcYmxMYndySVOLQVtClR7SVQVEEBqbZ8r71QHd1O_ps-A-9DmKMuEr1-nJXvuV7X_lih93C3ABhBUMcIHmw2u-Jt-Tyzrozhp2b0Fxa28gc4-VBv0CA14TtE2xCUhfQ1FEaOHv92k_kTC-Af7YAW1_7hz_pQVSF-USHDu0BPpsruXBjf-knAJ524QRm_UNORX0xy801RCmgc3kpdrFKX8HzZZZR-Bqj" />
                          </div>
                        </div>
                        <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-surface-container-lowest flex items-center justify-center text-[10px] font-headline-sm text-primary font-bold">{' '}7K{' '}
                        </div>
                      </div>
                      <div className="flex flex-col min-w-0 flex-1">
                        <div className="flex items-center gap-space-xs flex-wrap">
                          <span className="font-headline-sm text-headline-sm text-on-surface truncate">Blue Zenith
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-[#FFCC22]/15 text-[#FFCC22] font-label-sm text-[11px] font-bold flex items-center gap-0.5">
                            <span className="material-symbols-outlined text-[12px]">star
                            </span>{' '}4.86{' '}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-on-surface-variant font-label-sm text-label-sm mt-0.5">
                          <span className="text-on-surface font-medium truncate">xi
                          </span>
                          <span>·
                          </span>
                          <span>200 BPM
                          </span>
                          <span>·
                          </span>
                          <span>4:12
                          </span>
                          <span>·
                          </span>
                          <span className="text-outline">mapped by Jinjin
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-space-md self-end sm:self-center">
                      <div className="flex flex-col items-end">
                        <span className="px-2.5 py-1 rounded-full bg-[#22c55e]/15 text-[#22c55e] font-label-md text-label-md font-bold flex items-center gap-1 shadow-sm">
                          <span className="material-symbols-outlined text-[15px]">verified
                          </span>{' '}Tried · 95.12%{' '}
                        </span>
                        <span className="text-[11px] font-label-sm text-on-surface-variant mt-1">S rank · 2 misses
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-sm pt-space-xs">
                    <div className="flex items-center gap-space-md flex-wrap">
                      <div className="flex items-center gap-1 text-[#FFCC22]" title="Your Rating: 3/5 stars">
                        <span className="material-symbols-outlined text-[18px]">star
                        </span>
                        <span className="material-symbols-outlined text-[18px]">star
                        </span>
                        <span className="material-symbols-outlined text-[18px]">star
                        </span>
                        <span className="material-symbols-outlined text-[18px] text-outline-variant">star
                        </span>
                        <span className="material-symbols-outlined text-[18px] text-outline-variant">star
                        </span>
                      </div>
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="px-2 py-0.5 rounded-full bg-surface-container font-label-sm text-[11px] text-on-surface-variant">stream
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-surface-container font-label-sm text-[11px] text-on-surface-variant">speed
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-surface-container font-label-sm text-[11px] text-on-surface-variant">stamina
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-space-md justify-between lg:justify-end flex-1">
                      <div className="flex items-center gap-1.5 text-on-surface-variant font-label-sm text-label-sm">
                        <span className="material-symbols-outlined text-[16px] text-outline">drag_handle
                        </span>
                        <span>Neutral impact · Similar tempo maps kept at standard weight
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant hover:text-primary hover:bg-surface-container-high transition-colors" title="Preview Audio" type="button">
                          <span className="material-symbols-outlined text-[18px]">volume_up
                          </span>
                        </button>
                        <button className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant hover:text-secondary hover:bg-surface-container-high transition-colors" title="Bookmark" type="button">
                          <span className="material-symbols-outlined text-[18px]">bookmark
                          </span>
                        </button>
                        <button className="px-3 py-1 rounded-full bg-surface-container-high text-on-surface font-label-sm text-label-sm font-semibold hover:bg-primary hover:text-on-primary transition-all flex items-center gap-1" type="button">
                          <span className="material-symbols-outlined text-[14px]">sports_esports
                          </span>
                          <span>Replay
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                {/* ROW 6: 2-Star Rated, Tried (LeaF - Calamity Fortune) */}
                <div className="group relative bg-surface-container-low hover:bg-surface-container p-space-md rounded-DEFAULT transition-all duration-200 shadow-sm flex flex-col gap-space-sm">
                  <div className="flex items-start sm:items-center justify-between gap-space-md flex-col sm:flex-row">
                    <div className="flex items-center gap-space-md min-w-0 flex-1">
                      <div className="relative flex-shrink-0">
                        <div className="w-14 h-14 rounded-full overflow-hidden p-0.5 bg-gradient-to-tr from-error/60 to-surface-container-high">
                          <div className="w-full h-full rounded-full bg-surface-container-highest flex items-center justify-center overflow-hidden">
                            <img className="w-full h-full object-cover" data-alt="Gothic dark electronic game illustration of mechanical gears, crimson ritual symbols, fractured crimson stained glass on deep obsidian violet backdrop, expressive mood" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBZ4uCe6rpjKU7A8Pva_kvey79was84BHozlpOhzs6TcD0LaS3AFMVfEXZ44KvjRFPpFLru7OKfaFIdEmEoVAm4E-YF95sUOEgunlh_AMmYIRM0V1NihhyGgEcfCMSlVpyrkNZFg3N2SOnjX_NeAIL-KXfHBeOycCVoMW1IihH75NSA7debpbWqUZ4uX6t-DjoiJucbaRaPH8xXBCuKkSefKF3_pC1XSKiQ9M58sw3g7158X2Y4J4KM" />
                          </div>
                        </div>
                        <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-surface-container-lowest flex items-center justify-center text-[10px] font-headline-sm text-primary font-bold">{' '}7K{' '}
                        </div>
                      </div>
                      <div className="flex flex-col min-w-0 flex-1">
                        <div className="flex items-center gap-space-xs flex-wrap">
                          <span className="font-headline-sm text-headline-sm text-on-surface truncate">Calamity Fortune
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-[#FFCC22]/15 text-[#FFCC22] font-label-sm text-[11px] font-bold flex items-center gap-0.5">
                            <span className="material-symbols-outlined text-[12px]">star
                            </span>{' '}5.12{' '}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-on-surface-variant font-label-sm text-label-sm mt-0.5">
                          <span className="text-on-surface font-medium truncate">LeaF
                          </span>
                          <span>·
                          </span>
                          <span>174 BPM
                          </span>
                          <span>·
                          </span>
                          <span>2:18
                          </span>
                          <span>·
                          </span>
                          <span className="text-outline">mapped by Blocko
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-space-md self-end sm:self-center">
                      <div className="flex flex-col items-end">
                        <span className="px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-300 font-label-md text-label-md font-bold flex items-center gap-1 shadow-sm">
                          <span className="material-symbols-outlined text-[15px]">trending_down
                          </span>{' '}Tried · 88.40%{' '}
                        </span>
                        <span className="text-[11px] font-label-sm text-on-surface-variant mt-1">B rank · 14 misses
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-sm pt-space-xs">
                    <div className="flex items-center gap-space-md flex-wrap">
                      <div className="flex items-center gap-1 text-[#FFCC22]" title="Your Rating: 2/5 stars">
                        <span className="material-symbols-outlined text-[18px]">star
                        </span>
                        <span className="material-symbols-outlined text-[18px]">star
                        </span>
                        <span className="material-symbols-outlined text-[18px] text-outline-variant">star
                        </span>
                        <span className="material-symbols-outlined text-[18px] text-outline-variant">star
                        </span>
                        <span className="material-symbols-outlined text-[18px] text-outline-variant">star
                        </span>
                      </div>
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="px-2 py-0.5 rounded-full bg-surface-container font-label-sm text-[11px] text-on-surface-variant">chordjack
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-surface-container font-label-sm text-[11px] text-on-surface-variant">stamina
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-space-md justify-between lg:justify-end flex-1">
                      <div className="flex items-center gap-1.5 text-secondary font-label-sm text-label-sm">
                        <span className="material-symbols-outlined text-[16px] text-secondary">arrow_downward
                        </span>
                        <span>High release penalty flagged · Decreasing 174 BPM chordjack frequency
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant hover:text-primary hover:bg-surface-container-high transition-colors" title="Preview Audio" type="button">
                          <span className="material-symbols-outlined text-[18px]">volume_up
                          </span>
                        </button>
                        <button className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant hover:text-secondary hover:bg-surface-container-high transition-colors" title="Bookmark" type="button">
                          <span className="material-symbols-outlined text-[18px]">bookmark
                          </span>
                        </button>
                        <button className="px-3 py-1 rounded-full bg-surface-container-high text-on-surface font-label-sm text-label-sm font-semibold hover:bg-primary hover:text-on-primary transition-all flex items-center gap-1" type="button">
                          <span className="material-symbols-outlined text-[14px]">sports_esports
                          </span>
                          <span>Replay
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              {/* Pagination / Feed End Indicator */}
              <div className="flex items-center justify-between p-space-md bg-surface-container-low rounded-DEFAULT mt-space-sm">
                <span className="font-label-sm text-label-sm text-on-surface-variant">Showing 6 of 38 plays in this training season
                </span>
                <div className="flex items-center gap-2">
                  <button className="px-space-md py-1.5 rounded-full bg-surface-container text-on-surface font-label-sm text-label-sm hover:bg-surface-container-high transition-colors" type="button">{' '}Previous 10{' '}
                  </button>
                  <button className="px-space-md py-1.5 rounded-full bg-primary-container text-on-primary-container font-label-sm text-label-sm font-semibold hover:opacity-90 transition-opacity" type="button">{' '}Load More History{' '}
                  </button>
                </div>
              </div>
            </div>
            {/* Right Column: History Analytics & Model Tuning Panel (4 Cols on XL) */}
            <div className="xl:col-span-4 flex flex-col gap-space-lg">
              {/* Panel 1: Algorithmic Feedback Impact */}
              <div className="bg-surface-container-low p-space-lg rounded-DEFAULT shadow-md flex flex-col gap-space-md">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-[20px]">psychology
                    </span>
                    <h2 className="font-headline-sm text-headline-sm text-on-surface">Feedback Impact
                    </h2>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-primary-container/20 text-primary font-label-sm text-[10px] font-bold">5.0★ Training Engine
                  </span>
                </div>
                <p className="font-body-sm text-body-sm text-on-surface-variant">{' '}How your recent ratings reshaped Sora's personalized recommendation neural weights:{' '}
                </p>
                {/* Visual Adjustment Bars */}
                <div className="flex flex-col gap-space-sm pt-space-xs">
                  {/* Item 1: Jumpstream */}
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between font-label-sm text-label-sm">
                      <span className="text-on-surface">Jumpstream Affinity
                      </span>
                      <span className="text-primary font-bold">+18% boost
                      </span>
                    </div>
                    <div className="h-2 w-full bg-surface-container rounded-full overflow-hidden flex">
                      <div className="h-full bg-gradient-to-r from-primary to-primary-container rounded-full" style={{ width: "78%" }}>
                      </div>
                    </div>
                    <span className="text-[10px] font-label-sm text-on-surface-variant">Increased priority across 180-195 BPM range
                    </span>
                  </div>
                  {/* Item 2: Dense Chordjack */}
                  <div className="flex flex-col gap-1 pt-1">
                    <div className="flex items-center justify-between font-label-sm text-label-sm">
                      <span className="text-on-surface">Dense Chordjack ({'>'}180 BPM)
                      </span>
                      <span className="text-secondary font-bold">-12% trimmed
                      </span>
                    </div>
                    <div className="h-2 w-full bg-surface-container rounded-full overflow-hidden flex">
                      <div className="h-full bg-secondary rounded-full" style={{ width: "38%" }}>
                      </div>
                    </div>
                    <span className="text-[10px] font-label-sm text-on-surface-variant">High release penalty detected; shifted to recovery drills
                    </span>
                  </div>
                  {/* Item 3: Technical LN Patterns */}
                  <div className="flex flex-col gap-1 pt-1">
                    <div className="flex items-center justify-between font-label-sm text-label-sm">
                      <span className="text-on-surface">Technical Long Notes (LN)
                      </span>
                      <span className="text-tertiary font-bold">+9% preference
                      </span>
                    </div>
                    <div className="h-2 w-full bg-surface-container rounded-full overflow-hidden flex">
                      <div className="h-full bg-tertiary rounded-full" style={{ width: "64%" }}>
                      </div>
                    </div>
                    <span className="text-[10px] font-label-sm text-on-surface-variant">Ascension to Heaven logged high consistency
                    </span>
                  </div>
                </div>
                <div className="p-space-sm rounded-DEFAULT bg-surface-container flex items-center gap-space-sm mt-1">
                  <span className="material-symbols-outlined text-primary text-[20px] flex-shrink-0">info
                  </span>
                  <span className="font-body-sm text-[12px] text-on-surface-variant leading-tight">{' '}Next recommendation cohort refreshes in{' '}
                    <strong className="text-on-surface">42 minutes
                    </strong>{' '}or upon your next submitted play.{' '}
                  </span>
                </div>
              </div>
              {/* Panel 2: Rating Distribution Breakdown */}
              <div className="bg-surface-container-low p-space-lg rounded-DEFAULT shadow-md flex flex-col gap-space-md">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#FFCC22] text-[20px]">equalizer
                    </span>
                    <h2 className="font-headline-sm text-headline-sm text-on-surface">Rating Distribution
                    </h2>
                  </div>
                  <span className="font-label-sm text-label-sm text-on-surface-variant">38 ratings
                  </span>
                </div>
                {/* Star Distribution Histogram */}
                <div className="flex flex-col gap-2">
                  {/* 5 Stars */}
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-0.5 w-16 text-[#FFCC22] font-label-sm text-label-sm">
                      <span>5
                      </span>
                      <span className="material-symbols-outlined text-[14px]">star
                      </span>
                    </div>
                    <div className="flex-1 h-3 bg-surface-container rounded-full overflow-hidden">
                      <div className="h-full bg-[#FFCC22] rounded-full" style={{ width: "37%" }}>
                      </div>
                    </div>
                    <span className="w-8 text-right font-label-sm text-label-sm text-on-surface font-semibold">14
                    </span>
                  </div>
                  {/* 4 Stars */}
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-0.5 w-16 text-[#FFCC22] font-label-sm text-label-sm">
                      <span>4
                      </span>
                      <span className="material-symbols-outlined text-[14px]">star
                      </span>
                    </div>
                    <div className="flex-1 h-3 bg-surface-container rounded-full overflow-hidden">
                      <div className="h-full bg-primary-container rounded-full" style={{ width: "42%" }}>
                      </div>
                    </div>
                    <span className="w-8 text-right font-label-sm text-label-sm text-on-surface font-semibold">16
                    </span>
                  </div>
                  {/* 3 Stars */}
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-0.5 w-16 text-[#FFCC22] font-label-sm text-label-sm">
                      <span>3
                      </span>
                      <span className="material-symbols-outlined text-[14px]">star
                      </span>
                    </div>
                    <div className="flex-1 h-3 bg-surface-container rounded-full overflow-hidden">
                      <div className="h-full bg-surface-bright rounded-full" style={{ width: "13%" }}>
                      </div>
                    </div>
                    <span className="w-8 text-right font-label-sm text-label-sm text-on-surface-variant font-semibold">5
                    </span>
                  </div>
                  {/* 2 Stars */}
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-0.5 w-16 text-[#FFCC22] font-label-sm text-label-sm">
                      <span>2
                      </span>
                      <span className="material-symbols-outlined text-[14px]">star
                      </span>
                    </div>
                    <div className="flex-1 h-3 bg-surface-container rounded-full overflow-hidden">
                      <div className="h-full bg-secondary rounded-full" style={{ width: "5%" }}>
                      </div>
                    </div>
                    <span className="w-8 text-right font-label-sm text-label-sm text-on-surface-variant font-semibold">2
                    </span>
                  </div>
                  {/* 1 Star */}
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-0.5 w-16 text-[#FFCC22] font-label-sm text-label-sm">
                      <span>1
                      </span>
                      <span className="material-symbols-outlined text-[14px]">star
                      </span>
                    </div>
                    <div className="flex-1 h-3 bg-surface-container rounded-full overflow-hidden">
                      <div className="h-full bg-error rounded-full" style={{ width: "3%" }}>
                      </div>
                    </div>
                    <span className="w-8 text-right font-label-sm text-label-sm text-on-surface-variant font-semibold">1
                    </span>
                  </div>
                </div>
                <div className="pt-space-xs">
                  <div className="flex items-center justify-between p-space-sm rounded-DEFAULT bg-surface-container">
                    <span className="font-label-sm text-label-sm text-on-surface-variant">Algorithmic Confidence
                    </span>
                    <span className="font-label-md text-label-md text-tertiary font-bold">96.2% High
                    </span>
                  </div>
                </div>
              </div>
              {/* Panel 3: Diagnostic Quick Actions */}
              <div className="bg-surface-container-low p-space-lg rounded-DEFAULT shadow-md flex flex-col gap-space-sm">
                <h3 className="font-label-md text-label-md text-on-surface uppercase tracking-wider font-semibold">Calibration Controls
                </h3>
                <p className="font-body-sm text-body-sm text-on-surface-variant">{' '}Modify or export your training history profile to keep RecOsuk aligned with your playstyle goals.{' '}
                </p>
                <div className="flex flex-col gap-2 pt-2">
                  <button className="w-full py-2.5 px-space-md rounded-full bg-surface-container text-on-surface hover:bg-surface-container-high transition-colors font-label-md text-label-md flex items-center justify-center gap-2" type="button">
                    <span className="material-symbols-outlined text-[18px]">file_download
                    </span>
                    <span>Export feedback log (.json)
                    </span>
                  </button>
                  <button className="w-full py-2.5 px-space-md rounded-full bg-surface-container text-secondary hover:bg-secondary-container hover:text-on-secondary-container transition-colors font-label-md text-label-md flex items-center justify-center gap-2" type="button">
                    <span className="material-symbols-outlined text-[18px]">restart_alt
                    </span>
                    <span>Reset algorithmic weights
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </ExampleBlock>
  )
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

interface HistoryRow {
  entry: FeedbackEntry
  summary: BeatmapsetSummary | null
}

function HistoryReal({ userId, username }: { userId: string; username: string | null }) {
  const [rows, setRows] = useState<HistoryRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [modeFilter, setModeFilter] = useState<GameMode | 'all'>('all')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rowError, setRowError] = useState<string | null>(null)

  // Downloaded section (§AE): the seen store's `downloaded` list
  // for this account's key is the same source of truth the
  // recommendation hiding uses — ids only, newest first, capped.
  // Titles come from the same cached beatmapset lookup the
  // feedback rows use; an id that cannot be resolved shows the
  // honest `Beatmapset #id` fallback, never an invented title.
  // Limits, stated in the section footnote: per-browser and per
  // tier+username key — guest downloads live under the guest key
  // and do not carry into this account view.
  const seenVersion = useSeenVersion()
  const downloadKey = username ? seenKey('account', username) : null
  const downloadIds = useMemo(
    () => (downloadKey ? seenStore.load(downloadKey).downloaded : []),
    [downloadKey, seenVersion],
  )
  const { ids: recentDownloadIds, total: totalDownloads } = useMemo(
    () => takeRecentDownloaded(downloadIds, DOWNLOAD_HISTORY_LIMIT),
    [downloadIds],
  )
  const [downloadSummaries, setDownloadSummaries] = useState<
    Record<number, BeatmapsetSummary | null>
  >({})
  useEffect(() => {
    if (recentDownloadIds.length === 0) return
    let live = true
    Promise.all(recentDownloadIds.map((id) => fetchBeatmapsetSummary(id)))
      .then((summaries) => {
        if (!live) return
        setDownloadSummaries((prev) => {
          const next = { ...prev }
          summaries.forEach((s, i) => {
            next[recentDownloadIds[i]] = s
          })
          return next
        })
      })
      .catch(() => {
        // Summaries stay absent → id-fallback rows. A failed
        // lookup must never block the downloads list itself.
      })
    return () => {
      live = false
    }
  }, [recentDownloadIds])

  useEffect(() => {
    let live = true
    setError(null)
    loadAllFeedback(supabase, userId)
      .then(async (entries) => {
        const enriched = await Promise.all(
          entries.map(async (entry): Promise<HistoryRow> => {
            const summary =
              entry.beatmapset_id !== null
                ? await fetchBeatmapsetSummary(entry.beatmapset_id, {
                    mode: entry.mode ?? undefined,
                    beatmapId: entry.beatmap_id,
                  })
                : null
            return { entry, summary }
          }),
        )
        if (live) setRows(enriched)
      })
      .catch((err) => {
        if (live) setError(errorMessage(err))
      })
    return () => {
      live = false
    }
  }, [userId])

  const save = async (row: HistoryRow, next: { rating: number | null; status: FeedbackStatus }) => {
    const key = row.entry.id ?? String(row.entry.beatmap_id)
    setBusyId(key)
    setRowError(null)
    try {
      const updated = await upsertFeedback(supabase, userId, {
        beatmapId: row.entry.beatmap_id,
        beatmapsetId: row.entry.beatmapset_id ?? 0,
        mode: row.entry.mode,
        status: next.status,
        rating: next.rating,
      })
      setRows((prev) =>
        prev?.map((r) => (r.entry.beatmap_id === row.entry.beatmap_id ? { ...r, entry: updated } : r)) ?? null,
      )
    } catch (err) {
      setRowError(errorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (row: HistoryRow) => {
    const key = row.entry.id ?? String(row.entry.beatmap_id)
    setBusyId(key)
    setRowError(null)
    try {
      await deleteFeedback(supabase, userId, row.entry.beatmap_id)
      setRows((prev) => prev?.filter((r) => r.entry.beatmap_id !== row.entry.beatmap_id) ?? null)
    } catch (err) {
      setRowError(errorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  const visible = (rows ?? []).filter((r) => modeFilter === 'all' || r.entry.mode === modeFilter)
  const triedCount = (rows ?? []).filter((r) => r.entry.status === 'tried').length
  const ratedCount = (rows ?? []).filter((r) => r.entry.rating !== null).length
  const skippedCount = (rows ?? []).filter((r) => r.entry.status === 'skipped').length
  const anySummaryMissing = visible.some((r) => r.summary === null)

  return (
    <div className="flex flex-col w-full">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-space-lg mb-space-lg">
        <div className="flex flex-col gap-space-xs max-w-3xl">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-full bg-surface-container-high text-primary font-label-sm text-label-sm tracking-wider uppercase">
              Adaptive Training Log
            </span>
          </div>
          <h1 className="font-headline-xl text-headline-xl text-on-surface tracking-tight">Tried and rated</h1>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Track played recommendation outcomes and view how your feedback calibrates future
            algorithmic drills — per mode.
          </p>
        </div>
      </div>

      {error && (
        <p className="mb-space-md font-body-sm text-body-sm text-error" role="alert">
          {error}
        </p>
      )}

      {rows === null && !error && (
        <p className="font-body-md text-body-md text-on-surface-variant">Loading your history…</p>
      )}

      {rows !== null && (
        <>
          <div className="w-full bg-surface-container-low p-space-md rounded-DEFAULT shadow-md mb-space-lg">
            <div className="flex flex-wrap items-center gap-space-lg font-label-md text-label-md text-on-surface-variant">
              <span>
                <strong className="text-on-surface">{triedCount}</strong> tried
              </span>
              <span>
                <strong className="text-on-surface">{ratedCount}</strong> rated
              </span>
              <span>
                <strong className="text-on-surface">{skippedCount}</strong> skipped
              </span>
              <span className="text-[11px]">Ratings re-weight your next run in the same mode only.</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-space-md">
            <button
              className={`px-3 py-1.5 rounded-full font-label-md text-label-md ${modeFilter === 'all' ? 'bg-primary-container text-on-primary-container' : 'bg-surface-container text-on-surface-variant'}`}
              type="button"
              onClick={() => setModeFilter('all')}
            >
              All modes
            </button>
            {GAME_MODES.map((m) => (
              <button
                key={m}
                className={`px-3 py-1.5 rounded-full font-label-md text-label-md flex items-center gap-1.5 ${modeFilter === m ? 'bg-primary-container text-on-primary-container' : 'bg-surface-container text-on-surface-variant'}`}
                type="button"
                onClick={() => setModeFilter(m)}
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: MODE_ACCENTS[m] }} />
                {modeLabel(m)}
              </button>
            ))}
          </div>

          {rowError && (
            <p className="mb-space-sm font-body-sm text-body-sm text-error" role="alert">
              {rowError}
            </p>
          )}

          {visible.length === 0 && (
            <div className="p-space-lg rounded-DEFAULT bg-surface-container-low">
              <p className="font-body-md text-body-md text-on-surface-variant">
                {rows.length === 0
                  ? 'No tried or rated maps yet. Rate maps from any recommendation or Mirror card with the star button — your ratings re-weight the next run in that mode.'
                  : 'Nothing in this mode yet. Switch the filter or rate a map in this mode.'}
              </p>
            </div>
          )}

          {anySummaryMissing && visible.length > 0 && (
            <p className="mb-space-sm font-body-sm text-body-sm text-on-surface-variant">
              Some map details could not be loaded — the proxy may need a redeploy for the beatmap
              lookup. Your ratings themselves are intact.
            </p>
          )}

          <div className="flex flex-col gap-space-sm">
            {visible.map((row) => {
              const key = row.entry.id ?? String(row.entry.beatmap_id)
              const busy = busyId === key
              const rating = row.entry.rating
              return (
                <div
                  key={key}
                  className="flex flex-col sm:flex-row sm:items-center gap-3 p-space-md rounded-DEFAULT bg-surface-container"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-11 h-11 rounded-full overflow-hidden flex-shrink-0 bg-surface-container-highest">
                      {row.summary?.cover ? (
                        <img className="w-full h-full object-cover" alt="" src={row.summary.cover} loading="lazy" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <span className="material-symbols-outlined text-on-surface-variant">music_note</span>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="font-label-md text-label-md text-on-surface truncate">
                        {row.summary ? row.summary.title : `Beatmapset #${row.entry.beatmapset_id ?? row.entry.beatmap_id}`}
                      </span>
                      <span className="font-label-sm text-label-sm text-on-surface-variant truncate">
                        {row.summary ? `by ${row.summary.artist}` : 'Details unavailable'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {row.entry.mode && (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container-highest text-on-surface font-label-sm text-[11px]">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: MODE_ACCENTS[row.entry.mode] }} />
                        {modeLabel(row.entry.mode)}
                      </span>
                    )}
                    <span
                      className={`px-2 py-0.5 rounded-full font-label-sm text-[11px] ${row.entry.status === 'tried' ? 'bg-primary-container text-on-primary-container' : 'bg-surface-container-highest text-on-surface-variant'}`}
                    >
                      {row.entry.status}
                    </span>
                    <div className="flex items-center gap-0.5 text-[#FFCC22]">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          className="p-0.5 hover:scale-110 transition-transform disabled:opacity-60"
                          type="button"
                          aria-label={`Rate ${n} star${n > 1 ? 's' : ''}`}
                          title={`${n} star${n > 1 ? 's' : ''} (click the current rating to clear it)`}
                          disabled={busy}
                          onClick={() =>
                            void save(row, { rating: rating === n ? null : n, status: 'tried' })
                          }
                        >
                          <span
                            className="material-symbols-outlined text-[20px]"
                            style={rating !== null && n <= rating ? { fontVariationSettings: "'FILL' 1" } : undefined}
                          >
                            star
                          </span>
                        </button>
                      ))}
                    </div>
                    <button
                      className={`px-2.5 py-1 rounded-full font-label-sm text-label-sm ${row.entry.status === 'skipped' ? 'bg-primary-container text-on-primary-container' : 'bg-surface-container-highest text-on-surface-variant'}`}
                      type="button"
                      disabled={busy}
                      onClick={() => void save(row, { rating, status: row.entry.status === 'skipped' ? 'tried' : 'skipped' })}
                    >
                      {row.entry.status === 'skipped' ? 'Mark tried' : 'Mark skipped'}
                    </button>
                    <button
                      className="w-8 h-8 rounded-full hover:bg-surface-container-high text-on-surface-variant hover:text-error flex items-center justify-center disabled:opacity-60"
                      type="button"
                      aria-label="Remove from history"
                      title="Remove this entry"
                      disabled={busy}
                      onClick={() => void remove(row)}
                    >
                      <span className="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {downloadKey && (
        <section className="mt-space-lg" aria-label="Downloaded beatmaps">
          <h2 className="font-headline-sm text-headline-sm text-on-surface mb-space-xs">Downloaded</h2>
          <p className="font-body-sm text-body-sm text-on-surface-variant mb-space-sm">
            {totalDownloads === 0
              ? 'No downloads recorded in this browser yet.'
              : `Showing the ${recentDownloadIds.length} most recent of ${totalDownloads} downloaded beatmapsets.`}
          </p>
          {recentDownloadIds.length > 0 && (
            <div className="flex flex-col gap-space-sm">
              {recentDownloadIds.map((id) => {
                const summary = downloadSummaries[id] ?? null
                return (
                  <div
                    key={id}
                    className="flex flex-col sm:flex-row sm:items-center gap-3 p-space-md rounded-DEFAULT bg-surface-container"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-11 h-11 rounded-full overflow-hidden flex-shrink-0 bg-surface-container-highest">
                        {summary?.cover ? (
                          <img className="w-full h-full object-cover" alt="" src={summary.cover} loading="lazy" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <span className="material-symbols-outlined text-on-surface-variant">music_note</span>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="font-label-md text-label-md text-on-surface truncate">
                          {summary ? summary.title : `Beatmapset #${id}`}
                        </span>
                        <span className="font-label-sm text-label-sm text-on-surface-variant truncate">
                          {summary ? `by ${summary.artist}` : 'Details unavailable'}
                        </span>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full bg-surface-container-highest text-on-surface-variant font-label-sm text-[11px] flex-shrink-0">
                      Downloaded
                    </span>
                  </div>
                )
              })}
            </div>
          )}
          <p className="font-body-sm text-body-sm text-on-surface-variant mt-space-sm">
            Download history is stored locally in this browser, under this account&apos;s key —
            it doesn&apos;t follow you to other browsers, and guest downloads stay separate.
          </p>
        </section>
      )}
    </div>
  )
}

export default function History() {
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
      {isReal && user ? <HistoryReal userId={user.id} username={sidebarName} /> : <HistoryDemo />}
    </AppShell>
  )
}
