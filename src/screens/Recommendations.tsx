// Converted from Stitch export: stitch-raw/08-recommendations.html
// M3: the exported markup below is the DEMO variant (sora_playz),
// rendered unchanged when nothing is linked. The real variant at the
// bottom runs the windowed recommendation engine (see lib/recommend.ts
// for the ranking-honesty notes) with working filters, previews and
// downloads.
import { useCallback, useEffect, useRef, useState } from 'react'
import AppShell from '../components/AppShell'
import BeatmapRow from '../components/BeatmapRow'
import LoadingState from '../components/LoadingState'
import RecFiltersPanel from '../components/RecFiltersPanel'
import { seedPlayedSets, useProfileData, type ProfileData } from '../lib/profileService'
import { useModeStore } from '../lib/modeStore'
import { MODE_LABELS } from '../lib/mode'
import {
  clearRecTag,
  defaultFiltersFor,
  emptyGenerationResume,
  emptyPoolReason,
  generateRecommendations,
  widenRecFilters,
  type GenerationDiagnostics,
  type GenerationResume,
  type RecCandidate,
  type RecFilters,
} from '../lib/recommend'
import { FeedReal } from './RecommendationsUnlimited'
import { seenKey, seenStore } from '../lib/seenStore'
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

function RecommendationsDemo() {
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
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-surface-container text-primary font-label-sm text-label-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse">
                  </span>{' '}Generated mode{' '}
                </span>
                <span className="text-on-surface-variant font-label-sm text-label-sm">• Calibrated to 5.0★ collapse gap
                </span>
              </div>
              <h1 className="font-headline-xl text-headline-xl text-on-surface tracking-tight">Recommendations
              </h1>
              <p className="font-body-md text-body-md text-on-surface-variant">{' '}Targeted algorithmic drill sets tailored to your rhythm input drift and recovery windows.{' '}
              </p>
            </div>
            {/* Mode Controller Hub */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-space-md bg-surface-container-low p-space-sm rounded-lg shadow-sm">
              {/* Unlimited Toggle Switch */}
              <div className="flex items-center gap-space-sm px-space-xs">
                <label className="relative inline-flex items-center cursor-pointer select-none">
                  <input className="sr-only peer" id="unlimited-toggle" type="checkbox" />
                  <div className="w-11 h-6 bg-surface-container-highest peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-outline-variant after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-container peer-checked:after:bg-on-primary">
                  </div>
                </label>
                <div className="flex flex-col">
                  <span className="font-label-md text-label-md text-on-surface leading-none">Unlimited beatmaps
                  </span>
                  <span className="font-body-sm text-[11px] text-on-surface-variant leading-tight">Feed streams as it loads
                  </span>
                </div>
              </div>
              <div className="w-px h-8 bg-surface-container-highest hidden sm:block">
              </div>
              {/* Segmented Pill Count Picker */}
              <div className="flex items-center bg-surface-container-high rounded-full p-0.5" id="count-picker">
                <button className="px-3 py-1 rounded-full text-on-surface-variant font-label-sm text-label-sm hover:text-on-surface transition-colors" data-count="20" type="button">20
                </button>
                <button className="px-3 py-1 rounded-full bg-primary-container text-on-primary-container font-label-sm text-label-sm shadow-sm transition-all" data-count="30" type="button">30
                </button>
                <button className="px-3 py-1 rounded-full text-on-surface-variant font-label-sm text-label-sm hover:text-on-surface transition-colors" data-count="50" type="button">50
                </button>
              </div>
              {/* Regenerate Primary CTA */}
              <button className="flex items-center gap-2 px-space-md py-2 rounded-full bg-gradient-to-r from-primary-container to-inverse-primary text-on-primary font-label-md text-label-md shadow-[0_0_16px_rgba(164,118,255,0.35)] hover:shadow-[0_0_22px_rgba(164,118,255,0.6)] active:scale-95 transition-all" id="regenerate-btn" type="button">
                <span className="material-symbols-outlined text-[18px] transition-transform duration-500" id="refresh-icon">auto_awesome
                </span>
                <span>Regenerate
                </span>
              </button>
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
                <div className="flex items-center gap-space-sm">
                  <h2 className="font-headline-sm text-headline-sm text-on-surface">Training your 5.0★ gap — 24 maps
                  </h2>
                  <span className="px-2 py-0.5 rounded-full bg-surface-container-highest text-on-surface-variant font-label-sm text-[10px]">{' '}Filtered from 30 generated{' '}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-on-surface-variant font-label-sm text-label-sm">
                  <span>Sorted by:
                  </span>
                  <span className="text-primary font-medium flex items-center gap-0.5 cursor-pointer hover:underline">{' '}pp training weight{' '}
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
                      </div>
                    </div>
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
                  </div>
                </div>
              </article>
              {/* Pagination / Load Bar Footer */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-space-md py-space-md px-space-sm bg-surface-container-low rounded-lg shadow-sm">
                <span className="font-body-sm text-body-sm text-on-surface-variant">Showing 6 of 24 filtered recommendations (set of 30)
                </span>
                <div className="flex items-center gap-2">
                  <button className="px-4 py-1.5 rounded-full bg-surface-container hover:bg-surface-container-high text-on-surface font-label-sm text-label-sm transition-colors" type="button">{' '}Previous{' '}
                  </button>
                  <span className="font-label-sm text-label-sm text-primary font-bold px-2">Page 1 of 4
                  </span>
                  <button className="px-4 py-1.5 rounded-full bg-surface-container hover:bg-surface-container-high text-on-surface font-label-sm text-label-sm transition-colors" type="button">{' '}Next{' '}
                  </button>
                </div>
              </div>
            </main>
          </div>
        </div>
    </AppShell>
  )
}

// ---------------------------------------------------------------------------
// Real variant (M3): Generated mode — fixed top-N from the windowed pool.
// ---------------------------------------------------------------------------

function RecommendationsReal({
  data,
  onBrowseSamples,
  filters,
  draft,
  onFiltersChange,
  onDraftChange,
  resumeRef,
}: {
  data: ProfileData
  onBrowseSamples: () => void
  filters: RecFilters
  draft: RecFilters
  onFiltersChange: (next: RecFilters) => void
  onDraftChange: (next: RecFilters) => void
  /** Resume state owned by the page gate, so switching to the
   * Endless view and back does not restart the Generated window. */
  resumeRef: { current: { sig: string; resume: GenerationResume } | null }
}) {
  const mode = useModeStore((s) => s.mode)
  const { tier, user } = useAuth()
  const caps = useCapabilities()
  const profile = data.skillProfile
  const key = seenKey(tier, data.user.username)
  const [count, setCount] = useState(30)
  const [items, setItems] = useState<RecCandidate[]>([])
  // Batched row state (batch 11, part 5): one feedback query for
  // the mode + one batched containment lookup for the rendered
  // sets, passed down to the rows — rows never query per row.
  const rowMaps = useRowMaps({
    userId: user?.id,
    canRate: caps.canRate,
    canSave: caps.canSave,
    feedbackMode: mode,
    beatmapsetIds: items.map((c) => c.beatmapsetId),
  })
  const [totalMatched, setTotalMatched] = useState<number | null>(null)
  const [diagnostics, setDiagnostics] = useState<GenerationDiagnostics | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [downloadedTick, setDownloadedTick] = useState(0)
  const runRef = useRef(0)

  useEffect(() => {
    seedPlayedSets(key, data)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, data.user.id, mode])

  const generate = useCallback(
    async (
      nextFilters: RecFilters,
      nextCount: number,
      opts: { fresh?: boolean; shuffle?: boolean } = {},
    ) => {
      const run = ++runRef.current
      setBusy(true)
      setError(null)
      // Resume key: mode + profile identity + the applied filters.
      // A changed key (mode/profile/filter change, Loosen/Clear)
      // restarts from page 1; a matching key continues through the
      // next search window instead of re-querying page 1 (batch 5,
      // item A). `fresh` restarts too — the engine ignores the
      // resume on a fresh run.
      const sig = `${key}:${mode}:${profile.pp}:${profile.comfortSrMin}:${profile.comfortSrMax}:${profile.srCeiling}:${profile.bpmSweetMin}:${profile.bpmSweetMax}:${(profile.playstyleTags ?? []).join(',')}:${JSON.stringify(nextFilters)}`
      if (resumeRef.current?.sig !== sig) {
        resumeRef.current = { sig, resume: emptyGenerationResume() }
      }
      try {
        const seen = seenStore.load(key)
        // M5 learning: the mode's own ratings re-weight this run.
        // Best-effort — a failed load just means no boost.
        const boostFor = await loadModeBoostFor(supabase, user?.id ?? null, mode)
        const result = await generateRecommendations(profile, mode, {
          count: nextCount,
          filters: nextFilters,
          seen,
          fresh: opts.fresh,
          resume: resumeRef.current.resume,
          boostFor,
          // Part 4: Generated mode ALWAYS shows beatmaps, even
          // already-seen ones — the seen exclusion never applies
          // here. The run still marks served below (the Endless
          // feed reads it), which is harmless now that this path
          // ignores it. `shuffle` is Renew-only.
          ignoreSeen: true,
          shuffle: opts.shuffle,
        })
        if (runRef.current !== run) return
        resumeRef.current = { sig, resume: result.nextResume }
        setItems(result.items)
        setTotalMatched(result.totalMatched)
        setDiagnostics(result.diagnostics)
        seenStore.markMany(
          key,
          'served',
          result.items.map((c) => c.beatmapsetId),
        )
      } catch {
        if (runRef.current !== run) return
        setError('The recommendation search failed just now — osu! or the proxy may be busy. Try regenerating.')
      } finally {
        if (runRef.current === run) setBusy(false)
      }
    },
    [key, mode, profile, user?.id],
  )

  // (Re)generate when the profile/mode lands or changes. The old
  // mode's rows are cleared first (item 5): showing them as if
  // current while the new mode generates would be stale data.
  // On first mount the shared filters are adopted as-is (they may
  // already carry the user's choices from the Endless feed view) —
  // only a real profile/mode change resets them to the defaults.
  const genSigRef = useRef<string | null>(null)
  useEffect(() => {
    const sig = `${data.user.id}:${mode}:${profile.pp}:${profile.comfortSrMin}:${profile.comfortSrMax}`
    if (genSigRef.current === sig) return
    const firstMount = genSigRef.current === null
    genSigRef.current = sig
    const start = firstMount ? filters : defaultFiltersFor(profile)
    if (!firstMount) {
      onFiltersChange(start)
      onDraftChange(start)
    }
    setItems([])
    setTotalMatched(null)
    void generate(start, count)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, mode])

  const downloaded = seenStore.load(key).downloaded

  return (
    <div className="flex flex-col w-full">
      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-lg pb-space-lg">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-space-sm">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-surface-container text-primary font-label-sm text-label-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>Generated mode
            </span>
            <span className="text-on-surface-variant font-label-sm text-label-sm">• Calibrated to {profile.srCeiling.toFixed(1)}★ collapse gap</span>
          </div>
          <h1 className="font-headline-xl text-headline-xl text-on-surface tracking-tight">Recommendations</h1>
          <p className="font-body-md text-body-md text-on-surface-variant">
            {profile.isStarter
              ? `Starter picks for ${MODE_LABELS[mode]} — popular Ranked maps near the starter band, not personalised yet.`
              : `Targeted algorithmic drill sets for ${data.user.username} in ${MODE_LABELS[mode]} — ordered for you from the fetched window.`}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-space-md bg-surface-container-low p-space-sm rounded-lg shadow-sm">
          <div className="flex items-center bg-surface-container-high rounded-full p-0.5" id="count-picker">
            {[20, 30, 50].map((n) => (
              <button
                key={n}
                className={count === n
                  ? 'px-3 py-1 rounded-full bg-primary-container text-on-primary-container font-label-sm text-label-sm shadow-sm transition-all'
                  : 'px-3 py-1 rounded-full text-on-surface-variant font-label-sm text-label-sm hover:text-on-surface transition-colors'}
                data-count={n}
                type="button"
                onClick={() => { setCount(n); void generate(filters, n) }}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-start mt-space-sm">
        <RecFiltersPanel
          draft={draft}
          onDraftChange={onDraftChange}
          onApply={() => { onFiltersChange(draft); void generate(draft, count) }}
          profile={profile}
          mode={mode}
          appliedCount={items.length}
        />
        <main className="lg:col-span-8 xl:col-span-9 flex flex-col gap-space-md">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-space-xs py-1">
            <div className="flex items-center gap-space-sm">
              <h2 className="font-headline-sm text-headline-sm text-on-surface">
                Training your {profile.srCeiling.toFixed(1)}★ gap — {items.length} maps
              </h2>
              {totalMatched !== null && (
                <span className="px-2 py-0.5 rounded-full bg-surface-container-highest text-on-surface-variant font-label-sm text-[10px]">~{totalMatched.toLocaleString('en-US')} sets match on osu!</span>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-on-surface-variant font-label-sm text-label-sm">
              <span>Sorted by:</span>
              <span className="text-primary font-medium flex items-center gap-0.5">pp training weight
                <span className="material-symbols-outlined text-[16px]">arrow_downward</span>
              </span>
            </div>
          </div>

          {error && (
            <div className="p-space-md rounded-lg bg-surface-container-low flex flex-col sm:flex-row sm:items-center justify-between gap-space-md">
              <p className="font-body-sm text-body-sm text-error">{error}</p>
              <div className="flex items-center gap-space-sm flex-shrink-0">
                {/* Batch 6, defect 1: no fresh — a failed run never
                    advanced the resume, so fresh only restarted the
                    same window. Plain generate() retries the window
                    the resume points at. */}
                <button className="px-space-md py-2 rounded-full bg-primary-container text-on-primary-container font-label-md text-label-md" type="button" onClick={() => void generate(filters, count)}>Retry</button>
                <button className="px-space-md py-2 rounded-full bg-surface-container-high text-on-surface font-label-md text-label-md" type="button" onClick={onBrowseSamples}>Browse sample picks</button>
              </div>
            </div>
          )}
          {busy && items.length === 0 && !error && (
            <LoadingState label="Searching osu! and scoring your window…" />
          )}
          {!busy && !error && items.length === 0 && (
            <div className="p-space-md rounded-lg bg-surface-container-low flex flex-col sm:flex-row sm:items-center justify-between gap-space-md">
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                {diagnostics
                  ? emptyPoolReason(diagnostics, filters)
                  : 'No maps in the fetched window match these filters. Loosen the SR/BPM ranges or clear the tag and apply again.'}
              </p>
              <div className="flex flex-wrap items-center gap-space-sm flex-shrink-0">
                {diagnostics && diagnostics.afterPick > 0 && diagnostics.afterFilters === 0 && (
                  <>
                    <button
                      className="px-space-md py-2 rounded-full bg-primary-container text-on-primary-container font-label-md text-label-md"
                      type="button"
                      title="Widen the SR/BPM/length ranges and generate again with the same tag"
                      onClick={() => {
                        const next = widenRecFilters(filters)
                        onFiltersChange(next)
                        onDraftChange(next)
                        void generate(next, count, { fresh: true })
                      }}
                    >
                      Loosen ranges
                    </button>
                    {filters.userTag !== null && (
                      <button
                        className="px-space-md py-2 rounded-full bg-primary-container text-on-primary-container font-label-md text-label-md"
                        type="button"
                        title="Drop the tag filter and generate again with the same ranges"
                        onClick={() => {
                          const next = clearRecTag(filters)
                          onFiltersChange(next)
                          onDraftChange(next)
                          void generate(next, count, { fresh: true })
                        }}
                      >
                        Clear tag
                      </button>
                    )}
                  </>
                )}
                {/* Batch 6, defect 1: same as the error-panel Retry —
                    no fresh, so Retry advances to the next window via
                    the resume instead of re-fetching window 1 and
                    landing on the same empty state. */}
                <button className="px-space-md py-2 rounded-full bg-primary-container text-on-primary-container font-label-md text-label-md" type="button" onClick={() => void generate(filters, count)}>Retry</button>
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
              feedback={rowMaps.feedbackById.get(c.beatmapId) ?? null}
              containing={rowMaps.containingBySet.get(c.beatmapsetId) ?? []}
              onFeedbackChange={rowMaps.onFeedbackChange}
              onContainingChange={(ids) => rowMaps.onContainingChange(c.beatmapsetId, ids)}
            />
          ))}
          {/* Part 4 + batch 7, item 3 — Renew: rendered at the bottom
              of the list whenever items were returned (NOT gated on
              windowExhausted). Every press restarts from page 1 with
              a fresh shuffle, so consecutive Renews show different
              orders/selections. Generation keeps the PP-anchored
              fixed ranking — only Renew shuffles, and the label says
              so. There is no separate Regenerate button anymore. */}
          {!error && items.length > 0 && (
            <div className="p-space-md rounded-lg bg-surface-container-low flex flex-col sm:flex-row sm:items-center justify-between gap-space-md">
              {(diagnostics?.shuffled || diagnostics?.windowExhausted) && (
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  {diagnostics.shuffled
                    ? 'Renewed picks are shuffled — order is random for this run.'
                    : "You've reached the end of this window."}
                </p>
              )}
              <button
                id="renew-btn"
                className="px-space-md py-2 rounded-full bg-primary-container text-on-primary-container font-label-md text-label-md flex-shrink-0 disabled:opacity-50"
                type="button"
                disabled={busy}
                title="Start over from the first window with a freshly shuffled set — every Renew re-randomizes"
                onClick={() => {
                  resumeRef.current = null
                  window.scrollTo({ top: 0, behavior: 'smooth' })
                  void generate(filters, count, { fresh: true, shuffle: true })
                }}
              >
                Renew recommendations
              </button>
            </div>
          )}
          <span className="hidden">{downloadedTick}</span>
        </main>
      </div>
    </div>
  )
}

export default function Recommendations() {
  const mode = useModeStore((s) => s.mode)
  const { tier } = useAuth()
  const { status, data, identity } = useProfileData(mode)
  // "Continue with demo": when generation itself fails, the user can
  // still browse the sample picks instead of staring at an error.
  const [showDemo, setShowDemo] = useState(false)
  // Batch 5, item B: the feed switch lives ON this page, not in a
  // floating toggle — "Batches" (Generated, fixed top-N per window)
  // vs "Endless feed" (FeedSession, loads more as you scroll). Both
  // views share the same mode + filters state, lifted here.
  const [view, setView] = useState<'generated' | 'endless'>('generated')
  const [filtersState, setFiltersState] = useState<RecFilters | null>(null)
  const [draftState, setDraftState] = useState<RecFilters | null>(null)
  // Generated-mode resume state (batch 5, item A), owned here so
  // switching views does not restart the window: keyed by mode +
  // profile identity + applied filters inside generate().
  const generationResumeRef = useRef<{ sig: string; resume: GenerationResume } | null>(null)

  if (showDemo) {
    return (
      <div>
        <div className="flex items-center gap-space-sm px-space-xl pt-space-md">
          <button
            className="px-space-md py-2 rounded-full bg-surface-container-high text-on-surface font-label-md text-label-md"
            type="button"
            onClick={() => setShowDemo(false)}
          >
            ← Back to your recommendations
          </button>
          <span className="font-label-sm text-label-sm text-on-surface-variant">
            Showing sample picks — your live recommendations are one retry away.
          </span>
        </div>
        <RecommendationsDemo />
      </div>
    )
  }
  if (status === 'loading') {
    return (
      <AppShell identity={{ username: identity?.username ?? 'Loading…', pp: 0, tierLabel: tier === 'account' ? 'account' : tier === 'guest' ? 'guest' : 'free tier' }}>
        <LoadingState label="Loading your profile before generating recommendations…" />
      </AppShell>
    )
  }
  if ((status !== 'ready' && status !== 'empty') || !data) return <RecommendationsDemo />

  const sharedFilters = filtersState ?? defaultFiltersFor(data.skillProfile)
  const sharedDraft = draftState ?? sharedFilters

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
      <div className="flex items-center gap-space-sm px-space-xl pt-space-md">
        <div className="flex items-center bg-surface-container-high rounded-full p-0.5" role="tablist" aria-label="Recommendation view">
          <button
            role="tab"
            aria-selected={view === 'generated'}
            className={view === 'generated'
              ? 'px-3 py-1 rounded-full bg-primary-container text-on-primary-container font-label-sm text-label-sm shadow-sm transition-all'
              : 'px-3 py-1 rounded-full text-on-surface-variant font-label-sm text-label-sm hover:text-on-surface transition-colors'}
            type="button"
            onClick={() => setView('generated')}
          >
            Batches
          </button>
          <button
            role="tab"
            aria-selected={view === 'endless'}
            className={view === 'endless'
              ? 'px-3 py-1 rounded-full bg-primary-container text-on-primary-container font-label-sm text-label-sm shadow-sm transition-all'
              : 'px-3 py-1 rounded-full text-on-surface-variant font-label-sm text-label-sm hover:text-on-surface transition-colors'}
            type="button"
            onClick={() => setView('endless')}
          >
            Endless feed
          </button>
        </div>
        <span className="font-label-sm text-label-sm text-on-surface-variant">
          {view === 'generated'
            ? 'A fixed batch from each search window — Generate again for the next window.'
            : 'Loads more as you scroll — ordered for you as it loads.'}
        </span>
      </div>
      {view === 'generated' ? (
        <RecommendationsReal
          data={data}
          onBrowseSamples={() => setShowDemo(true)}
          filters={sharedFilters}
          draft={sharedDraft}
          onFiltersChange={setFiltersState}
          onDraftChange={setDraftState}
          resumeRef={generationResumeRef}
        />
      ) : (
        <FeedReal
          data={data}
          onBrowseSamples={() => setShowDemo(true)}
          filters={sharedFilters}
          draft={sharedDraft}
          onFiltersChange={setFiltersState}
          onDraftChange={setDraftState}
        />
      )}
    </AppShell>
  )
}
