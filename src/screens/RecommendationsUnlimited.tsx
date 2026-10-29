// Converted from Stitch export: stitch-raw/08b-recommendations-unlimited.html
// M3 (§13): the exported markup below is the DEMO variant, rendered
// unchanged when nothing is linked. The real variant at the bottom is
// the endless feed: windowed re-ranking over a cursor-paginated pool,
// seen-set dedupe, honest end card.
import { useCallback, useEffect, useRef, useState } from 'react'
import AppShell from '../components/AppShell'
import BeatmapRow from '../components/BeatmapRow'
import LoadingState from '../components/LoadingState'
import RecFiltersPanel from '../components/RecFiltersPanel'
import { seedPlayedSets, useProfileData, type ProfileData } from '../lib/profileService'
import { useModeStore } from '../lib/modeStore'
import { MODE_LABELS } from '../lib/mode'
import {
  defaultFiltersFor,
  FeedSession,
  type RecCandidate,
  type RecFilters,
} from '../lib/recommend'
import { seenKey, seenStore, type SeenState } from '../lib/seenStore'
import { supabase } from '../lib/supabase'
import { loadModeBoostFor } from '../lib/feedback'
import { useCapabilities } from '../lib/capabilities'
import { useRowMaps } from '../lib/useRowMaps'
import { useAuth } from '../lib/auth'

// Identity shown by the demo fallback variant: sample data, not a real player.
const DEMO_IDENTITY = {
  username: 'sora_playz',
  pp: 5284,
  countryCode: 'VN',
  tierLabel: 'free tier',
}

function RecommendationsUnlimitedDemo() {
  return (
    <AppShell identity={DEMO_IDENTITY}>
        <div className="flex flex-col w-full">
          {/* Top Ambient Glow Aura */}
          <div className="relative w-full">
            <div className="absolute -top-12 left-1/4 w-96 h-36 bg-primary-container/15 rounded-full blur-3xl pointer-events-none">
            </div>
            <div className="absolute -top-10 right-10 w-80 h-32 bg-secondary-container/20 rounded-full blur-3xl pointer-events-none">
            </div>
          </div>
          {/* Page Header Area */}
          <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-lg pb-space-lg">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-space-sm">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-primary-container/20 text-primary font-label-sm text-label-sm border-surface-container-highest/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse">
                  </span>Endless feed mode
                </span>
                <span className="text-on-surface-variant font-label-sm text-label-sm">• ~4,200 maps match your filters
                </span>
              </div>
              <h1 className="font-headline-xl text-headline-xl text-on-surface tracking-tight">Recommendations
              </h1>
              <p className="font-body-md text-body-md text-on-surface-variant">{' '}Targeted algorithmic drill sets tailored to your rhythm input drift and recovery windows.{' '}
              </p>
            </div>
            {/* Mode Controller Hub */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-space-md bg-surface-container-low p-space-sm rounded-lg shadow-sm">
              <div className="flex items-center gap-space-sm px-space-xs">
                <label className="relative inline-flex items-center cursor-pointer select-none">
                  <input checked className="sr-only peer" id="unlimited-toggle" type="checkbox" />
                  <div className="w-11 h-6 bg-primary-container rounded-full peer peer-focus:outline-none after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-on-primary after:rounded-full after:h-5 after:w-5 after:transition-all after:translate-x-full shadow-[0_0_12px_rgba(164,118,255,0.4)]">
                  </div>
                </label>
                <div className="flex flex-col">
                  <div className="flex items-center gap-1.5">
                    <span className="font-label-md text-label-md text-on-surface leading-none">Unlimited beatmaps
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-primary-container/20 text-primary text-[10px] font-bold uppercase leading-none">Active
                    </span>
                  </div>
                  <span className="font-body-sm text-[11px] text-on-surface-variant leading-tight mt-0.5">Ordered for you as it loads. Change any filter and the feed restarts.
                  </span>
                </div>
              </div>
            </div>
          </header>
          {/* Dual Column Layout: Left Filter Rail & Main Stream */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-start mt-space-sm">
            {/* LEFT FILTER PANEL (approx 280px-300px on desktop) */}
            <aside className="lg:col-span-4 xl:col-span-3 flex flex-col gap-space-md bg-surface-container-low p-space-md rounded-lg shadow-md sticky top-20">
              <div className="flex items-center justify-between pb-space-xs">
                <div className="flex flex-col">
                  <div className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-primary text-[20px]">tune
                    </span>
                    <h2 className="font-headline-sm text-headline-sm text-on-surface">Filters
                    </h2>
                  </div>
                  <span className="font-body-sm text-body-sm text-on-surface-variant">Filters narrow list. Ranking is pp-based.
                  </span>
                </div>
              </div>
              {/* Star Rating Range */}
              <div className="flex flex-col gap-space-xs bg-surface-container p-space-sm rounded-DEFAULT">
                <div className="flex items-center justify-between">
                  <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">Difficulty
                  </span>
                  <span className="font-label-md text-label-md text-primary font-bold">4.0★ – 5.5★
                  </span>
                </div>
                <div className="relative py-2 flex items-center">
                  <div className="w-full h-1.5 bg-surface-container-highest rounded-full overflow-hidden relative">
                    <div className="absolute left-[35%] right-[20%] h-full bg-gradient-to-r from-primary to-primary-container shadow-[0_0_8px_rgba(164,118,255,0.8)]">
                    </div>
                  </div>
                  <div className="absolute left-[35%] w-3.5 h-3.5 bg-on-primary rounded-full shadow-md cursor-grab -translate-x-1/2 ring-2 ring-primary">
                  </div>
                  <div className="absolute right-[20%] w-3.5 h-3.5 bg-on-primary rounded-full shadow-md cursor-grab translate-x-1/2 ring-2 ring-primary">
                  </div>
                </div>
                <div className="flex justify-between font-label-sm text-[10px] text-on-surface-variant">
                  <span>0★
                  </span>
                  <span>5.0★ Target
                  </span>
                  <span>10★
                  </span>
                </div>
              </div>
              {/* BPM Slider */}
              <div className="flex flex-col gap-space-xs bg-surface-container p-space-sm rounded-DEFAULT">
                <div className="flex items-center justify-between">
                  <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">Tempo
                  </span>
                  <span className="font-label-md text-label-md text-secondary font-bold">160 – 200 BPM
                  </span>
                </div>
                <div className="relative py-2 flex items-center">
                  <div className="w-full h-1.5 bg-surface-container-highest rounded-full overflow-hidden relative">
                    <div className="absolute left-[40%] right-[30%] h-full bg-secondary">
                    </div>
                  </div>
                  <div className="absolute left-[40%] w-3.5 h-3.5 bg-surface-container-lowest rounded-full -translate-x-1/2 ring-2 ring-secondary">
                  </div>
                  <div className="absolute right-[30%] w-3.5 h-3.5 bg-surface-container-lowest rounded-full translate-x-1/2 ring-2 ring-secondary">
                  </div>
                </div>
                <div className="flex justify-between font-label-sm text-[10px] text-on-surface-variant">
                  <span>100
                  </span>
                  <span>180 BPM
                  </span>
                  <span>280+
                  </span>
                </div>
              </div>
              {/* Key Count Pills */}
              <div className="flex flex-col gap-space-xs">
                <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">Key Count (Mania)
                </span>
                <div className="grid grid-cols-3 gap-1.5">
                  <button className="py-1.5 text-center rounded-DEFAULT bg-surface-container hover:bg-surface-container-high text-on-surface-variant font-label-sm text-label-sm transition-colors" type="button">4K
                  </button>
                  <button className="py-1.5 text-center rounded-DEFAULT bg-surface-container hover:bg-surface-container-high text-on-surface-variant font-label-sm text-label-sm transition-colors" type="button">5K
                  </button>
                  <button className="py-1.5 text-center rounded-DEFAULT bg-surface-container hover:bg-surface-container-high text-on-surface-variant font-label-sm text-label-sm transition-colors" type="button">6K
                  </button>
                  <button className="py-1.5 text-center rounded-DEFAULT bg-primary text-on-primary font-label-md text-label-md font-bold shadow-[0_0_12px_rgba(210,187,255,0.4)]" type="button">7K
                  </button>
                  <button className="py-1.5 text-center rounded-DEFAULT bg-surface-container hover:bg-surface-container-high text-on-surface-variant font-label-sm text-label-sm transition-colors" type="button">8K
                  </button>
                  <button className="py-1.5 text-center rounded-DEFAULT bg-surface-container hover:bg-surface-container-high text-on-surface-variant font-label-sm text-label-sm transition-colors" type="button">All
                  </button>
                </div>
              </div>
              {/* Tags Selector */}
              <div className="flex flex-col gap-space-xs">
                <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">Pattern Skillsets
                </span>
                <div className="flex flex-wrap gap-1.5">
                  <span className="px-2.5 py-1 rounded-full bg-primary-container text-on-primary-container font-label-sm text-label-sm cursor-pointer shadow-sm">jumpstream
                  </span>
                  <span className="px-2.5 py-1 rounded-full bg-surface-container text-on-surface hover:bg-surface-container-high font-label-sm text-label-sm cursor-pointer transition-colors">chordjack
                  </span>
                  <span className="px-2.5 py-1 rounded-full bg-surface-container text-on-surface hover:bg-surface-container-high font-label-sm text-label-sm cursor-pointer transition-colors">LN
                  </span>
                  <span className="px-2.5 py-1 rounded-full bg-surface-container text-on-surface hover:bg-surface-container-high font-label-sm text-label-sm cursor-pointer transition-colors">stream
                  </span>
                  <span className="px-2.5 py-1 rounded-full bg-surface-container text-on-surface hover:bg-surface-container-high font-label-sm text-label-sm cursor-pointer transition-colors">technical
                  </span>
                  <span className="px-2.5 py-1 rounded-full bg-surface-container text-on-surface hover:bg-surface-container-high font-label-sm text-label-sm cursor-pointer transition-colors">stamina
                  </span>
                </div>
              </div>
              {/* Map Status Chips */}
              <div className="flex flex-col gap-space-xs">
                <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">Beatmap Status
                </span>
                <div className="flex flex-col gap-1">
                  <label className="flex items-center justify-between p-2 rounded-DEFAULT bg-primary-container/20 cursor-pointer">
                    <span className="font-label-sm text-label-sm text-primary font-semibold">Ranked + Loved
                    </span>
                    <div className="w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                      <span className="w-1.5 h-1.5 rounded-full bg-on-primary">
                      </span>
                    </div>
                  </label>
                  <label className="flex items-center justify-between p-2 rounded-DEFAULT bg-surface-container cursor-pointer hover:bg-surface-container-high transition-colors">
                    <span className="font-label-sm text-label-sm text-on-surface-variant">Ranked only
                    </span>
                    <div className="w-4 h-4 rounded-full bg-surface-container-highest">
                    </div>
                  </label>
                  <label className="flex items-center justify-between p-2 rounded-DEFAULT bg-surface-container cursor-pointer hover:bg-surface-container-high transition-colors">
                    <span className="font-label-sm text-label-sm text-on-surface-variant">Qualified / WIP
                    </span>
                    <div className="w-4 h-4 rounded-full bg-surface-container-highest">
                    </div>
                  </label>
                </div>
              </div>
              {/* Length Range */}
              <div className="flex flex-col gap-1 bg-surface-container p-space-sm rounded-DEFAULT">
                <div className="flex justify-between items-center">
                  <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">Length
                  </span>
                  <span className="font-label-sm text-label-sm text-on-surface font-semibold">1:30 – 4:30 min
                  </span>
                </div>
                <div className="w-full h-1.5 bg-surface-container-highest rounded-full overflow-hidden mt-1 relative">
                  <div className="absolute left-[25%] right-[25%] h-full bg-tertiary">
                  </div>
                </div>
              </div>
              {/* Filter Buttons CTA */}
              <div className="flex flex-col gap-2 pt-space-xs">
                <button className="w-full py-2.5 rounded-full bg-primary text-on-primary font-label-md text-label-md font-bold shadow-[0_0_14px_rgba(210,187,255,0.3)] hover:opacity-95 transition-opacity" type="button">{' '}Apply filters (24 maps){' '}
                </button>
                <button className="w-full py-2 rounded-full text-on-surface-variant hover:text-on-surface hover:bg-surface-container font-label-sm text-label-sm transition-colors" type="button">{' '}Reset filters{' '}
                </button>
              </div>
            </aside>
            {/* RIGHT BEATMAP STREAM (Col-8 or 9) */}
            <main className="lg:col-span-8 xl:col-span-9 flex flex-col gap-space-md">
              {/* Stream Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-space-xs py-1">
                <div className="flex items-center gap-space-sm flex-wrap">
                  <h2 className="font-headline-sm text-headline-sm text-on-surface">Training your 5.0★ gap — Endless stream
                  </h2>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-primary-container/20 text-primary font-label-sm text-[10px] font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse">
                    </span>Live stream active • ~4,200 maps available
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-on-surface-variant font-label-sm text-label-sm">
                  <span>Sorted by:
                  </span>
                  <span className="text-primary font-medium flex items-center gap-0.5 cursor-pointer hover:underline">pp training weight
                    <span className="material-symbols-outlined text-[16px]">arrow_downward
                    </span>
                  </span>
                </div>
              </div>
              {/* Map 1 */}
              <article className="group relative flex flex-col xl:flex-row items-start xl:items-center justify-between p-space-md bg-surface-container-low hover:bg-surface-container transition-all duration-200 rounded-lg shadow-sm gap-space-md">
                <div className="flex items-center gap-space-md flex-1 min-w-0 w-full">
                  {/* Circular Cover Art with Active Ring */}
                  <div className="relative flex-shrink-0">
                    <div className="w-14 h-14 rounded-full overflow-hidden p-0.5 bg-gradient-to-tr from-primary to-secondary">
                      <img className="w-full h-full object-cover rounded-full group-hover:scale-105 transition-transform duration-300" data-alt="Cybernetic futuristic city skyline at midnight saturated with ultraviolet and violet neon rays, high speed rhythm gaming aesthetic" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDuILuURjl0nwi5a19pFpfYT2EnaICT2kGx4bTTK-ataypUQ_Iy8zNGjZ5dCtSBfM_qdn2d7shXjyvPsX0RbpQu8WdycUxFlGYkSBo5A9aY72IUeYHz0TYh35sD4whxztZnEwqUzJU8nM-ngQz8772zljyDT26QcTQwXcPTjOipYzUxV9vvfTyvTIaszSh-wjb_F-NxsPXWNKe6dUBZeg6ImUqE7w8z-WwH4Obd7mn3maENuSgIyKnk" />
                    </div>
                    <div className="absolute -bottom-1 -right-1 px-1.5 py-0.5 bg-surface-container-lowest text-primary rounded-full font-label-sm text-[9px] font-bold">{' '}7K{' '}
                    </div>
                  </div>
                  {/* Metadata & Core Metrics */}
                  <div className="flex flex-col min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-space-xs mb-0.5">
                      <span className="px-2 py-0.5 rounded-full bg-[#FFCC22] text-[#332200] font-label-sm text-label-sm font-extrabold flex items-center gap-1 shadow-sm">
                        <span className="material-symbols-outlined text-[13px] leading-none">star
                        </span>5.24★{' '}
                      </span>
                      <h3 className="font-headline-sm text-headline-sm text-on-surface truncate">Exit This Earth's Atomosphere
                      </h3>
                      <span className="text-on-surface-variant font-body-sm text-body-sm">by Camellia
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-surface-variant/80 text-outline font-label-sm text-[10px]">Already downloaded
                      </span>
                    </div>
                    {/* Recommendation Reason Prompt */}
                    <p className="font-body-sm text-body-sm text-primary-fixed-dim leading-snug line-clamp-1 mb-2">{' '}Your accuracy drops above 5.0★ — this map trains that exact release threshold at 182 BPM.{' '}
                    </p>
                    {/* Technical Badges / Mini metrics */}
                    <div className="flex flex-wrap items-center gap-space-sm text-on-surface-variant font-label-sm text-label-sm">
                      <div className="flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px]">speed
                        </span>
                        <span>182 BPM
                        </span>
                      </div>
                      <span className="text-outline-variant">•
                      </span>
                      <div className="flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px]">timer
                        </span>
                        <span>2:44
                        </span>
                      </div>
                      <span className="text-outline-variant">•
                      </span>
                      <div className="flex items-center gap-1">
                        <span className="px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant text-[10px]">jumpstream
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant text-[10px]">chordjack
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant text-[10px]">technical
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                {/* Trailing Action Suite */}
                <div className="flex items-center justify-between xl:justify-end gap-space-sm w-full xl:w-auto pt-2 xl:pt-0 border-t border-surface-container-highest/30 xl:border-none">
                  {/* 5-Star Interactive Community Rater */}
                  <div className="flex items-center gap-0.5 text-[#FFCC22] px-2 py-1 bg-surface-container rounded-full">
                    <button className="material-symbols-outlined text-[16px] hover:scale-125 transition-transform" style={{ fontVariationSettings: "'FILL' 1" }} type="button">star
                    </button>
                    <button className="material-symbols-outlined text-[16px] hover:scale-125 transition-transform" style={{ fontVariationSettings: "'FILL' 1" }} type="button">star
                    </button>
                    <button className="material-symbols-outlined text-[16px] hover:scale-125 transition-transform" style={{ fontVariationSettings: "'FILL' 1" }} type="button">star
                    </button>
                    <button className="material-symbols-outlined text-[16px] hover:scale-125 transition-transform" style={{ fontVariationSettings: "'FILL' 1" }} type="button">star
                    </button>
                    <button className="material-symbols-outlined text-[16px] hover:scale-125 transition-transform text-outline-variant" type="button">star
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {/* Audio Preview Button */}
                    <button className="w-9 h-9 rounded-full bg-surface-container hover:bg-primary-container hover:text-on-primary-container text-on-surface flex items-center justify-center transition-all shadow-sm" title="Preview Song" type="button">
                      <span className="material-symbols-outlined text-[18px]">play_arrow
                      </span>
                    </button>
                    {/* Download Button (Downloaded state) */}
                    <button className="w-9 h-9 rounded-full bg-surface-container-highest text-tertiary flex items-center justify-center transition-all shadow-sm" title="Downloaded" type="button">
                      <span className="material-symbols-outlined text-[18px]">check_circle
                      </span>
                    </button>
                    {/* Save Button */}
                    <button className="w-9 h-9 rounded-full bg-surface-container hover:bg-secondary hover:text-on-secondary text-on-surface flex items-center justify-center transition-all shadow-sm" title="Save to Practice List" type="button">
                      <span className="material-symbols-outlined text-[18px]">bookmark_add
                      </span>
                    </button>
                    <button aria-label="Skip map" className="w-9 h-9 rounded-full bg-surface-container hover:bg-surface-container-high hover:text-error text-on-surface-variant flex items-center justify-center transition-all shadow-sm" title="Skip map" type="button">
                      <span className="material-symbols-outlined text-[18px]">close
                      </span>
                    </button>
                  </div>
                </div>
              </article>
              {/* Map 2 with Save Tooltip Lock Demo */}
              <article className="group relative flex flex-col xl:flex-row items-start xl:items-center justify-between p-space-md bg-surface-container-low hover:bg-surface-container transition-all duration-200 rounded-lg shadow-sm gap-space-md">
                <div className="flex items-center gap-space-md flex-1 min-w-0 w-full">
                  <div className="relative flex-shrink-0">
                    <div className="w-14 h-14 rounded-full overflow-hidden p-0.5 bg-gradient-to-tr from-primary to-secondary">
                      <img className="w-full h-full object-cover rounded-full group-hover:scale-105 transition-transform duration-300" data-alt="Abstract deep cosmic energy burst with fractal lightning and deep violet smoke ripples in an anime stylized concept art" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBTIKryfRzKPCr2GavlKN8SBeF7RW2slmlLMr2kjQ_yipNtFiZ3ki1on2hxTIfX64Gg-sKZSxv4IOMS9mBvwDUWQhMC_olxJDEf7Gfla_xkBiBO9UDStlpFjmbn3NdtA7i-7nYiDIat9fec_7rCezDqN4UApGrzNwBUAv6TIMPfbBeUmJpIWNQT8_jh15Ifx_Srm5tArHOHYrVwJTk3Cuxl28ytTl9PghXMphlD5rntBIVJxgAZVKw1" />
                    </div>
                    <div className="absolute -bottom-1 -right-1 px-1.5 py-0.5 bg-surface-container-lowest text-primary rounded-full font-label-sm text-[9px] font-bold">{' '}7K{' '}
                    </div>
                  </div>
                  <div className="flex flex-col min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-space-xs mb-0.5">
                      <span className="px-2 py-0.5 rounded-full bg-[#FFCC22] text-[#332200] font-label-sm text-label-sm font-extrabold flex items-center gap-1 shadow-sm">
                        <span className="material-symbols-outlined text-[13px] leading-none">star
                        </span>5.12★{' '}
                      </span>
                      <h3 className="font-headline-sm text-headline-sm text-on-surface truncate">Calamity Fortune
                      </h3>
                      <span className="text-on-surface-variant font-body-sm text-body-sm">by LeaF
                      </span>
                    </div>
                    <p className="font-body-sm text-body-sm text-primary-fixed-dim leading-snug line-clamp-1 mb-2">{' '}Dense 7K chordstreams at 174 BPM directly addresses your 6.6% accuracy degradation.{' '}
                    </p>
                    <div className="flex flex-wrap items-center gap-space-sm text-on-surface-variant font-label-sm text-label-sm">
                      <div className="flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px]">speed
                        </span>
                        <span>174 BPM
                        </span>
                      </div>
                      <span className="text-outline-variant">•
                      </span>
                      <div className="flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px]">timer
                        </span>
                        <span>2:18
                        </span>
                      </div>
                      <span className="text-outline-variant">•
                      </span>
                      <div className="flex items-center gap-1">
                        <span className="px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant text-[10px]">chordjack
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant text-[10px]">stamina
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant text-[10px]">7K
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between xl:justify-end gap-space-sm w-full xl:w-auto pt-2 xl:pt-0 border-t border-surface-container-highest/30 xl:border-none">
                  <div className="flex items-center gap-0.5 text-[#FFCC22] px-2 py-1 bg-surface-container rounded-full">
                    <button className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }} type="button">star
                    </button>
                    <button className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }} type="button">star
                    </button>
                    <button className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }} type="button">star
                    </button>
                    <button className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }} type="button">star
                    </button>
                    <button className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }} type="button">star
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5 relative">
                    <button className="w-9 h-9 rounded-full bg-surface-container hover:bg-primary-container hover:text-on-primary-container text-on-surface flex items-center justify-center transition-all shadow-sm" type="button">
                      <span className="material-symbols-outlined text-[18px]">play_arrow
                      </span>
                    </button>
                    <button className="w-9 h-9 rounded-full bg-surface-container hover:bg-tertiary-container hover:text-on-tertiary-container text-on-surface flex items-center justify-center transition-all shadow-sm" type="button">
                      <span className="material-symbols-outlined text-[18px]">download
                      </span>
                    </button>
                    {/* Save button with visible persistent tooltip pill */}
                    <div className="relative group/save">
                      <button className="w-9 h-9 rounded-full bg-surface-container text-on-surface-variant flex items-center justify-center transition-all shadow-sm" type="button">
                        <span className="material-symbols-outlined text-[18px]">lock
                        </span>
                      </button>
                      <div className="absolute right-0 bottom-full mb-2 whitespace-nowrap bg-surface-container-highest text-on-surface px-2.5 py-1 rounded-DEFAULT text-body-sm font-label-sm shadow-xl flex items-center gap-1.5 z-20">
                        <span className="material-symbols-outlined text-secondary text-[14px]">info
                        </span>
                        <span>Create a free account to save maps
                        </span>
                        <button aria-label="Skip map" className="w-9 h-9 rounded-full bg-surface-container hover:bg-surface-container-high hover:text-error text-on-surface-variant flex items-center justify-center transition-all shadow-sm" title="Skip map" type="button">
                          <span className="material-symbols-outlined text-[18px]">close
                          </span>
                        </button>
                      </div>
                    </div>
                    <button aria-label="Skip map" className="w-9 h-9 rounded-full bg-surface-container hover:bg-surface-container-high hover:text-error text-on-surface-variant flex items-center justify-center transition-all shadow-sm" title="Skip map" type="button">
                      <span className="material-symbols-outlined text-[18px]">close
                      </span>
                    </button>
                  </div>
                </div>
              </article>
              {/* Map 3 */}
              <article className="group relative flex flex-col xl:flex-row items-start xl:items-center justify-between p-space-md bg-surface-container-low hover:bg-surface-container transition-all duration-200 rounded-lg shadow-sm gap-space-md">
                <div className="flex items-center gap-space-md flex-1 min-w-0 w-full">
                  <div className="relative flex-shrink-0">
                    <div className="w-14 h-14 rounded-full overflow-hidden p-0.5 bg-gradient-to-tr from-primary to-secondary">
                      <img className="w-full h-full object-cover rounded-full group-hover:scale-105 transition-transform duration-300" data-alt="High altitude azure sky above snow peaked anime mountains with celestial light beams and soft starlight particles" src="https://lh3.googleusercontent.com/aida-public/AB6AXuA83rPtgcXL0r0XhK9MpCPoVl9ywcCXzckBTEGVB-lCEJyH57EukWp-ao8qilLant-VS_tGNfDQUc9DuezjGflNGURnifW3qsfwpgQ69WIICjjeUc5saQy-nhjEyQVKFc6L989ywF5uwy4rV1Tjfhok1eln65h9UWKhSwzstlLRmiPNnu4Tkegp3c1BjbYIoWYYOONzpIAU1F-1b7P4xt9fLbOiRINz0KbLKwkSxGzbxKY9bNZ1ILFM" />
                    </div>
                    <div className="absolute -bottom-1 -right-1 px-1.5 py-0.5 bg-surface-container-lowest text-primary rounded-full font-label-sm text-[9px] font-bold">{' '}7K{' '}
                    </div>
                  </div>
                  <div className="flex flex-col min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-space-xs mb-0.5">
                      <span className="px-2 py-0.5 rounded-full bg-[#FFCC22] text-[#332200] font-label-sm text-label-sm font-extrabold flex items-center gap-1 shadow-sm">
                        <span className="material-symbols-outlined text-[13px] leading-none">star
                        </span>4.86★{' '}
                      </span>
                      <h3 className="font-headline-sm text-headline-sm text-on-surface truncate">Blue Zenith
                      </h3>
                      <span className="text-on-surface-variant font-body-sm text-body-sm">by xi
                      </span>
                    </div>
                    <p className="font-body-sm text-body-sm text-primary-fixed-dim leading-snug line-clamp-1 mb-2">{' '}Pushes stamina and tempo at 200 BPM while hovering safely in your high-consistency boundary.{' '}
                    </p>
                    <div className="flex flex-wrap items-center gap-space-sm text-on-surface-variant font-label-sm text-label-sm">
                      <div className="flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px]">speed
                        </span>
                        <span>200 BPM
                        </span>
                      </div>
                      <span className="text-outline-variant">•
                      </span>
                      <div className="flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px]">timer
                        </span>
                        <span>4:12
                        </span>
                      </div>
                      <span className="text-outline-variant">•
                      </span>
                      <div className="flex items-center gap-1">
                        <span className="px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant text-[10px]">stream
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant text-[10px]">speed
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant text-[10px]">stamina
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between xl:justify-end gap-space-sm w-full xl:w-auto pt-2 xl:pt-0 border-t border-surface-container-highest/30 xl:border-none">
                  <div className="flex items-center gap-0.5 text-[#FFCC22] px-2 py-1 bg-surface-container rounded-full">
                    <button className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }} type="button">star
                    </button>
                    <button className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }} type="button">star
                    </button>
                    <button className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }} type="button">star
                    </button>
                    <button className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }} type="button">star
                    </button>
                    <button className="material-symbols-outlined text-[16px] text-outline-variant" type="button">star
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button className="w-9 h-9 rounded-full bg-surface-container hover:bg-primary-container hover:text-on-primary-container text-on-surface flex items-center justify-center transition-all shadow-sm" type="button">
                      <span className="material-symbols-outlined text-[18px]">play_arrow
                      </span>
                    </button>
                    <button className="w-9 h-9 rounded-full bg-surface-container hover:bg-tertiary-container hover:text-on-tertiary-container text-on-surface flex items-center justify-center transition-all shadow-sm" type="button">
                      <span className="material-symbols-outlined text-[18px]">download
                      </span>
                    </button>
                    <button className="w-9 h-9 rounded-full bg-surface-container hover:bg-secondary hover:text-on-secondary text-on-surface flex items-center justify-center transition-all shadow-sm" type="button">
                      <span className="material-symbols-outlined text-[18px]">bookmark_add
                      </span>
                    </button>
                    <button aria-label="Skip map" className="w-9 h-9 rounded-full bg-surface-container hover:bg-surface-container-high hover:text-error text-on-surface-variant flex items-center justify-center transition-all shadow-sm" title="Skip map" type="button">
                      <span className="material-symbols-outlined text-[18px]">close
                      </span>
                    </button>
                  </div>
                </div>
              </article>
              {/* Map 4 */}
              <article className="group relative flex flex-col xl:flex-row items-start xl:items-center justify-between p-space-md bg-surface-container-low hover:bg-surface-container transition-all duration-200 rounded-lg shadow-sm gap-space-md">
                <div className="flex items-center gap-space-md flex-1 min-w-0 w-full">
                  <div className="relative flex-shrink-0">
                    <div className="w-14 h-14 rounded-full overflow-hidden p-0.5 bg-gradient-to-tr from-primary to-secondary">
                      <img className="w-full h-full object-cover rounded-full group-hover:scale-105 transition-transform duration-300" data-alt="Stairway of white light ascending toward an ethereal cathedral floating among violet nebulas and geometric glyphs" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBO5qVUsCrKmGSohHhDaBc_qzTSWreFtj_pugKl2yxICA2x8jgmYdMP2xSqS0U8sYT_FAXlgHj4n6_Ywb8CdUJmarze8bLsnf_5mRxg2qslTUPurnpRTZrqoZ0J9iP7WABIBUZOPKfjdbRnzozG-n-QGUg61ojrE0ti4PNw4gWP7M1iBRREuo1AOfabHxK5N9hTjKKnHkf4j6JFzY9qlUy0Rc13HPF5ku_2dL4_4sZP_pJj0aLE8X3w" />
                    </div>
                    <div className="absolute -bottom-1 -right-1 px-1.5 py-0.5 bg-surface-container-lowest text-primary rounded-full font-label-sm text-[9px] font-bold">{' '}7K{' '}
                    </div>
                  </div>
                  <div className="flex flex-col min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-space-xs mb-0.5">
                      <span className="px-2 py-0.5 rounded-full bg-[#FFCC22] text-[#332200] font-label-sm text-label-sm font-extrabold flex items-center gap-1 shadow-sm">
                        <span className="material-symbols-outlined text-[13px] leading-none">star
                        </span>5.21★{' '}
                      </span>
                      <h3 className="font-headline-sm text-headline-sm text-on-surface truncate">Ascension to Heaven
                      </h3>
                      <span className="text-on-surface-variant font-body-sm text-body-sm">by xi
                      </span>
                    </div>
                    <p className="font-body-sm text-body-sm text-primary-fixed-dim leading-snug line-clamp-1 mb-2">{' '}Progressive key density ladder that trains release timing during 7K long note hold-and-tap transitions.{' '}
                    </p>
                    <div className="flex flex-wrap items-center gap-space-sm text-on-surface-variant font-label-sm text-label-sm">
                      <div className="flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px]">speed
                        </span>
                        <span>190 BPM
                        </span>
                      </div>
                      <span className="text-outline-variant">•
                      </span>
                      <div className="flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px]">timer
                        </span>
                        <span>3:05
                        </span>
                      </div>
                      <span className="text-outline-variant">•
                      </span>
                      <div className="flex items-center gap-1">
                        <span className="px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant text-[10px]">jumpstream
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant text-[10px]">LN
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant text-[10px]">technical
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between xl:justify-end gap-space-sm w-full xl:w-auto pt-2 xl:pt-0 border-t border-surface-container-highest/30 xl:border-none">
                  <div className="flex items-center gap-0.5 text-[#FFCC22] px-2 py-1 bg-surface-container rounded-full">
                    <button className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }} type="button">star
                    </button>
                    <button className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }} type="button">star
                    </button>
                    <button className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }} type="button">star
                    </button>
                    <button className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }} type="button">star
                    </button>
                    <button className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }} type="button">star
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button className="w-9 h-9 rounded-full bg-surface-container hover:bg-primary-container hover:text-on-primary-container text-on-surface flex items-center justify-center transition-all shadow-sm" type="button">
                      <span className="material-symbols-outlined text-[18px]">play_arrow
                      </span>
                    </button>
                    <button className="w-9 h-9 rounded-full bg-surface-container hover:bg-tertiary-container hover:text-on-tertiary-container text-on-surface flex items-center justify-center transition-all shadow-sm" type="button">
                      <span className="material-symbols-outlined text-[18px]">download
                      </span>
                    </button>
                    <button className="w-9 h-9 rounded-full bg-surface-container hover:bg-secondary hover:text-on-secondary text-on-surface flex items-center justify-center transition-all shadow-sm" type="button">
                      <span className="material-symbols-outlined text-[18px]">bookmark_add
                      </span>
                    </button>
                    <button aria-label="Skip map" className="w-9 h-9 rounded-full bg-surface-container hover:bg-surface-container-high hover:text-error text-on-surface-variant flex items-center justify-center transition-all shadow-sm" title="Skip map" type="button">
                      <span className="material-symbols-outlined text-[18px]">close
                      </span>
                    </button>
                  </div>
                </div>
              </article>
              {/* Map 5 */}
              <article className="group relative flex flex-col xl:flex-row items-start xl:items-center justify-between p-space-md bg-surface-container-low hover:bg-surface-container transition-all duration-200 rounded-lg shadow-sm gap-space-md">
                <div className="flex items-center gap-space-md flex-1 min-w-0 w-full">
                  <div className="relative flex-shrink-0">
                    <div className="w-14 h-14 rounded-full overflow-hidden p-0.5 bg-gradient-to-tr from-primary to-secondary">
                      <img className="w-full h-full object-cover rounded-full group-hover:scale-105 transition-transform duration-300" data-alt="Intense neon explosion with high velocity speedlines, cyberpunk mecha weapon discharge and magenta sparks" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAwUOddjesfENci5GpujjWrzNWd-5Vg_vMTiUDkSglyWMX3C53bLiPl99nMRomq-nE_e9g__auF51XOugjzupbmPq98yVpVikIaAjl9hl-tQDCi4yUfMCDD77Z5xAqL-CleyxFZ_xy9HO92jyViNeUj9npXwoJ1bWpIEdyrWyffwOeoxxC5A56XahXBAL1UH0sQDnUqR1fzVDKaA_QjM63HqrMnHEEu2_UbT0pYDk3KHRgcpH2aUEco" />
                    </div>
                    <div className="absolute -bottom-1 -right-1 px-1.5 py-0.5 bg-surface-container-lowest text-primary rounded-full font-label-sm text-[9px] font-bold">{' '}7K{' '}
                    </div>
                  </div>
                  <div className="flex flex-col min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-space-xs mb-0.5">
                      <span className="px-2 py-0.5 rounded-full bg-[#FFCC22] text-[#332200] font-label-sm text-label-sm font-extrabold flex items-center gap-1 shadow-sm">
                        <span className="material-symbols-outlined text-[13px] leading-none">star
                        </span>5.38★{' '}
                      </span>
                      <h3 className="font-headline-sm text-headline-sm text-on-surface truncate">Blastix Riotz
                      </h3>
                      <span className="text-on-surface-variant font-body-sm text-body-sm">by Camellia
                      </span>
                    </div>
                    <p className="font-body-sm text-body-sm text-primary-fixed-dim leading-snug line-clamp-1 mb-2">{' '}High velocity chord bursts slightly above your current comfort tempo to stretch recovery reflexes.{' '}
                    </p>
                    <div className="flex flex-wrap items-center gap-space-sm text-on-surface-variant font-label-sm text-label-sm">
                      <div className="flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px]">speed
                        </span>
                        <span>210 BPM
                        </span>
                      </div>
                      <span className="text-outline-variant">•
                      </span>
                      <div className="flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px]">timer
                        </span>
                        <span>2:15
                        </span>
                      </div>
                      <span className="text-outline-variant">•
                      </span>
                      <div className="flex items-center gap-1">
                        <span className="px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant text-[10px]">jumpstream
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant text-[10px]">chordjack
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant text-[10px]">speed
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between xl:justify-end gap-space-sm w-full xl:w-auto pt-2 xl:pt-0 border-t border-surface-container-highest/30 xl:border-none">
                  <div className="flex items-center gap-0.5 text-[#FFCC22] px-2 py-1 bg-surface-container rounded-full">
                    <button className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }} type="button">star
                    </button>
                    <button className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }} type="button">star
                    </button>
                    <button className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }} type="button">star
                    </button>
                    <button className="material-symbols-outlined text-[16px] text-outline-variant" type="button">star
                    </button>
                    <button className="material-symbols-outlined text-[16px] text-outline-variant" type="button">star
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button className="w-9 h-9 rounded-full bg-surface-container hover:bg-primary-container hover:text-on-primary-container text-on-surface flex items-center justify-center transition-all shadow-sm" type="button">
                      <span className="material-symbols-outlined text-[18px]">play_arrow
                      </span>
                    </button>
                    <button className="w-9 h-9 rounded-full bg-surface-container hover:bg-tertiary-container hover:text-on-tertiary-container text-on-surface flex items-center justify-center transition-all shadow-sm" type="button">
                      <span className="material-symbols-outlined text-[18px]">download
                      </span>
                    </button>
                    <button className="w-9 h-9 rounded-full bg-surface-container hover:bg-secondary hover:text-on-secondary text-on-surface flex items-center justify-center transition-all shadow-sm" type="button">
                      <span className="material-symbols-outlined text-[18px]">bookmark_add
                      </span>
                    </button>
                    <button aria-label="Skip map" className="w-9 h-9 rounded-full bg-surface-container hover:bg-surface-container-high hover:text-error text-on-surface-variant flex items-center justify-center transition-all shadow-sm" title="Skip map" type="button">
                      <span className="material-symbols-outlined text-[18px]">close
                      </span>
                    </button>
                  </div>
                </div>
              </article>
              {/* Map 6 */}
              <article className="group relative flex flex-col xl:flex-row items-start xl:items-center justify-between p-space-md bg-surface-container-low hover:bg-surface-container transition-all duration-200 rounded-lg shadow-sm gap-space-md">
                <div className="flex items-center gap-space-md flex-1 min-w-0 w-full">
                  <div className="relative flex-shrink-0">
                    <div className="w-14 h-14 rounded-full overflow-hidden p-0.5 bg-gradient-to-tr from-primary to-secondary">
                      <img className="w-full h-full object-cover rounded-full group-hover:scale-105 transition-transform duration-300" data-alt="Surreal reflection of an anime shadow figure splitting across fractured dark glass in deep purple hues" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCU-Zjy_sJbzoDlrcA2UqYtX-4cFhSPSn03qdtfm-jdDLHsKIUZwnf0UkSwuvvolCogybmRwDkGZLEU0eH3cewGN_DxHD1IYpwN7wCF-G7-Y81SX7L2CXCf0o_dROJkJpImUj_zohrjiKsy6BuCgJu_jfe7kXjSv7eANijmE7R2cN4kixGRllKfmmFZR_DqYGsk_B9LComzgVccn88qcrt-uxikfO_OvPphLW5xJ7xPDCjzOizNK26V" />
                    </div>
                    <div className="absolute -bottom-1 -right-1 px-1.5 py-0.5 bg-surface-container-lowest text-primary rounded-full font-label-sm text-[9px] font-bold">{' '}7K{' '}
                    </div>
                  </div>
                  <div className="flex flex-col min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-space-xs mb-0.5">
                      <span className="px-2 py-0.5 rounded-full bg-[#FFCC22] text-[#332200] font-label-sm text-label-sm font-extrabold flex items-center gap-1 shadow-sm">
                        <span className="material-symbols-outlined text-[13px] leading-none">star
                        </span>5.14★{' '}
                      </span>
                      <h3 className="font-headline-sm text-headline-sm text-on-surface truncate">Doppelganger
                      </h3>
                      <span className="text-on-surface-variant font-body-sm text-body-sm">by LeaF
                      </span>
                    </div>
                    <p className="font-body-sm text-body-sm text-primary-fixed-dim leading-snug line-clamp-1 mb-2">{' '}Rhythmic complexity test calibrated to your 91.2% threshold with syncopated 7K chord streams.{' '}
                    </p>
                    <div className="flex flex-wrap items-center gap-space-sm text-on-surface-variant font-label-sm text-label-sm">
                      <div className="flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px]">speed
                        </span>
                        <span>178 BPM
                        </span>
                      </div>
                      <span className="text-outline-variant">•
                      </span>
                      <div className="flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px]">timer
                        </span>
                        <span>2:32
                        </span>
                      </div>
                      <span className="text-outline-variant">•
                      </span>
                      <div className="flex items-center gap-1">
                        <span className="px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant text-[10px]">chordjack
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant text-[10px]">technical
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between xl:justify-end gap-space-sm w-full xl:w-auto pt-2 xl:pt-0 border-t border-surface-container-highest/30 xl:border-none">
                  <div className="flex items-center gap-0.5 text-[#FFCC22] px-2 py-1 bg-surface-container rounded-full">
                    <button className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }} type="button">star
                    </button>
                    <button className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }} type="button">star
                    </button>
                    <button className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }} type="button">star
                    </button>
                    <button className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }} type="button">star
                    </button>
                    <button className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }} type="button">star
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button className="w-9 h-9 rounded-full bg-surface-container hover:bg-primary-container hover:text-on-primary-container text-on-surface flex items-center justify-center transition-all shadow-sm" type="button">
                      <span className="material-symbols-outlined text-[18px]">play_arrow
                      </span>
                    </button>
                    <button className="w-9 h-9 rounded-full bg-surface-container hover:bg-tertiary-container hover:text-on-tertiary-container text-on-surface flex items-center justify-center transition-all shadow-sm" type="button">
                      <span className="material-symbols-outlined text-[18px]">download
                      </span>
                    </button>
                    <button className="w-9 h-9 rounded-full bg-surface-container hover:bg-secondary hover:text-on-secondary text-on-surface flex items-center justify-center transition-all shadow-sm" type="button">
                      <span className="material-symbols-outlined text-[18px]">bookmark_add
                      </span>
                    </button>
                    <button aria-label="Skip map" className="w-9 h-9 rounded-full bg-surface-container hover:bg-surface-container-high hover:text-error text-on-surface-variant flex items-center justify-center transition-all shadow-sm" title="Skip map" type="button">
                      <span className="material-symbols-outlined text-[18px]">close
                      </span>
                    </button>
                  </div>
                </div>
              </article>
              {/* Pagination / Load Bar Footer */}
              <div className="flex flex-col gap-space-md mt-1">
                <div className="flex flex-col gap-space-md opacity-60 pointer-events-none">
                  <div className="flex items-center justify-between p-space-md bg-surface-container-low/60 rounded-lg border-surface-container-highest/30 animate-pulse gap-space-md">
                    <div className="flex items-center gap-space-md flex-1">
                      <div className="w-14 h-14 rounded-full bg-surface-container-highest flex-shrink-0">
                      </div>
                      <div className="flex flex-col gap-2 flex-1 max-w-md">
                        <div className="flex items-center gap-2">
                          <div className="w-12 h-5 bg-surface-container-highest rounded-full">
                          </div>
                          <div className="w-44 h-5 bg-surface-container-highest rounded">
                          </div>
                        </div>
                        <div className="w-full h-3.5 bg-surface-container-high rounded">
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-3 bg-surface-container-high rounded">
                          </div>
                          <div className="w-12 h-3 bg-surface-container-high rounded">
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-7 bg-surface-container-highest rounded-full hidden xl:block">
                      </div>
                      <div className="w-9 h-9 rounded-full bg-surface-container-highest">
                      </div>
                      <div className="w-9 h-9 rounded-full bg-surface-container-highest">
                      </div>
                      <div className="w-9 h-9 rounded-full bg-surface-container-highest">
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-space-md bg-surface-container-low/40 rounded-lg border-surface-container-highest/30 animate-pulse gap-space-md">
                    <div className="flex items-center gap-space-md flex-1">
                      <div className="w-14 h-14 rounded-full bg-surface-container-highest/80 flex-shrink-0">
                      </div>
                      <div className="flex flex-col gap-2 flex-1 max-w-sm">
                        <div className="flex items-center gap-2">
                          <div className="w-12 h-5 bg-surface-container-highest/80 rounded-full">
                          </div>
                          <div className="w-36 h-5 bg-surface-container-highest/80 rounded">
                          </div>
                        </div>
                        <div className="w-3/4 h-3.5 bg-surface-container-high/80 rounded">
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-3 bg-surface-container-high/80 rounded">
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-9 h-9 rounded-full bg-surface-container-highest/80">
                      </div>
                      <div className="w-9 h-9 rounded-full bg-surface-container-highest/80">
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-space-md bg-surface-container-low/20 rounded-lg border-surface-container-highest/30 animate-pulse gap-space-md">
                    <div className="flex items-center gap-space-md flex-1">
                      <div className="w-14 h-14 rounded-full bg-surface-container-highest/50 flex-shrink-0">
                      </div>
                      <div className="flex flex-col gap-2 flex-1 max-w-xs">
                        <div className="flex items-center gap-2">
                          <div className="w-12 h-5 bg-surface-container-highest/50 rounded-full">
                          </div>
                          <div className="w-28 h-5 bg-surface-container-highest/50 rounded">
                          </div>
                        </div>
                        <div className="w-1/2 h-3.5 bg-surface-container-high/50 rounded">
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-9 h-9 rounded-full bg-surface-container-highest/50">
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-center gap-space-sm py-space-md px-space-md bg-surface-container-low rounded-lg shadow-sm border border-surface-container-highest/30 text-on-surface-variant font-label-md text-label-md">
                  <span className="material-symbols-outlined text-primary text-[20px] animate-pulse">auto_awesome
                  </span>
                  <span className="text-on-surface font-medium">Loading more maps calibrated to 5.0★ gap...
                  </span>
                  <span className="text-[11px] text-on-surface-variant">(Continuous endless stream active)
                  </span>
                </div>
              </div>
            </main>
          </div>
        </div>
    </AppShell>
  )
}

// ---------------------------------------------------------------------------
// Real variant (M3, §13): Unlimited — endless feed, ordered as it loads.
// ---------------------------------------------------------------------------

const PAGE_TAKE = 20

/**
 * The endless feed, usable standalone (via the default export's gate)
 * or embedded in the Recommendations page's Batches/Endless switch
 * (batch 5, item B). Filters/draft are lifted state owned by the
 * parent, so both views share the same mode + filters: changing
 * filters or mode restarts the feed session, as before.
 */
export function FeedReal({
  data,
  onBrowseSamples,
  filters,
  draft,
  onFiltersChange,
  onDraftChange,
}: {
  data: ProfileData
  onBrowseSamples: () => void
  filters: RecFilters
  draft: RecFilters
  onFiltersChange: (next: RecFilters) => void
  onDraftChange: (next: RecFilters) => void
}) {
  const mode = useModeStore((s) => s.mode)
  const { tier, user } = useAuth()
  const caps = useCapabilities()
  const profile = data.skillProfile
  const key = seenKey(tier, data.user.username)
  const [items, setItems] = useState<RecCandidate[]>([])
  // Batched row state (batch 11, part 5) — see RecommendationsReal.
  const rowMaps = useRowMaps({
    userId: user?.id,
    canRate: caps.canRate,
    canSave: caps.canSave,
    feedbackMode: mode,
    beatmapsetIds: items.map((c) => c.beatmapsetId),
  })
  const [totalMatched, setTotalMatched] = useState<number | null>(null)
  const [feedStats, setFeedStats] = useState({ examined: 0, produced: 0 })
  const [ended, setEnded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [restarted, setRestarted] = useState(false)
  const [downloadedTick, setDownloadedTick] = useState(0)
  const sessionRef = useRef<FeedSession | null>(null)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const loadingRef = useRef(false)

  useEffect(() => {
    seedPlayedSets(key, data)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, data.user.id, mode])

  const startSession = useCallback(
    async (
      nextFilters: RecFilters,
      seenOverride?: SeenState,
      opts: { fresh?: boolean } = {},
    ) => {
      const seen = seenOverride ?? seenStore.load(key)
      // M5 learning: the mode's own ratings re-weight this feed
      // session. Best-effort — a failed load means no boost.
      const boostFor = await loadModeBoostFor(supabase, user?.id ?? null, mode)
      const session = new FeedSession(profile, mode, nextFilters, seen, key, (k, ids) =>
        seenStore.markMany(k, 'served', ids),
      { fresh: opts.fresh, boostFor },
      )
      sessionRef.current = session
      setItems([])
      setEnded(false)
      setError(null)
      loadingRef.current = true
      setLoading(true)
      try {
        const first = await session.take(PAGE_TAKE)
        setItems(first)
        setTotalMatched(session.totalMatched)
        setFeedStats({ examined: session.examinedSets, produced: session.producedCandidates })
        setEnded(session.exhausted && session.bufferedCount === 0)
      } catch {
        setError('The feed could not load just now — osu! or the proxy may be busy.')
      } finally {
        loadingRef.current = false
        setLoading(false)
      }
    },
    [key, mode, profile, user?.id],
  )

  // New session whenever profile/mode changes (§13.2.3). On first
  // mount the shared filters are adopted as-is (they may already
  // carry the user's choices from the Batches view) — only a real
  // profile/mode change resets them to the profile defaults.
  const feedSigRef = useRef<string | null>(null)
  useEffect(() => {
    const sig = `${data.user.id}:${mode}:${profile.pp}:${profile.comfortSrMin}:${profile.comfortSrMax}`
    if (feedSigRef.current === sig) return
    const firstMount = feedSigRef.current === null
    feedSigRef.current = sig
    const start = firstMount ? filters : defaultFiltersFor(profile)
    if (!firstMount) {
      onFiltersChange(start)
      onDraftChange(start)
    }
    setRestarted(false)
    void startSession(start)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, mode])

  const loadMore = useCallback(async () => {
    const session = sessionRef.current
    if (!session || loadingRef.current || session.exhausted) return
    loadingRef.current = true
    setLoading(true)
    try {
      const more = await session.take(10)
      if (more.length > 0) setItems((prev) => [...prev, ...more])
      setTotalMatched(session.totalMatched)
      setFeedStats({ examined: session.examinedSets, produced: session.producedCandidates })
      setEnded(session.exhausted && session.bufferedCount === 0)
    } catch {
      setError('A feed refill failed — scroll again to retry.')
    } finally {
      loadingRef.current = false
      setLoading(false)
    }
  }, [])

  // Prefetch on scroll: refill when the sentinel nears the viewport.
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadMore()
      },
      { rootMargin: '600px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [loadMore, items.length])

  const handleSkip = (c: RecCandidate) => {
    seenStore.mark(key, 'skipped', c.beatmapsetId)
    setItems((prev) => prev.filter((item) => item.beatmapsetId !== c.beatmapsetId))
    // Top the feed back up from the pool (§13.2.6: skips affect the
    // next refill, never reshuffle what is on screen).
    void loadMore()
  }

  const applyFilters = () => {
    onFiltersChange(draft)
    setRestarted(true)
    void startSession(draft)
  }

  const loosenFilters = () => {
    const looser: RecFilters = {
      ...filters,
      srMin: Math.max(0, filters.srMin - 0.5),
      srMax: filters.srMax + 1,
      userTag: null,
      keyCount: null,
    }
    onFiltersChange(looser)
    onDraftChange(looser)
    setRestarted(true)
    void startSession(looser)
  }

  const startOver = () => {
    const seen = seenStore.load(key)
    void startSession(filters, { ...seen, served: [], skipped: [] }, { fresh: true })
  }

  const downloaded = seenStore.load(key).downloaded

  return (
    <div className="flex flex-col w-full">
      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-lg pb-space-lg">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-space-sm">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-surface-container text-primary font-label-sm text-label-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>Unlimited mode
            </span>
            <span className="text-on-surface-variant font-label-sm text-label-sm">• Endless feed for {MODE_LABELS[mode]}</span>
          </div>
          <h1 className="font-headline-xl text-headline-xl text-on-surface tracking-tight">Recommendations</h1>
          <p className="font-body-md text-body-md text-on-surface-variant">
            {profile.isStarter
              ? 'Starter picks — popular Ranked maps for this mode until your profile is personal.'
              : 'An endless stream ordered for you as it loads — scored from the window ahead of your scroll, never a claimed global ranking.'}
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-start mt-space-sm">
        <RecFiltersPanel
          draft={draft}
          onDraftChange={onDraftChange}
          onApply={applyFilters}
          profile={profile}
          mode={mode}
          appliedCount={null}
        />
        <main className="lg:col-span-8 xl:col-span-9 flex flex-col gap-space-md">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-space-xs py-1">
            <div className="flex items-center gap-space-sm flex-wrap">
              <h2 className="font-headline-sm text-headline-sm text-on-surface">Training your {profile.srCeiling.toFixed(1)}★ gap — Endless stream</h2>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-primary-container/20 text-primary font-label-sm text-[10px] font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
                {totalMatched !== null ? `~${totalMatched.toLocaleString('en-US')} maps match your filters` : 'Live stream • counting matches…'}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-on-surface-variant font-label-sm text-label-sm">
              <span>Sorted by:</span>
              <span className="text-primary font-medium flex items-center gap-0.5 cursor-pointer hover:underline">pp training weight
                <span className="material-symbols-outlined text-[16px]">arrow_downward</span>
              </span>
            </div>
          </div>

          {restarted && (
            <p className="font-body-sm text-body-sm text-tertiary px-space-xs">Filters changed — feed restarted.</p>
          )}
          {error && (
            <div className="p-space-md rounded-lg bg-surface-container-low flex flex-col sm:flex-row sm:items-center justify-between gap-space-md">
              <p className="font-body-sm text-body-sm text-error">{error}</p>
              <div className="flex items-center gap-space-sm flex-shrink-0">
                <button className="px-space-md py-2 rounded-full bg-primary-container text-on-primary-container font-label-md text-label-md" type="button" onClick={() => void startSession(filters, undefined, { fresh: true })}>Retry</button>
                <button className="px-space-md py-2 rounded-full bg-surface-container-high text-on-surface font-label-md text-label-md" type="button" onClick={onBrowseSamples}>Browse sample picks</button>
              </div>
            </div>
          )}

          {items.map((c) => (
            <BeatmapRow
              key={c.beatmapsetId}
              candidate={c}
              mode={mode}
              seenKeyValue={key}
              downloaded={downloaded.includes(c.beatmapsetId)}
              onDownloaded={() => setDownloadedTick((n) => n + 1)}
              onSkip={() => handleSkip(c)}
              feedback={rowMaps.feedbackById.get(c.beatmapId) ?? null}
              containing={rowMaps.containingBySet.get(c.beatmapsetId) ?? []}
              onFeedbackChange={rowMaps.onFeedbackChange}
              onContainingChange={(ids) => rowMaps.onContainingChange(c.beatmapsetId, ids)}
            />
          ))}
          <span className="hidden">{downloadedTick}</span>

          {loading && (
            <>
              {[0, 1, 2].map((i) => (
                <div key={i} className="rounded-lg bg-surface-container-low p-space-md animate-pulse" aria-hidden="true">
                  <div className="flex items-center gap-space-md">
                    <div className="w-14 h-14 rounded-full bg-surface-container-highest"></div>
                    <div className="flex flex-col gap-2 flex-1">
                      <div className="h-4 w-1/2 rounded bg-surface-container-highest"></div>
                      <div className="h-3 w-1/3 rounded bg-surface-container-highest"></div>
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}

          <div ref={sentinelRef} className="h-2"></div>

          {ended && !loading && (
            <div className="p-space-lg rounded-lg bg-surface-container-low flex flex-col items-center gap-space-md text-center">
              <span className="material-symbols-outlined text-primary text-[28px]">flag</span>
              <p className="font-headline-sm text-headline-sm text-on-surface">That's everything matching these filters</p>
              <p className="font-body-sm text-body-sm text-on-surface-variant max-w-md">
                {items.length === 0
                  ? feedStats.examined === 0
                    ? 'osu! search returned no beatmapsets for this SR/BPM window at all — the pool was empty upstream, not filtered out here. Retry, or loosen the SR range.'
                    : feedStats.produced === 0
                      ? `${feedStats.examined} ${feedStats.examined === 1 ? 'set' : 'sets'} came back from osu! search, but none survived the SR/BPM/length/status/key-count filters. Loosen the filters for more maps.`
                      : 'The maps that matched were all already served, downloaded, or skipped. Start over to see seen maps again, or loosen the filters for fresh ones.'
                  : 'The endless feed is honest: the pool ran out. Loosen the filters for more maps, or start over and see the ones you skipped again.'}
              </p>
              <div className="flex items-center gap-space-sm">
                <button className="px-space-md py-2.5 rounded-full bg-primary-container text-on-primary-container font-label-md text-label-md" type="button" onClick={loosenFilters}>Loosen filters</button>
                <button className="px-space-md py-2.5 rounded-full bg-surface-container-high text-on-surface font-label-md text-label-md" type="button" onClick={startOver}>Start over (show seen maps again)</button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

export default function RecommendationsUnlimited() {
  const mode = useModeStore((s) => s.mode)
  const { tier } = useAuth()
  const { status, data, identity } = useProfileData(mode)
  // Same "continue with demo" escape hatch as Generated mode: a failed
  // feed load still leaves the sample picks one tap away.
  const [showDemo, setShowDemo] = useState(false)
  // Standalone gate owns the filter state FeedReal needs (the
  // Recommendations page owns it itself when embedding the feed).
  const [filtersState, setFiltersState] = useState<RecFilters | null>(null)
  const [draftState, setDraftState] = useState<RecFilters | null>(null)

  if (showDemo) {
    return (
      <div>
        <div className="flex items-center gap-space-sm px-space-xl pt-space-md">
          <button
            className="px-space-md py-2 rounded-full bg-surface-container-high text-on-surface font-label-md text-label-md"
            type="button"
            onClick={() => setShowDemo(false)}
          >
            ← Back to your feed
          </button>
          <span className="font-label-sm text-label-sm text-on-surface-variant">
            Showing sample picks — your live feed is one retry away.
          </span>
        </div>
        <RecommendationsUnlimitedDemo />
      </div>
    )
  }
  if (status === 'loading') {
    return (
      <AppShell identity={{ username: identity?.username ?? 'Loading…', pp: 0, tierLabel: tier === 'account' ? 'account' : tier === 'guest' ? 'guest' : 'free tier' }}>
        <LoadingState label="Loading your profile before starting the feed…" />
      </AppShell>
    )
  }
  if ((status !== 'ready' && status !== 'empty') || !data) return <RecommendationsUnlimitedDemo />

  return (
    <AppShell
      identity={{
        username: data.user.username,
        pp: data.skillProfile.pp,
        countryCode: data.user.country_code,
        avatarUrl: `https://a.ppy.sh/${data.user.id}`,
        tierLabel: tier === 'account' ? 'account' : 'guest',
      }}
    >
      <FeedReal
        data={data}
        onBrowseSamples={() => setShowDemo(true)}
        filters={filtersState ?? defaultFiltersFor(data.skillProfile)}
        draft={draftState ?? filtersState ?? defaultFiltersFor(data.skillProfile)}
        onFiltersChange={setFiltersState}
        onDraftChange={setDraftState}
      />
    </AppShell>
  )
}
