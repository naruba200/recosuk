// Converted from Stitch export: stitch-raw/05-welcome-recs.html
// M4: the exported markup below is the DEMO variant (sora_playz). The
// real variant at the bottom shows the actual first recommendation set
// generated during onboarding (§5.5) — previews and downloads work,
// gated buttons teach the account lock, and the Skip button at the
// bottom finishes onboarding for good.
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppShell from '../components/AppShell'
import BeatmapRow from '../components/BeatmapRow'
import {
  getWelcomeRecs,
  seedPlayedSets,
  useProfileData,
  type ProfileData,
} from '../lib/profileService'
import { useModeStore } from '../lib/modeStore'
import { MODE_LABELS } from '../lib/mode'
import { defaultFiltersFor, generateRecommendations, type RecCandidate } from '../lib/recommend'
import { seenKey, seenStore } from '../lib/seenStore'
import { useAuth } from '../lib/auth'

// Identity shown by the demo fallback variant: sample data, not a real player.
const DEMO_IDENTITY = {
  username: 'sora_playz',
  pp: 5284,
  countryCode: 'VN',
  tierLabel: 'free tier',
}

function WelcomeRecsDemo() {
  return (
    <AppShell identity={DEMO_IDENTITY}>
        <div className="flex flex-col w-full max-w-7xl mx-auto gap-space-lg select-none pb-12">
          {/* Slim Banner: Panel Plum Orientation */}
          <div className="relative overflow-hidden rounded-DEFAULT bg-surface-container-low px-space-md py-3 shadow-md flex items-center justify-between gap-space-md">
            <div className="absolute -right-8 -top-8 w-32 h-32 bg-primary/10 rounded-full blur-2xl pointer-events-none">
            </div>
            <div className="flex items-center gap-space-sm min-w-0">
              <div className="w-8 h-8 rounded-full bg-surface-container-high flex items-center justify-center flex-shrink-0 shadow-inner">
                <span className="material-symbols-outlined text-primary text-[18px]">auto_awesome
                </span>
              </div>
              <p className="font-body-md text-body-md text-on-surface truncate">{' '}This is how Recommendations works. Preview a map, try a download — when you're ready, head to your dashboard.{' '}
              </p>
            </div>
            <div className="flex items-center gap-space-sm flex-shrink-0">
              <span className="px-2.5 py-1 rounded-full bg-primary-container/20 text-primary font-label-sm text-label-sm uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping">
                </span>{' '}Interactive demo{' '}
              </span>
            </div>
          </div>
          {/* Header Section with Tactical Typography */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-space-md pt-2">
            <div className="flex flex-col gap-1 max-w-3xl">
              <div className="flex items-center gap-2 text-primary font-label-sm text-label-sm uppercase tracking-widest">
                <span>Curated for sora_playz
                </span>
                <span>•
                </span>
                <span className="text-tertiary">osu!mania 7K
                </span>
              </div>
              <h1 className="font-headline-xl text-headline-xl text-on-surface tracking-tight">{' '}Picked to train your 5.0★ gap{' '}
              </h1>
              <p className="font-body-lg text-body-lg text-on-surface-variant leading-relaxed">{' '}Based on your 12,430 top plays — recommendations focus on 170–190 BPM and 7K key density to push past your 91.2% threshold.{' '}
              </p>
            </div>
            {/* Mini Accuracy Target Radar Badge */}
            <div className="flex items-center gap-space-md px-space-md py-space-sm rounded-DEFAULT bg-surface-container-low shadow-sm flex-shrink-0">
              <div className="relative w-12 h-12 flex items-center justify-center">
                <svg className="w-12 h-12 -rotate-90" viewBox="0 0 48 48">
                  <circle className="text-surface-container-highest" cx="24" cy="24" fill="none" r="20" stroke="currentColor" strokeWidth="4">
                  </circle>
                  <circle className="text-[#7EE787]" cx="24" cy="24" fill="none" r="20" stroke="currentColor" strokeDasharray="125.6" strokeDashoffset="11.05" strokeLinecap="round" strokeWidth="4">
                  </circle>
                </svg>
                <span className="absolute font-headline-sm text-[11px] text-on-surface font-bold">91.2%
                </span>
              </div>
              <div className="flex flex-col">
                <span className="font-label-sm text-label-sm text-on-surface-variant">Target accuracy
                </span>
                <span className="font-headline-sm text-headline-sm text-[#7EE787] flex items-center gap-1">{' '}96.50%{' '}
                  <span className="material-symbols-outlined text-[16px]">trending_up
                  </span>
                </span>
              </div>
            </div>
          </div>
          {/* Rhythm Track Slider Feed */}
          <div className="flex flex-col gap-space-md mt-2" id="beatmap-list">
            {/* ROW 1: Camellia - Exit This Earth's Atomosphere (Active Playing State) */}
            <div className="group relative rounded-full bg-surface-container-low p-2 pr-space-lg transition-all duration-300 hover:bg-surface-container shadow-sm hover:shadow-[0_8px_28px_rgba(164,118,255,0.18)]">
              {/* Glow ambient halo for active item */}
              <div className="absolute inset-0 rounded-full bg-gradient-to-r from-primary/10 via-primary-container/5 to-transparent pointer-events-none">
              </div>
              {/* Mid-Preview Progress Bar running through slider belly */}
              <div className="absolute bottom-0 left-20 right-20 h-1 bg-surface-container-highest rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-primary to-secondary w-[42%] rounded-full shadow-[0_0_8px_rgba(210,187,255,0.8)]">
                </div>
              </div>
              <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-space-md">
                {/* Lead Circle & Beatmap Meta */}
                <div className="flex items-center gap-space-md min-w-0">
                  {/* Circular Cover Art with Active Mania Ring Border */}
                  <div className="relative flex-shrink-0">
                    <div className="w-16 h-16 rounded-full overflow-hidden p-0.5 bg-gradient-to-tr from-primary via-secondary to-primary-fixed shadow-[0_0_16px_rgba(164,118,255,0.4)]">
                      <img className="w-full h-full object-cover rounded-full" data-alt="Futuristic neon digital cover art featuring deep purple nebulas, glowing fractured crystalline geometric shapes, and deep cosmic space trails styled for rhythm game electronic single Exit This Earth's Atomosphere by Camellia with cyber aesthetic" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAh0XAKDlfre5_2kRzWbzgkbHrMEgX87731XYjJaabhB4tL8oDLwO3CdJ_N3IfETL7eFjEHvDKPFKTCRbv-yyi19YgoZDme4upvjnY_7lP3TpKy98y9TZ4sFGnd_OBYpdXbEbq2jQlYldF9RjVU3Bymm1ijpwQGOGCQ5vi1-v9c2cZLGrzB1Zz3g6yLpzg7wGRrCs52q3yw8c9V_j57M2sbesdc8aHQ3u9sZPrn5g5xWp3obBR_IZQw" />
                    </div>
                    {/* Live Audio Visualizer Equalizer Badge */}
                    <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-primary flex items-center justify-center shadow-md">
                      <div className="flex items-end gap-0.5 h-3">
                        <span className="w-0.5 bg-on-primary rounded-full animate-[bounce_0.6s_ease-in-out_infinite] h-2">
                        </span>
                        <span className="w-0.5 bg-on-primary rounded-full animate-[bounce_0.8s_ease-in-out_0.2s_infinite] h-3">
                        </span>
                        <span className="w-0.5 bg-on-primary rounded-full animate-[bounce_0.5s_ease-in-out_0.4s_infinite] h-1.5">
                        </span>
                      </div>
                    </div>
                  </div>
                  {/* Titles, Pill Badges & Recommendation Context */}
                  <div className="flex flex-col min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-headline-sm text-headline-sm text-on-surface truncate tracking-tight">{' '}Exit This Earth's Atomosphere{' '}
                      </h2>
                      <span className="text-on-surface-variant font-body-md text-body-md">by Camellia
                      </span>
                      {/* Star Rating Pill */}
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-surface-container-highest text-[#FFCC22] font-label-sm text-label-sm font-bold shadow-inner">
                        <span className="material-symbols-outlined text-[13px]" style={{ fontVariationSettings: "'FILL' 1" }}>star
                        </span>{' '}5.24★{' '}
                      </span>
                      {/* Difficulty Tag Capsules */}
                      <span className="px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant font-label-sm text-label-sm">{' '}182 BPM{' '}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant font-label-sm text-label-sm">{' '}2:44{' '}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-primary/20 text-primary font-label-sm text-label-sm font-semibold">{' '}7K Mania{' '}
                      </span>
                    </div>
                    {/* Recommendation Reason */}
                    <p className="font-body-sm text-body-sm text-primary font-medium mt-1 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary">
                      </span>{' '}Your accuracy drops above 5.0★ — this map trains that band at 182 BPM, right in your best tempo.{' '}
                    </p>
                    {/* Preview Timestamp Tracker */}
                    <div className="flex items-center gap-2 mt-0.5 text-on-surface-variant font-label-sm text-[10px]">
                      <span className="text-primary font-bold">1:08
                      </span>
                      <span>/
                      </span>
                      <span>2:44 preview active
                      </span>
                    </div>
                  </div>
                </div>
                {/* Trailing Action Suite */}
                <div className="flex items-center justify-end gap-space-sm pl-4 flex-shrink-0">
                  {/* 5-Star Empty Community Rater */}
                  <div className="hidden xl:flex items-center gap-0.5 px-3 py-1.5 rounded-full bg-surface-container-high" title="Rate beatmap difficulty">
                    <button className="text-on-surface-variant/40 hover:text-[#FFCC22] transition-colors">
                      <span className="material-symbols-outlined text-[18px]">star
                      </span>
                    </button>
                    <button className="text-on-surface-variant/40 hover:text-[#FFCC22] transition-colors">
                      <span className="material-symbols-outlined text-[18px]">star
                      </span>
                    </button>
                    <button className="text-on-surface-variant/40 hover:text-[#FFCC22] transition-colors">
                      <span className="material-symbols-outlined text-[18px]">star
                      </span>
                    </button>
                    <button className="text-on-surface-variant/40 hover:text-[#FFCC22] transition-colors">
                      <span className="material-symbols-outlined text-[18px]">star
                      </span>
                    </button>
                    <button className="text-on-surface-variant/40 hover:text-[#FFCC22] transition-colors">
                      <span className="material-symbols-outlined text-[18px]">star
                      </span>
                    </button>
                  </div>
                  {/* Ghost Circular Action: Bookmark with guest lock */}
                  <div className="relative group/tooltip">
                    <button className="w-11 h-11 rounded-full bg-surface-container-high text-on-surface-variant hover:text-on-surface hover:bg-surface-variant transition-all flex items-center justify-center relative shadow-sm">
                      <span className="material-symbols-outlined text-[20px]">bookmark_border
                      </span>
                      <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center font-bold text-[9px]">
                        <span className="material-symbols-outlined text-[10px]">lock
                        </span>
                      </span>
                    </button>
                    <span className="pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-surface-container-highest px-2 py-1 font-label-sm text-[10px] text-on-surface opacity-0 group-hover/tooltip:opacity-100 transition-opacity z-30 shadow-md">{' '}Sign in to save{' '}
                    </span>
                  </div>
                  {/* Ghost Circular Action: Download */}
                  <div className="relative group/tooltip">
                    <button className="w-11 h-11 rounded-full bg-surface-container-high text-on-surface-variant hover:text-primary hover:bg-surface-variant transition-all flex items-center justify-center shadow-sm">
                      <span className="material-symbols-outlined text-[20px]">download
                      </span>
                    </button>
                    <span className="pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-surface-container-highest px-2 py-1 font-label-sm text-[10px] text-on-surface opacity-0 group-hover/tooltip:opacity-100 transition-opacity z-30 shadow-md">{' '}Download .osz (Direct){' '}
                    </span>
                  </div>
                  {/* Primary Active Mode Target: Pause / Play Button */}
                  <button className="w-12 h-12 rounded-full bg-primary text-on-primary flex items-center justify-center shadow-[0_0_20px_rgba(164,118,255,0.6)] active:scale-95 transition-transform" title="Pause preview">
                    <span className="material-symbols-outlined text-[24px]" style={{ fontVariationSettings: "'FILL' 1" }}>pause
                    </span>
                  </button>
                </div>
              </div>
            </div>
            {/* ROW 2: xi - Blue Zenith (Idle State) */}
            <div className="group relative rounded-full bg-surface-container-low p-2 pr-space-lg transition-all duration-300 hover:bg-surface-container shadow-sm hover:shadow-[0_8px_24px_rgba(128,208,255,0.12)]">
              <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-space-md">
                {/* Lead Circle & Beatmap Meta */}
                <div className="flex items-center gap-space-md min-w-0">
                  {/* Circular Cover Art */}
                  <div className="relative flex-shrink-0">
                    <div className="w-16 h-16 rounded-full overflow-hidden p-0.5 bg-surface-container-high group-hover:bg-tertiary transition-colors shadow-sm">
                      <img className="w-full h-full object-cover rounded-full" data-alt="High quality anime illustration with glowing ethereal blue wings reaching towards a luminous azure sky and soaring geometric white clouds, dynamic rhythm map artwork for Blue Zenith by xi with cyan and deep sapphire highlights" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBP9cgXqVURuEs_tir1Raa6RxDgo5SQdiU8KpJmf3krytrtl8C__BT2MTtNiVfRR_u4_oP-nCJOD94Ux33Kv_q56U6TqclocthotfIbWOeKhRLYN67EMQnW1iUfUCBpFmOTdkI8Q3Epgt94C7AyYfhs_OHDRzoPFCTu46paT_1rsdAe1r5glyTE18S41JUmh9QKQmwUeFrVFaRwWyB7IHmN45z-6QhNOXxd8Iva0df_-l0Hvas-I5jA" />
                    </div>
                  </div>
                  {/* Titles, Badges & Recommendation Context */}
                  <div className="flex flex-col min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-headline-sm text-headline-sm text-on-surface truncate tracking-tight">{' '}Blue Zenith{' '}
                      </h2>
                      <span className="text-on-surface-variant font-body-md text-body-md">by xi
                      </span>
                      {/* Star Rating Pill */}
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-surface-container-highest text-[#FFCC22] font-label-sm text-label-sm font-bold shadow-inner">
                        <span className="material-symbols-outlined text-[13px]" style={{ fontVariationSettings: "'FILL' 1" }}>star
                        </span>{' '}4.86★{' '}
                      </span>
                      {/* Difficulty Tag Capsules */}
                      <span className="px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant font-label-sm text-label-sm">{' '}200 BPM{' '}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant font-label-sm text-label-sm">{' '}4:12{' '}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-primary/20 text-primary font-label-sm text-label-sm font-semibold">{' '}7K Mania{' '}
                      </span>
                    </div>
                    {/* Recommendation Reason */}
                    <p className="font-body-sm text-body-sm text-on-surface-variant mt-1 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-tertiary">
                      </span>{' '}High-tempo finger stamina practice right at the upper edge of your comfort zone before hitting 5-star density.{' '}
                    </p>
                  </div>
                </div>
                {/* Trailing Action Suite */}
                <div className="flex items-center justify-end gap-space-sm pl-4 flex-shrink-0">
                  {/* 5-Star Empty Community Rater */}
                  <div className="hidden xl:flex items-center gap-0.5 px-3 py-1.5 rounded-full bg-surface-container-high" title="Rate beatmap difficulty">
                    <button className="text-on-surface-variant/40 hover:text-[#FFCC22] transition-colors">
                      <span className="material-symbols-outlined text-[18px]">star
                      </span>
                    </button>
                    <button className="text-on-surface-variant/40 hover:text-[#FFCC22] transition-colors">
                      <span className="material-symbols-outlined text-[18px]">star
                      </span>
                    </button>
                    <button className="text-on-surface-variant/40 hover:text-[#FFCC22] transition-colors">
                      <span className="material-symbols-outlined text-[18px]">star
                      </span>
                    </button>
                    <button className="text-on-surface-variant/40 hover:text-[#FFCC22] transition-colors">
                      <span className="material-symbols-outlined text-[18px]">star
                      </span>
                    </button>
                    <button className="text-on-surface-variant/40 hover:text-[#FFCC22] transition-colors">
                      <span className="material-symbols-outlined text-[18px]">star
                      </span>
                    </button>
                  </div>
                  {/* Ghost Circular Action: Bookmark with guest lock */}
                  <div className="relative group/tooltip">
                    <button className="w-11 h-11 rounded-full bg-surface-container-high text-on-surface-variant hover:text-on-surface hover:bg-surface-variant transition-all flex items-center justify-center relative shadow-sm">
                      <span className="material-symbols-outlined text-[20px]">bookmark_border
                      </span>
                      <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center font-bold text-[9px]">
                        <span className="material-symbols-outlined text-[10px]">lock
                        </span>
                      </span>
                    </button>
                    <span className="pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-surface-container-highest px-2 py-1 font-label-sm text-[10px] text-on-surface opacity-0 group-hover/tooltip:opacity-100 transition-opacity z-30 shadow-md">{' '}Sign in to save{' '}
                    </span>
                  </div>
                  {/* Ghost Circular Action: Download */}
                  <div className="relative group/tooltip">
                    <button className="w-11 h-11 rounded-full bg-surface-container-high text-on-surface-variant hover:text-primary hover:bg-surface-variant transition-all flex items-center justify-center shadow-sm">
                      <span className="material-symbols-outlined text-[20px]">download
                      </span>
                    </button>
                    <span className="pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-surface-container-highest px-2 py-1 font-label-sm text-[10px] text-on-surface opacity-0 group-hover/tooltip:opacity-100 transition-opacity z-30 shadow-md">{' '}Download .osz{' '}
                    </span>
                  </div>
                  {/* Idle Play Circle */}
                  <button className="w-12 h-12 rounded-full bg-surface-container-high text-on-surface group-hover:bg-primary group-hover:text-on-primary flex items-center justify-center shadow-sm transition-all active:scale-95" title="Play preview">
                    <span className="material-symbols-outlined text-[24px]" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow
                    </span>
                  </button>
                </div>
              </div>
            </div>
            {/* ROW 3: LeaF - Calamity Fortune (Idle State) */}
            <div className="group relative rounded-full bg-surface-container-low p-2 pr-space-lg transition-all duration-300 hover:bg-surface-container shadow-sm hover:shadow-[0_8px_24px_rgba(255,176,204,0.12)]">
              <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-space-md">
                {/* Lead Circle & Beatmap Meta */}
                <div className="flex items-center gap-space-md min-w-0">
                  {/* Circular Cover Art */}
                  <div className="relative flex-shrink-0">
                    <div className="w-16 h-16 rounded-full overflow-hidden p-0.5 bg-surface-container-high group-hover:bg-secondary transition-colors shadow-sm">
                      <img className="w-full h-full object-cover rounded-full" data-alt="Dark abstract rhythm game jacket visual featuring chaotic sharp red-crimson ribbons, intricate crimson runes and dark purple geometric fractured clocks for song Calamity Fortune by LeaF with aggressive gothic aesthetic" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAsaVhkEQAEgZQfbRImd79auE0ic6t08phx46BX34e5rx0NTcKv0Tzx8lMoeoPRfzECgvsSxMVyjqzIWJfqbajXdwtMWv-9rqzdAt8eOPi4v7HlGFzz4LpEulvZ4jfrouUGHgO9ONovSZWerNkWEgR73YcWyUk5XP_k_SqQ1K9zBejtNf-EezUkzpd5JuNSfW9nuuDUlzpWV_LGhRBLJGM9bHkpplZio8Fi6DfkTIfWaYXxHyCO-pSf" />
                    </div>
                  </div>
                  {/* Titles, Badges & Recommendation Context */}
                  <div className="flex flex-col min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-headline-sm text-headline-sm text-on-surface truncate tracking-tight">{' '}Calamity Fortune{' '}
                      </h2>
                      <span className="text-on-surface-variant font-body-md text-body-md">by LeaF
                      </span>
                      {/* Star Rating Pill */}
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-surface-container-highest text-[#FFCC22] font-label-sm text-label-sm font-bold shadow-inner">
                        <span className="material-symbols-outlined text-[13px]" style={{ fontVariationSettings: "'FILL' 1" }}>star
                        </span>{' '}5.12★{' '}
                      </span>
                      {/* Difficulty Tag Capsules */}
                      <span className="px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant font-label-sm text-label-sm">{' '}174 BPM{' '}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant font-label-sm text-label-sm">{' '}2:18{' '}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-primary/20 text-primary font-label-sm text-label-sm font-semibold">{' '}7K Mania{' '}
                      </span>
                    </div>
                    {/* Recommendation Reason */}
                    <p className="font-body-sm text-body-sm text-on-surface-variant mt-1 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-secondary">
                      </span>{' '}Dense 7K chordstreams at 174 BPM to improve release precision where accuracy currently drops to 91%.{' '}
                    </p>
                  </div>
                </div>
                {/* Trailing Action Suite */}
                <div className="flex items-center justify-end gap-space-sm pl-4 flex-shrink-0">
                  {/* 5-Star Empty Community Rater */}
                  <div className="hidden xl:flex items-center gap-0.5 px-3 py-1.5 rounded-full bg-surface-container-high" title="Rate beatmap difficulty">
                    <button className="text-on-surface-variant/40 hover:text-[#FFCC22] transition-colors">
                      <span className="material-symbols-outlined text-[18px]">star
                      </span>
                    </button>
                    <button className="text-on-surface-variant/40 hover:text-[#FFCC22] transition-colors">
                      <span className="material-symbols-outlined text-[18px]">star
                      </span>
                    </button>
                    <button className="text-on-surface-variant/40 hover:text-[#FFCC22] transition-colors">
                      <span className="material-symbols-outlined text-[18px]">star
                      </span>
                    </button>
                    <button className="text-on-surface-variant/40 hover:text-[#FFCC22] transition-colors">
                      <span className="material-symbols-outlined text-[18px]">star
                      </span>
                    </button>
                    <button className="text-on-surface-variant/40 hover:text-[#FFCC22] transition-colors">
                      <span className="material-symbols-outlined text-[18px]">star
                      </span>
                    </button>
                  </div>
                  {/* Ghost Circular Action: Bookmark with guest lock */}
                  <div className="relative group/tooltip">
                    <button className="w-11 h-11 rounded-full bg-surface-container-high text-on-surface-variant hover:text-on-surface hover:bg-surface-variant transition-all flex items-center justify-center relative shadow-sm">
                      <span className="material-symbols-outlined text-[20px]">bookmark_border
                      </span>
                      <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center font-bold text-[9px]">
                        <span className="material-symbols-outlined text-[10px]">lock
                        </span>
                      </span>
                    </button>
                    <span className="pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-surface-container-highest px-2 py-1 font-label-sm text-[10px] text-on-surface opacity-0 group-hover/tooltip:opacity-100 transition-opacity z-30 shadow-md">{' '}Sign in to save{' '}
                    </span>
                  </div>
                  {/* Ghost Circular Action: Download */}
                  <div className="relative group/tooltip">
                    <button className="w-11 h-11 rounded-full bg-surface-container-high text-on-surface-variant hover:text-primary hover:bg-surface-variant transition-all flex items-center justify-center shadow-sm">
                      <span className="material-symbols-outlined text-[20px]">download
                      </span>
                    </button>
                    <span className="pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-surface-container-highest px-2 py-1 font-label-sm text-[10px] text-on-surface opacity-0 group-hover/tooltip:opacity-100 transition-opacity z-30 shadow-md">{' '}Download .osz{' '}
                    </span>
                  </div>
                  {/* Idle Play Circle */}
                  <button className="w-12 h-12 rounded-full bg-surface-container-high text-on-surface group-hover:bg-primary group-hover:text-on-primary flex items-center justify-center shadow-sm transition-all active:scale-95" title="Play preview">
                    <span className="material-symbols-outlined text-[24px]" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>
          {/* Guest Mode Preview Helper Card */}
          <div className="rounded-DEFAULT bg-surface-container-low p-space-md shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-space-md mt-2">
            <div className="flex items-center gap-space-md">
              <div className="w-12 h-12 rounded-full bg-surface-container-high flex items-center justify-center flex-shrink-0 text-primary">
                <span className="material-symbols-outlined text-[24px]">lock_open
                </span>
              </div>
              <div className="flex flex-col">
                <span className="font-headline-sm text-headline-sm text-on-surface">Guest mode preview
                </span>
                <p className="font-body-md text-body-md text-on-surface-variant max-w-2xl">{' '}All audio previews and direct beatmap downloads are unlocked. To save maps to custom collections and submit difficulty ratings, create a free account.{' '}
                </p>
              </div>
            </div>
            <button className="px-space-md py-2 rounded-full bg-surface-container-high hover:bg-surface-variant text-on-surface font-label-md text-label-md transition-all flex items-center gap-1.5 flex-shrink-0" type="button">
              <span className="material-symbols-outlined text-[16px]">person_add
              </span>{' '}Create free account{' '}
            </button>
          </div>
          {/* Bottom Navigation / Directional Control Strip */}
          <div className="flex items-center justify-between pt-space-md border-t-0 mt-4">
            <a className="px-space-md py-3 rounded-full text-on-surface-variant hover:text-on-surface font-label-md text-body-lg transition-colors flex items-center gap-2" data-path="dashboard" href="#">
              <span className="material-symbols-outlined text-[20px]">arrow_back
              </span>{' '}Skip to dashboard{' '}
            </a>
            <div className="flex items-center gap-space-md">
              <span className="hidden md:inline font-label-sm text-label-sm text-on-surface-variant">Step 1 of 1 completed
              </span>
              <a className="inline-flex items-center justify-center gap-2 px-space-xl py-3.5 rounded-full bg-[#FF66AA] text-[#3e0021] font-headline-sm text-headline-sm shadow-[0_0_24px_rgba(255,102,170,0.45)] hover:shadow-[0_0_32px_rgba(255,102,170,0.65)] hover:bg-[#ff85bd] transition-all transform hover:-translate-y-0.5 active:translate-y-0 active:scale-95" data-path="dashboard" href="#">{' '}Go to dashboard{' '}
                <span className="material-symbols-outlined text-[22px]">arrow_forward
                </span>
              </a>
            </div>
          </div>
        </div>
    </AppShell>
  )
}

// ---------------------------------------------------------------------------
// Real variant (M4, §5.5): the temporary welcome-recommendations page.
// ---------------------------------------------------------------------------

function finishOnboarding(navigate: (path: string) => void) {
  try {
    window.localStorage.setItem('recosuk-onboarded', '1')
  } catch {
    /* ignore */
  }
  navigate('/dashboard')
}

function WelcomeRecsReal({ data }: { data: ProfileData }) {
  const navigate = useNavigate()
  const mode = useModeStore((s) => s.mode)
  const { tier } = useAuth()
  const profile = data.skillProfile
  const key = seenKey(tier, data.user.username)
  const [items, setItems] = useState<RecCandidate[]>(
    () => getWelcomeRecs(data.user.username, mode) ?? [],
  )
  const [busy, setBusy] = useState(false)
  const [downloadedTick, setDownloadedTick] = useState(0)

  const generate = useCallback(async () => {
    setBusy(true)
    try {
      seedPlayedSets(key, data)
      const seen = seenStore.load(key)
      const result = await generateRecommendations(profile, mode, {
        count: 10,
        filters: defaultFiltersFor(profile),
        seen,
      })
      setItems(result.items)
      seenStore.markMany(key, 'served', result.items.map((c) => c.beatmapsetId))
    } catch {
      /* keep whatever the Generating screen pre-generated */
    } finally {
      setBusy(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, mode, profile])

  useEffect(() => {
    if (items.length === 0) void generate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, profile])

  const downloaded = seenStore.load(key).downloaded

  return (
    <div className="flex flex-col w-full max-w-7xl mx-auto gap-space-lg select-none pb-12">
      <div className="relative overflow-hidden rounded-DEFAULT bg-surface-container-low px-space-md py-3 shadow-md flex items-center justify-between gap-space-md">
        <div className="absolute -right-8 -top-8 w-32 h-32 bg-primary/10 rounded-full blur-2xl pointer-events-none"></div>
        <div className="flex items-center gap-space-sm min-w-0">
          <div className="w-8 h-8 rounded-full bg-surface-container-high flex items-center justify-center flex-shrink-0 shadow-inner">
            <span className="material-symbols-outlined text-primary text-[18px]">auto_awesome</span>
          </div>
          <p className="font-body-md text-body-md text-on-surface truncate">This is how Recommendations works. Preview a map, try a download — when you're ready, head to your dashboard.</p>
        </div>
        <div className="flex items-center gap-space-sm flex-shrink-0">
          <span className="px-2.5 py-1 rounded-full bg-primary-container/20 text-primary font-label-sm text-label-sm uppercase tracking-wider flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping"></span>Live picks
          </span>
        </div>
      </div>

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-space-md pt-2">
        <div className="flex flex-col gap-1 max-w-3xl">
          <div className="flex items-center gap-2 text-primary font-label-sm text-label-sm uppercase tracking-widest">
            <span>Curated for {data.user.username}</span>
            <span>•</span>
            <span className="text-tertiary">osu!{MODE_LABELS[mode].toLowerCase()}{profile.mainKeyCount ? ` ${profile.mainKeyCount}K` : ''}</span>
          </div>
          <h1 className="font-headline-xl text-headline-xl text-on-surface tracking-tight">Picked to train your {profile.srCeiling.toFixed(1)}★ gap</h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant leading-relaxed">
            {profile.isStarter
              ? 'Starter picks — popular Ranked maps for this mode. Play a few and your profile becomes personal.'
              : `Based on your top ${profile.topPlayCount} plays — recommendations focus on ${profile.bpmSweetMin}–${profile.bpmSweetMax} BPM to push past your ${profile.ceilingAccuracy !== null ? `${profile.ceilingAccuracy.toFixed(1)}%` : ''} threshold above ${profile.srCeiling.toFixed(1)}★.`}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-space-md mt-2" id="beatmap-list">
        {busy && items.length === 0 && (
          <p className="font-body-md text-body-md text-on-surface-variant">Generating your first picks…</p>
        )}
        {!busy && items.length === 0 && (
          <p className="font-body-md text-body-md text-on-surface-variant">No picks could be generated just now — the full Recommendations page will retry with the same engine.</p>
        )}
        {items.map((c) => (
          <BeatmapRow
            key={c.beatmapsetId}
            candidate={c}
            mode={mode}
            seenKeyValue={key}
            downloaded={downloaded.includes(c.beatmapsetId)}
            onDownloaded={() => setDownloadedTick((n) => n + 1)}
          />
        ))}
        <span className="hidden">{downloadedTick}</span>
      </div>

      {tier !== 'account' && (
        <div className="rounded-DEFAULT bg-surface-container-low p-space-md shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-space-md mt-2">
          <div className="flex items-center gap-space-md">
            <div className="w-12 h-12 rounded-full bg-surface-container-high flex items-center justify-center flex-shrink-0 text-primary">
              <span className="material-symbols-outlined text-[24px]">lock_open</span>
            </div>
            <div className="flex flex-col">
              <span className="font-headline-sm text-headline-sm text-on-surface">Guest mode preview</span>
              <p className="font-body-md text-body-md text-on-surface-variant max-w-2xl">All audio previews and direct beatmap downloads are unlocked. To save maps to custom collections and submit difficulty ratings, create a free account.</p>
            </div>
          </div>
          <button className="px-space-md py-2 rounded-full bg-surface-container-high hover:bg-surface-variant text-on-surface font-label-md text-label-md transition-all flex items-center gap-1.5 flex-shrink-0" type="button" onClick={(e) => { e.stopPropagation(); navigate('/auth') }}>
            <span className="material-symbols-outlined text-[16px]">person_add</span>Create free account
          </button>
        </div>
      )}

      {/* Bottom strip: Skip finishes onboarding (§5.5) */}
      <div className="flex items-center justify-between pt-space-md mt-4">
        <button className="px-space-md py-3 rounded-full text-on-surface-variant hover:text-on-surface font-label-md text-body-lg transition-colors flex items-center gap-2" type="button" onClick={(e) => { e.stopPropagation(); finishOnboarding(navigate) }}>
          <span className="material-symbols-outlined text-[20px]">arrow_back</span>Skip to dashboard
        </button>
        <div className="flex items-center gap-space-md">
          <span className="hidden md:inline font-label-sm text-label-sm text-on-surface-variant">Step 1 of 1 completed</span>
          <button className="inline-flex items-center justify-center gap-2 px-space-xl py-3.5 rounded-full bg-[#FF66AA] text-[#3e0021] font-headline-sm text-headline-sm shadow-[0_0_24px_rgba(255,102,170,0.45)] hover:shadow-[0_0_32px_rgba(255,102,170,0.65)] hover:bg-[#ff85bd] transition-all transform hover:-translate-y-0.5 active:translate-y-0 active:scale-95" type="button" onClick={(e) => { e.stopPropagation(); finishOnboarding(navigate) }}>
            Go to dashboard
            <span className="material-symbols-outlined text-[22px]">arrow_forward</span>
          </button>
        </div>
      </div>
    </div>
  )
}

export default function WelcomeRecs() {
  const mode = useModeStore((s) => s.mode)
  const { tier } = useAuth()
  const { status, data } = useProfileData(mode)
  if ((status !== 'ready' && status !== 'empty') || !data) return <WelcomeRecsDemo />
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
      <WelcomeRecsReal data={data} />
    </AppShell>
  )
}
