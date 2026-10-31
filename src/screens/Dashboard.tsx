// Converted from Stitch export: stitch-raw/06-dashboard.html
// M2: the exported markup below is the DEMO variant (sora_playz),
// rendered unchanged when no osu! account is linked or the proxy is
// not configured. The real variant at the bottom renders the same
// design with the linked player's live data via useProfileData().
import { useState } from 'react'
import AppShell from '../components/AppShell'
import LoadingState from '../components/LoadingState'
import AccBandChart from '../components/AccBandChart'
import RecentPlaysSection from '../components/RecentPlaysSection'
import { useProfileData, useSnapshots, type ProfileData } from '../lib/profileService'
import { useCapabilities } from '../lib/capabilities'
import { useModeStore } from '../lib/modeStore'
import { MODE_LABELS } from '../lib/mode'
import { fmtAcc, fmtInt, fmtSr } from '../lib/interpretations'
import { useAuth } from '../lib/auth'

// Identity shown by the demo fallback variant: sample data, not a real player.
const DEMO_IDENTITY = {
  username: 'sora_playz',
  pp: 5284,
  countryCode: 'VN',
  tierLabel: 'free tier',
}

function DashboardDemo() {
  return (
    <AppShell identity={DEMO_IDENTITY}>
        <div className="flex flex-col w-full">
          {/* Subtle Mode Context Background Glow */}
          <div className="relative w-full">
            <div className="absolute -top-12 left-1/3 w-96 h-96 bg-primary/10 rounded-full blur-[140px] pointer-events-none -z-10">
            </div>
            <div className="absolute top-48 right-10 w-72 h-72 bg-secondary/5 rounded-full blur-[110px] pointer-events-none -z-10">
            </div>
            {/* Section 1: Player Profile Hero Banner */}
            <div className="relative w-full rounded-lg bg-surface-container-low shadow-xl overflow-hidden mb-space-lg">
              {/* Atmospheric Backdrop Art & Neon Scrim */}
              <div className="w-full h-44 bg-cover bg-center relative" data-alt="Digital anime synthwave cybernetic visualizer with deep obsidian, neon violet laser paths, and floating illuminated rhythm keys in deep space, hyper-detailed dark aesthetic." style={{ backgroundImage: "url('https://lh3.googleusercontent.com/aida-public/AB6AXuDa5Gd6-otAY9OlG_DpeR4pvH7tHzAQdUnTPg-wqPjFx04URRto6MclmhzcPELrSvs7GoGdvl4u_PpZCUavUzP6Dm7UaTdeujXVuIXIUHlbnSHwguyByff45YUMnZzZ447V5sreYDsVe6ydJCvjXMswBsFrbgfHtkHqB3KLJm3KHg9h1iV2m1g2DNdBlUons_7lBswxS-u72kA91JlNiBIEScja7SGNPCjMrb4u3xkefiWg5VXEsxub')" }}>
                <div className="absolute inset-0 bg-gradient-to-t from-surface-container-low via-surface-container-low/80 to-transparent">
                </div>
                <div className="absolute inset-0 bg-gradient-to-r from-surface-container-lowest/90 via-surface-container-low/40 to-primary-container/20">
                </div>
                <div className="absolute top-4 right-6 flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-container-lowest/70 backdrop-blur-md">
                  <span className="w-2 h-2 rounded-full bg-[#7EE787] shadow-[0_0_8px_#7EE787]">
                  </span>
                  <span className="font-label-sm text-label-sm text-on-surface">osu! mania live tracking
                  </span>
                </div>
              </div>
              {/* Profile Content Strip with Overlapping Circular Avatar */}
              <div className="relative px-space-lg pb-space-lg pt-0">
                <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-space-lg -mt-16">
                  {/* Left: Circular Target Avatar & Meta Information */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-end gap-space-md min-w-0">
                    {/* Overlapping Lead Hit-Circle Avatar */}
                    <div className="relative group flex-shrink-0">
                      <div className="w-28 h-28 rounded-full bg-surface-container-high p-1 shadow-[0_0_28px_rgba(164,118,255,0.4)]">
                        <img className="w-full h-full object-cover rounded-full" data-alt="Intense esports rhythm gaming portrait of an anime stylized player with violet tinted hair, headset, sharp reflections, framed in dark ambient light." src="https://lh3.googleusercontent.com/aida-public/AB6AXuCQ-p4n-U8k_nzDJnTWUXEoq44KtHdDAF123w_LrkTdTC-5YV6vnb-uLCY-6zNrytjmOWV62UHMIjQ8E5DiL2A1vkzGZxbnwIQ-VQMZNUtYm4NvEdUtSb3ACxDtGf3Fs4-_oscmyDLtFtXs1QxfMybaQv7MePxOCLVA9K_P9hSU7aspwBrVJiL5zp2jFYpUGl0ADf68naIGC-Piw6j9QX65J2c7v5Domk0mH7o8wzvln15G6l3zDJn4" />
                      </div>
                      <div className="absolute bottom-1 right-1 flex items-center justify-center w-7 h-7 rounded-full bg-surface-container-lowest shadow-md">
                        <span className="text-[13px] leading-none" title="Vietnam">🇻🇳
                        </span>
                      </div>
                    </div>
                    {/* Identity & Primary Performance Points Display */}
                    <div className="flex flex-col min-w-0">
                      <div className="flex flex-wrap items-center gap-space-xs">
                        <h1 className="font-headline-xl text-headline-xl text-on-surface tracking-tight leading-none">sora_playz
                        </h1>
                        <div className="px-2.5 py-0.5 rounded-full bg-primary-container/30 text-primary font-label-sm text-label-sm font-semibold tracking-wide uppercase">{' '}Mania 7K Specialist{' '}
                        </div>
                        <div className="px-2.5 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant font-label-sm text-label-sm">{' '}Peak #17,205{' '}
                        </div>
                      </div>
                      {/* Huge Performance Metric with Neon Glow */}
                      <div className="flex items-baseline gap-3 my-1">
                        <span className="font-metric-display text-metric-display text-primary drop-shadow-[0_0_18px_rgba(210,187,255,0.35)]">5,284
                        </span>
                        <span className="font-headline-md text-headline-md text-on-surface-variant tracking-normal">pp
                        </span>
                        <span className="font-label-sm text-label-sm text-on-surface-variant pl-2">Weighted: 100% (mania)
                        </span>
                      </div>
                      {/* Metadata Bar with Tabular Numerals */}
                      <div className="flex flex-wrap items-center gap-x-space-md gap-y-1 font-body-sm text-body-sm text-on-surface-variant">
                        <div className="flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[16px] text-tertiary">public
                          </span>
                          <span className="text-on-surface font-semibold font-label-md text-label-md">Global #18,942
                          </span>
                        </div>
                        <span className="text-outline-variant">·
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[16px] text-secondary">flag
                          </span>
                          <span className="text-on-surface font-semibold font-label-md text-label-md">Country #142
                          </span>
                        </div>
                        <span className="text-outline-variant">·
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[16px] text-[#7EE787]">track_changes
                          </span>
                          <span className="text-on-surface font-semibold font-label-md text-label-md">Accuracy 96.84%
                          </span>
                        </div>
                        <span className="text-outline-variant">·
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[16px] text-primary">equalizer
                          </span>
                          <span className="text-on-surface font-semibold font-label-md text-label-md">12,430 plays
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  {/* Right Action Suite with Tactile Pill Controls */}
                  <div className="flex items-center gap-space-sm pt-2 xl:pt-0">
                    <button className="flex items-center gap-2 px-space-md py-2.5 rounded-full bg-primary-container text-on-primary-container font-label-md text-label-md font-semibold hover:brightness-110 active:scale-95 transition-all shadow-[0_0_16px_rgba(164,118,255,0.3)]" id="sync-btn" type="button">
                      <span className="material-symbols-outlined text-[18px]">sync
                      </span>
                      <span>Sync now
                      </span>
                    </button>
                    <button className="flex items-center justify-center w-10 h-10 rounded-full bg-surface-container-high text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-all" title="Share profile" type="button">
                      <span className="material-symbols-outlined text-[20px]">share
                      </span>
                    </button>
                    <button className="flex items-center justify-center w-10 h-10 rounded-full bg-surface-container-high text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-all" title="Edit training goals" type="button">
                      <span className="material-symbols-outlined text-[20px]">settings_suggest
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
            {/* Section 2: Two-Column Rhythm Playstage Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg">
              {/* LEFT COLUMN: Main Skill Gap Analysis & Beatmap Slider Tracks (~68% / 8 cols) */}
              <div className="lg:col-span-8 flex flex-col gap-space-lg">
                {/* A. Skill Gap Degradation Chart Section */}
                <div className="w-full rounded-lg bg-surface-container-low p-space-lg shadow-md relative overflow-hidden">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm mb-space-md">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-primary shadow-[0_0_8px_rgba(210,187,255,0.8)]">
                        </span>
                        <h2 className="font-headline-md text-headline-md text-on-surface">Your skill gap
                        </h2>
                      </div>
                      <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">Accuracy degradation across star difficulties (Mania 7K)
                      </p>
                    </div>
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-container-high text-on-surface">
                      <span className="material-symbols-outlined text-secondary text-[16px]">crisis_alert
                      </span>
                      <span className="font-label-sm text-label-sm">Collapse point detected:{' '}
                        <strong className="text-secondary font-bold">5.0★
                        </strong>{' '}(-6.6% drop)
                      </span>
                    </div>
                  </div>
                  {/* Rich Visual Inline SVG Chart with Accuracy Degradation */}
                  <div className="w-full bg-surface-container rounded-DEFAULT p-space-md relative">
                    {/* Benchmark Reference Line Overlay Indicators */}
                    <div className="absolute right-4 top-3 flex items-center gap-space-md font-label-sm text-[10px] text-on-surface-variant z-10">
                      <div className="flex items-center gap-1.5">
                        <span className="w-3 h-0.5 bg-[#7EE787]">
                        </span>
                        <span>97.0% Comfort baseline
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-3 h-0.5 border-t border-dashed border-primary">
                        </span>
                        <span>95.0% Pass target
                        </span>
                      </div>
                    </div>
                    {/* Responsive SVG Bar Visualizer */}
                    <div className="w-full overflow-x-auto pb-1">
                      <svg className="w-full h-56 select-none" preserveAspectRatio="none" viewBox="0 0 720 230">
                        {/* Subtle Gridlines & Percent Scale */}
                        <line opacity="0.6" stroke="#393243" strokeDasharray="2 3" strokeWidth="1" x1="45" x2="695" y1="30" y2="30">
                        </line>
                        <text fill="#958d9f" fontFamily="Inter" fontSize="10" textAnchor="end" x="38" y="34">100%
                        </text>
                        {/* 97% Comfort Guide Line */}
                        <line opacity="0.45" stroke="#7EE787" strokeDasharray="4 3" strokeWidth="1.2" x1="45" x2="695" y1="52" y2="52">
                        </line>
                        <text fill="#7EE787" fontFamily="Inter" fontSize="10" textAnchor="end" x="38" y="55">97%
                        </text>
                        {/* 95% Benchmark Line */}
                        <line opacity="0.4" stroke="#d2bbff" strokeDasharray="3 3" strokeWidth="1.2" x1="45" x2="695" y1="72" y2="72">
                        </line>
                        <text fill="#d2bbff" fontFamily="Inter" fontSize="10" textAnchor="end" x="38" y="75">95%
                        </text>
                        <line opacity="0.6" stroke="#393243" strokeDasharray="2 3" strokeWidth="1" x1="45" x2="695" y1="120" y2="120">
                        </line>
                        <text fill="#958d9f" fontFamily="Inter" fontSize="10" textAnchor="end" x="38" y="124">90%
                        </text>
                        <line opacity="0.6" stroke="#393243" strokeDasharray="2 3" strokeWidth="1" x1="45" x2="695" y1="170" y2="170">
                        </line>
                        <text fill="#958d9f" fontFamily="Inter" fontSize="10" textAnchor="end" x="38" y="174">85%
                        </text>
                        {/* Target Band Zone Glow behind 5.0★ - 5.5★ */}
                        <rect fill="#a476ff" fillOpacity="0.07" height="162" rx="12" width="220" x="475" y="20">
                        </rect>
                        <text fill="#d2bbff" fontFamily="Inter" fontSize="10" fontWeight="600" textAnchor="middle" x="585" y="38">TARGET TRAINING ZONE
                        </text>
                        {/* Bar 1: 3.5 - 3.9★ (98.9%) */}
                        <g className="transition-all hover:opacity-90 cursor-pointer">
                          <rect fill="#7EE787" fillOpacity="0.85" height="142" rx="8" width="62" x="75" y="38">
                          </rect>
                          <text fill="#eadef5" fontFamily="Inter" fontSize="11" fontWeight="700" textAnchor="middle" x="106" y="28">98.9%
                          </text>
                          <text fill="#ccc3d6" fontFamily="Outfit" fontSize="11" fontWeight="600" textAnchor="middle" x="106" y="198">3.5–3.9★
                          </text>
                          <text fill="#958d9f" fontFamily="Inter" fontSize="9" textAnchor="middle" x="106" y="212">Mastered
                          </text>
                        </g>
                        {/* Bar 2: 4.0 - 4.3★ (98.4%) */}
                        <g className="transition-all hover:opacity-90 cursor-pointer">
                          <rect fill="#7EE787" fillOpacity="0.85" height="138" rx="8" width="62" x="180" y="42">
                          </rect>
                          <text fill="#eadef5" fontFamily="Inter" fontSize="11" fontWeight="700" textAnchor="middle" x="211" y="32">98.4%
                          </text>
                          <text fill="#ccc3d6" fontFamily="Outfit" fontSize="11" fontWeight="600" textAnchor="middle" x="211" y="198">4.0–4.3★
                          </text>
                          <text fill="#958d9f" fontFamily="Inter" fontSize="9" textAnchor="middle" x="211" y="212">Solid
                          </text>
                        </g>
                        {/* Bar 3: 4.4 - 4.7★ (97.8% - Comfort Zone Limit) */}
                        <g className="transition-all hover:opacity-90 cursor-pointer">
                          <rect fill="#7EE787" fillOpacity="0.95" height="132" rx="8" width="62" x="285" y="48">
                          </rect>
                          <text fill="#7EE787" fontFamily="Inter" fontSize="11" fontWeight="700" textAnchor="middle" x="316" y="36">97.8%
                          </text>
                          <text fill="#eadef5" fontFamily="Outfit" fontSize="11" fontWeight="700" textAnchor="middle" x="316" y="198">4.4–4.7★
                          </text>
                          <text fill="#7EE787" fontFamily="Inter" fontSize="9" fontWeight="600" textAnchor="middle" x="316" y="212">Comfort Limit
                          </text>
                        </g>
                        {/* Bar 4: 4.8 - 4.9★ (95.1%) */}
                        <g className="transition-all hover:opacity-90 cursor-pointer">
                          <rect fill="#ffd9e4" fillOpacity="0.45" height="109" rx="8" width="62" x="390" y="71">
                          </rect>
                          <text fill="#eadef5" fontFamily="Inter" fontSize="11" fontWeight="700" textAnchor="middle" x="421" y="62">95.1%
                          </text>
                          <text fill="#ccc3d6" fontFamily="Outfit" fontSize="11" fontWeight="600" textAnchor="middle" x="421" y="198">4.8–4.9★
                          </text>
                          <text fill="#ffb0cc" fontFamily="Inter" fontSize="9" textAnchor="middle" x="421" y="212">-2.7% drift
                          </text>
                        </g>
                        {/* Bar 5: 5.0 - 5.2★ (91.2% - Target Collapse Point) */}
                        <g className="transition-all hover:opacity-90 cursor-pointer">
                          {/* Highlight outline indicator */}
                          <rect fill="#a476ff" fillOpacity="0.95" height="76" rx="8" width="62" x="495" y="104">
                          </rect>
                          <rect fill="none" height="80" opacity="0.8" rx="10" stroke="#d2bbff" strokeWidth="2" width="66" x="493" y="102">
                          </rect>
                          <text fill="#ffb0cc" fontFamily="Inter" fontSize="11" fontWeight="800" textAnchor="middle" x="526" y="94">91.2%
                          </text>
                          <text fill="#d2bbff" fontFamily="Outfit" fontSize="11" fontWeight="800" textAnchor="middle" x="526" y="198">5.0–5.2★
                          </text>
                          <text fill="#ffb0cc" fontFamily="Inter" fontSize="9" fontWeight="700" textAnchor="middle" x="526" y="212">COLLAPSE
                          </text>
                        </g>
                        {/* Bar 6: 5.3 - 5.5★ (86.4%) */}
                        <g className="transition-all hover:opacity-90 cursor-pointer">
                          <rect fill="#713bd0" fillOpacity="0.8" height="32" rx="8" width="62" x="600" y="148">
                          </rect>
                          <text fill="#ccc3d6" fontFamily="Inter" fontSize="11" fontWeight="700" textAnchor="middle" x="631" y="139">86.4%
                          </text>
                          <text fill="#958d9f" fontFamily="Outfit" fontSize="11" fontWeight="600" textAnchor="middle" x="631" y="198">5.3–5.5★
                          </text>
                          <text fill="#958d9f" fontFamily="Inter" fontSize="9" textAnchor="middle" x="631" y="212">Heavy lock
                          </text>
                        </g>
                      </svg>
                    </div>
                    {/* Bottom Chart Summary Track */}
                    <div className="mt-space-sm pt-space-xs flex flex-wrap items-center justify-between gap-2 font-body-sm text-body-sm text-on-surface-variant">
                      <span className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-primary text-[16px]">info
                        </span>{' '}Analysis derived from Sora's recent 140 ranked plays over 21 days.{' '}
                      </span>
                      <a className="text-primary hover:text-primary-fixed font-label-sm text-label-sm font-semibold flex items-center gap-1" href="#">{' '}Deep dive accuracy matrix{' '}
                        <span className="material-symbols-outlined text-[14px]">arrow_forward
                        </span>
                      </a>
                    </div>
                  </div>
                </div>
                {/* B. Today's Training Picks (Beatmap Slider Tracks) */}
                <div className="flex flex-col gap-space-md">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-xs">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-secondary shadow-[0_0_8px_rgba(255,176,204,0.7)]">
                        </span>
                        <h2 className="font-headline-md text-headline-md text-on-surface">Today's training picks
                        </h2>
                      </div>
                      <p className="font-body-sm text-body-sm text-on-surface-variant">Recommended for Sora's exact 5.0★ release precision breakthrough
                      </p>
                    </div>
                    <span className="font-label-sm text-label-sm text-on-surface-variant px-3 py-1 rounded-full bg-surface-container-high self-start sm:self-auto">{' '}Updated 2 hours ago{' '}
                    </span>
                  </div>
                  {/* Slider Row 1: Camellia - Exit This Earth's Atomosphere */}
                  <div className="group relative rounded-full bg-surface-container-low hover:bg-surface-container-high transition-all p-2 pr-space-lg flex items-center justify-between gap-space-md shadow-sm hover:shadow-[0_8px_24px_-4px_rgba(157,107,255,0.18)]">
                    <div className="flex items-center gap-space-md min-w-0 flex-1">
                      {/* Lead Circle Cover Art with Mania Purple Aura */}
                      <div className="relative flex-shrink-0 w-14 h-14 rounded-full p-0.5 bg-primary/40 shadow-[0_0_12px_rgba(164,118,255,0.4)]">
                        <img className="w-full h-full object-cover rounded-full" data-alt="Album art of cosmic planetary collision with electronic neon synth grids and purple starlight." src="https://lh3.googleusercontent.com/aida-public/AB6AXuBh6KkNUKj4QMd3Q-K11-KWG1FIr3b-oITuXpLd65U_FzOJ9-7kB1kPi-Wpi7qeb3qahoQnM3U1AKPeFa_wxIxscwNfWhuCrR73vJn95rrQKCTzFnOMQyCLanFZPyI7B8a6LmoNKDL-HSkj4IdBjLZLjgYolGW4xCWWB6La3x2uFA6lVSHtIHWUxW3wflSKwqxNDOh-BNYkaLpiITy14Q-Gy1Haet3mnV9NVsW4EjdMst6b4jq89sCh" />
                        <button aria-label="Preview track" className="absolute inset-0 m-auto w-9 h-9 rounded-full bg-surface-container-lowest/80 text-primary flex items-center justify-center opacity-0 group-hover:opacity-100 hover:scale-110 transition-all backdrop-blur-sm" type="button">
                          <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow
                          </span>
                        </button>
                      </div>
                      {/* Content Track Hierarchy */}
                      <div className="flex flex-col min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-headline-sm text-headline-sm text-on-surface truncate">Exit This Earth's Atomosphere
                          </span>
                          {/* Difficulty Mini-Pill */}
                          <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container-highest">
                            <span className="text-[#FFCC22] text-[12px] leading-none">★
                            </span>
                            <span className="font-label-sm text-[11px] font-bold text-[#FFCC22]">5.24
                            </span>
                          </div>
                          <span className="px-2 py-0.5 rounded-full bg-primary/20 text-primary font-label-sm text-[10px] font-bold uppercase">7K Mania
                          </span>
                        </div>
                        <div className="flex items-center gap-2 font-body-sm text-body-sm text-on-surface-variant truncate">
                          <span className="text-on-surface">Camellia
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
                          <span>mapped by Evening
                          </span>
                        </div>
                        <p className="font-body-sm text-[12px] text-primary-fixed-dim line-clamp-1 mt-0.5">{' '}Your accuracy drops above 5.0★ — this map trains that band at 182 BPM, right in your best tempo.{' '}
                        </p>
                      </div>
                    </div>
                    {/* Trailing Action Suite with Circular Controls & Rating */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <div className="hidden sm:flex items-center gap-0.5 text-[#FFCC22] pr-2">
                        <span className="material-symbols-outlined text-[15px]" style={{ fontVariationSettings: "'FILL' 1" }}>star
                        </span>
                        <span className="material-symbols-outlined text-[15px]" style={{ fontVariationSettings: "'FILL' 1" }}>star
                        </span>
                        <span className="material-symbols-outlined text-[15px]" style={{ fontVariationSettings: "'FILL' 1" }}>star
                        </span>
                        <span className="material-symbols-outlined text-[15px]" style={{ fontVariationSettings: "'FILL' 1" }}>star
                        </span>
                        <span className="material-symbols-outlined text-[15px]" style={{ fontVariationSettings: "'FILL' 1" }}>star_half
                        </span>
                      </div>
                      <button className="w-9 h-9 rounded-full bg-surface-container hover:bg-primary hover:text-on-primary text-on-surface-variant flex items-center justify-center transition-all shadow-sm" title="Preview audio" type="button">
                        <span className="material-symbols-outlined text-[18px]">volume_up
                        </span>
                      </button>
                      <button className="w-9 h-9 rounded-full bg-surface-container hover:bg-secondary hover:text-on-secondary text-on-surface-variant flex items-center justify-center transition-all shadow-sm" title="Download beatmap" type="button">
                        <span className="material-symbols-outlined text-[18px]">download
                        </span>
                      </button>
                      <button className="w-9 h-9 rounded-full bg-surface-container hover:bg-primary-container hover:text-on-primary-container text-on-surface-variant flex items-center justify-center transition-all shadow-sm" title="Save to list" type="button">
                        <span className="material-symbols-outlined text-[18px]">bookmark_add
                        </span>
                      </button>
                    </div>
                  </div>
                  {/* Slider Row 2: LeaF - Calamity Fortune */}
                  <div className="group relative rounded-full bg-surface-container-low hover:bg-surface-container-high transition-all p-2 pr-space-lg flex items-center justify-between gap-space-md shadow-sm hover:shadow-[0_8px_24px_-4px_rgba(157,107,255,0.18)]">
                    <div className="flex items-center gap-space-md min-w-0 flex-1">
                      {/* Lead Circle Cover Art */}
                      <div className="relative flex-shrink-0 w-14 h-14 rounded-full p-0.5 bg-primary/40 shadow-[0_0_12px_rgba(164,118,255,0.4)]">
                        <img className="w-full h-full object-cover rounded-full" data-alt="Digital gothic dark artwork with crimson and violet fractured stained glass and cybernetic patterns." src="https://lh3.googleusercontent.com/aida-public/AB6AXuB4Q3vqtyUZKUEBILC_YC9JAWY2NVg8jmXtyuTSo8ehuQDDYlpRj7uV2Ndo8M0qcPRMgXHC0lzhT5bf5vcFbvkai1KpzWiSf6Tav4IQLjTmTManPpe7hdk7PbF18kmVuBX4o_8BRIOQxq5DNA9BUoGtB4-RTa_apQ5cJOEKqIaEAwww1773cdOY1N3Obqp9Z2eGnOUjeKrz78OdpzTWoh4Unq1F0ycAFvM5QPq201TEFxSb_LpgNrPA" />
                        <button aria-label="Preview track" className="absolute inset-0 m-auto w-9 h-9 rounded-full bg-surface-container-lowest/80 text-primary flex items-center justify-center opacity-0 group-hover:opacity-100 hover:scale-110 transition-all backdrop-blur-sm" type="button">
                          <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow
                          </span>
                        </button>
                      </div>
                      {/* Content Track Hierarchy */}
                      <div className="flex flex-col min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-headline-sm text-headline-sm text-on-surface truncate">Calamity Fortune
                          </span>
                          {/* Difficulty Mini-Pill */}
                          <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container-highest">
                            <span className="text-[#FFCC22] text-[12px] leading-none">★
                            </span>
                            <span className="font-label-sm text-[11px] font-bold text-[#FFCC22]">5.12
                            </span>
                          </div>
                          <span className="px-2 py-0.5 rounded-full bg-primary/20 text-primary font-label-sm text-[10px] font-bold uppercase">7K Mania
                          </span>
                        </div>
                        <div className="flex items-center gap-2 font-body-sm text-body-sm text-on-surface-variant truncate">
                          <span className="text-on-surface">LeaF
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
                          <span>mapped by Blocko
                          </span>
                        </div>
                        <p className="font-body-sm text-[12px] text-primary-fixed-dim line-clamp-1 mt-0.5">{' '}Dense 7K chordstreams at 174 BPM to improve release precision where accuracy currently drops to 91%.{' '}
                        </p>
                      </div>
                    </div>
                    {/* Trailing Action Suite with Circular Controls & Rating */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <div className="hidden sm:flex items-center gap-0.5 text-[#FFCC22] pr-2">
                        <span className="material-symbols-outlined text-[15px]" style={{ fontVariationSettings: "'FILL' 1" }}>star
                        </span>
                        <span className="material-symbols-outlined text-[15px]" style={{ fontVariationSettings: "'FILL' 1" }}>star
                        </span>
                        <span className="material-symbols-outlined text-[15px]" style={{ fontVariationSettings: "'FILL' 1" }}>star
                        </span>
                        <span className="material-symbols-outlined text-[15px]" style={{ fontVariationSettings: "'FILL' 1" }}>star
                        </span>
                        <span className="material-symbols-outlined text-[15px]" style={{ fontVariationSettings: "'FILL' 1" }}>star
                        </span>
                      </div>
                      <button className="w-9 h-9 rounded-full bg-surface-container hover:bg-primary hover:text-on-primary text-on-surface-variant flex items-center justify-center transition-all shadow-sm" title="Preview audio" type="button">
                        <span className="material-symbols-outlined text-[18px]">volume_up
                        </span>
                      </button>
                      <button className="w-9 h-9 rounded-full bg-surface-container hover:bg-secondary hover:text-on-secondary text-on-surface-variant flex items-center justify-center transition-all shadow-sm" title="Download beatmap" type="button">
                        <span className="material-symbols-outlined text-[18px]">download
                        </span>
                      </button>
                      <button className="w-9 h-9 rounded-full bg-surface-container hover:bg-primary-container hover:text-on-primary-container text-on-surface-variant flex items-center justify-center transition-all shadow-sm" title="Save to list" type="button">
                        <span className="material-symbols-outlined text-[18px]">bookmark_add
                        </span>
                      </button>
                    </div>
                  </div>
                  {/* Slider Row 3: xi - Blue Zenith */}
                  <div className="group relative rounded-full bg-surface-container-low hover:bg-surface-container-high transition-all p-2 pr-space-lg flex items-center justify-between gap-space-md shadow-sm hover:shadow-[0_8px_24px_-4px_rgba(157,107,255,0.18)]">
                    <div className="flex items-center gap-space-md min-w-0 flex-1">
                      {/* Lead Circle Cover Art */}
                      <div className="relative flex-shrink-0 w-14 h-14 rounded-full p-0.5 bg-primary/40 shadow-[0_0_12px_rgba(164,118,255,0.4)]">
                        <img className="w-full h-full object-cover rounded-full" data-alt="Digital fantasy illustration of celestial azure wings flying towards a radiant indigo supernova." src="https://lh3.googleusercontent.com/aida-public/AB6AXuBEuEGOlt00y1mXdF1tleOvRqBvtcpVGw9dzmVD_08KXGZdGNTYzSj08FFI5sD_7NZnAGBrDOP7VcHmsZyPBX8YP8ggnEM0qsYWAbi4Gxtk6ktWFSP6a6f-ywo3O-7r5uA-oM-9HUZsPE77QClma730zpwSKaJQLSxD93NFtrvfalQnykRRL4HhpyMwJEd2jMIrqthHjgQrI3xj8zx9iOeXivTvUHw7C5uMyC9H865MNCzmrkAoxON1" />
                        <button aria-label="Preview track" className="absolute inset-0 m-auto w-9 h-9 rounded-full bg-surface-container-lowest/80 text-primary flex items-center justify-center opacity-0 group-hover:opacity-100 hover:scale-110 transition-all backdrop-blur-sm" type="button">
                          <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow
                          </span>
                        </button>
                      </div>
                      {/* Content Track Hierarchy */}
                      <div className="flex flex-col min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-headline-sm text-headline-sm text-on-surface truncate">Blue Zenith
                          </span>
                          {/* Difficulty Mini-Pill */}
                          <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container-highest">
                            <span className="text-[#FFCC22] text-[12px] leading-none">★
                            </span>
                            <span className="font-label-sm text-[11px] font-bold text-[#FFCC22]">4.86
                            </span>
                          </div>
                          <span className="px-2 py-0.5 rounded-full bg-primary/20 text-primary font-label-sm text-[10px] font-bold uppercase">7K Mania
                          </span>
                        </div>
                        <div className="flex items-center gap-2 font-body-sm text-body-sm text-on-surface-variant truncate">
                          <span className="text-on-surface">xi
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
                          <span>mapped by Asuka
                          </span>
                        </div>
                        <p className="font-body-sm text-[12px] text-primary-fixed-dim line-clamp-1 mt-0.5">{' '}High-tempo finger stamina practice right at the upper edge of your comfort zone before hitting 5-star density.{' '}
                        </p>
                      </div>
                    </div>
                    {/* Trailing Action Suite with Circular Controls & Rating */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <div className="hidden sm:flex items-center gap-0.5 text-[#FFCC22] pr-2">
                        <span className="material-symbols-outlined text-[15px]" style={{ fontVariationSettings: "'FILL' 1" }}>star
                        </span>
                        <span className="material-symbols-outlined text-[15px]" style={{ fontVariationSettings: "'FILL' 1" }}>star
                        </span>
                        <span className="material-symbols-outlined text-[15px]" style={{ fontVariationSettings: "'FILL' 1" }}>star
                        </span>
                        <span className="material-symbols-outlined text-[15px]" style={{ fontVariationSettings: "'FILL' 1" }}>star
                        </span>
                        <span className="material-symbols-outlined text-[15px]" style={{ fontVariationSettings: "'FILL' 0" }}>star
                        </span>
                      </div>
                      <button className="w-9 h-9 rounded-full bg-surface-container hover:bg-primary hover:text-on-primary text-on-surface-variant flex items-center justify-center transition-all shadow-sm" title="Preview audio" type="button">
                        <span className="material-symbols-outlined text-[18px]">volume_up
                        </span>
                      </button>
                      <button className="w-9 h-9 rounded-full bg-surface-container hover:bg-secondary hover:text-on-secondary text-on-surface-variant flex items-center justify-center transition-all shadow-sm" title="Download beatmap" type="button">
                        <span className="material-symbols-outlined text-[18px]">download
                        </span>
                      </button>
                      <button className="w-9 h-9 rounded-full bg-surface-container hover:bg-primary-container hover:text-on-primary-container text-on-surface-variant flex items-center justify-center transition-all shadow-sm" title="Save to list" type="button">
                        <span className="material-symbols-outlined text-[18px]">bookmark_add
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              {/* RIGHT RAIL: Insights, Active Collections, & Mode Context (~32% / 4 cols) */}
              <div className="lg:col-span-4 flex flex-col gap-space-lg">
                {/* 1. Skill Profile Panel */}
                <div className="w-full rounded-lg bg-surface-container-low p-space-lg shadow-md flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-space-md">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center">
                          <span className="font-headline-sm text-[11px] leading-none">mna
                          </span>
                        </div>
                        <h3 className="font-headline-sm text-headline-sm text-on-surface">Skill profile
                        </h3>
                      </div>
                      <span className="font-label-sm text-label-sm text-primary font-semibold">Active Model
                      </span>
                    </div>
                    {/* 4 Structured Metric Rows */}
                    <div className="flex flex-col gap-space-md">
                      {/* Metric 1: Comfort Band */}
                      <div className="p-space-sm rounded-DEFAULT bg-surface-container flex flex-col gap-1">
                        <div className="flex items-center justify-between">
                          <span className="font-label-md text-label-md text-on-surface">Comfort band
                          </span>
                          <span className="font-label-md text-label-md text-[#7EE787] font-bold">4.2–4.7★
                          </span>
                        </div>
                        <p className="font-body-sm text-[12px] text-on-surface-variant leading-relaxed">{' '}You average 97.8% accuracy here; these maps maintain muscle memory but don't force improvement.{' '}
                        </p>
                      </div>
                      {/* Metric 2: Collapse Point */}
                      <div className="p-space-sm rounded-DEFAULT bg-surface-container-high flex flex-col gap-1">
                        <div className="flex items-center justify-between">
                          <span className="font-label-md text-label-md text-secondary font-semibold">Collapse point
                          </span>
                          <span className="font-label-md text-label-md text-secondary font-bold">5.0★
                          </span>
                        </div>
                        <p className="font-body-sm text-[12px] text-on-surface-variant leading-relaxed">{' '}Accuracy drops 6.6 points here due to fast key releases in dense chords.{' '}
                        </p>
                      </div>
                      {/* Metric 3: Best Tempo */}
                      <div className="p-space-sm rounded-DEFAULT bg-surface-container flex flex-col gap-1">
                        <div className="flex items-center justify-between">
                          <span className="font-label-md text-label-md text-on-surface">Best tempo
                          </span>
                          <span className="font-label-md text-label-md text-primary font-bold">170–190 BPM
                          </span>
                        </div>
                        <p className="font-body-sm text-[12px] text-on-surface-variant leading-relaxed">{' '}Your release timing is sharpest in this range across 82% of top plays.{' '}
                        </p>
                      </div>
                      {/* Metric 4: Main Key */}
                      <div className="p-space-sm rounded-DEFAULT bg-surface-container flex flex-col gap-1">
                        <div className="flex items-center justify-between">
                          <span className="font-label-md text-label-md text-on-surface">Main key
                          </span>
                          <span className="font-label-md text-label-md text-tertiary font-bold">7K Layout
                          </span>
                        </div>
                        <p className="font-body-sm text-[12px] text-on-surface-variant leading-relaxed">{' '}82% of your top plays are 7-key layouts with S-D-F-Space-J-K-L binding.{' '}
                        </p>
                      </div>
                    </div>
                  </div>
                  {/* Recalculate CTA */}
                  <div className="mt-space-md pt-space-xs">
                    <button className="w-full flex items-center justify-center gap-2 py-2.5 rounded-full bg-surface-container-high hover:bg-surface-container-highest text-primary font-label-md text-label-md font-semibold transition-all" type="button">
                      <span className="material-symbols-outlined text-[18px]">reorder
                      </span>
                      <span>Recalculate skill profile
                      </span>
                    </button>
                  </div>
                </div>
                {/* 2. Your Lists Panel */}
                <div className="w-full rounded-lg bg-surface-container-low p-space-lg shadow-md">
                  <div className="flex items-center justify-between mb-space-md">
                    <div className="flex items-center gap-2">
                      <h3 className="font-headline-sm text-headline-sm text-on-surface">Your lists
                      </h3>
                      <span className="px-2 py-0.5 rounded-full bg-surface-container-high font-label-sm text-label-sm text-on-surface-variant">2 collections
                      </span>
                    </div>
                    <button className="flex items-center gap-1 font-label-sm text-label-sm text-primary hover:text-primary-fixed font-semibold" type="button">
                      <span className="material-symbols-outlined text-[15px]">add
                      </span>
                      <span>New list
                      </span>
                    </button>
                  </div>
                  <div className="flex flex-col gap-space-sm">
                    {/* List 1 */}
                    <a className="p-space-sm rounded-DEFAULT bg-surface-container hover:bg-surface-container-high transition-all flex items-center justify-between gap-2 group" href="#">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-full bg-primary/20 text-primary flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-all">
                          <span className="material-symbols-outlined text-[20px]">queue_music
                          </span>
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="font-label-md text-label-md text-on-surface truncate group-hover:text-primary transition-colors">5.0★ Stamina Breakthrough
                          </span>
                          <span className="font-body-sm text-[11px] text-on-surface-variant">14 beatmaps · 7K Mania · Updated yesterday
                          </span>
                        </div>
                      </div>
                      <span className="material-symbols-outlined text-outline text-[18px] group-hover:translate-x-0.5 transition-transform">chevron_right
                      </span>
                    </a>
                    {/* List 2 */}
                    <a className="p-space-sm rounded-DEFAULT bg-surface-container hover:bg-surface-container-high transition-all flex items-center justify-between gap-2 group" href="#">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-full bg-tertiary/20 text-tertiary flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-all">
                          <span className="material-symbols-outlined text-[20px]">speed
                          </span>
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="font-label-md text-label-md text-on-surface truncate group-hover:text-tertiary transition-colors">Warmup Speed 180 BPM
                          </span>
                          <span className="font-body-sm text-[11px] text-on-surface-variant">8 beatmaps · 7K / 4K · Updated 3 days ago
                          </span>
                        </div>
                      </div>
                      <span className="material-symbols-outlined text-outline text-[18px] group-hover:translate-x-0.5 transition-transform">chevron_right
                      </span>
                    </a>
                  </div>
                </div>
                {/* 3. Mode Switch Helper Panel */}
                <div className="w-full rounded-lg bg-surface-container-low p-space-md shadow-md">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="material-symbols-outlined text-primary text-[18px]">motion_photos_on
                    </span>
                    <span className="font-label-md text-label-md text-on-surface font-semibold">Playing another mode?
                    </span>
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mb-space-sm">{' '}Switch the mode circles in the top bar — every analysis and recommendation follows instantly.{' '}
                  </p>
                  {/* Mode Dock Preview Visualizer */}
                  <div className="flex items-center justify-between p-2 rounded-full bg-surface-container">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-[#FF66AA]/20 text-[#FF66AA] flex items-center justify-center font-bold text-[10px]" title="osu!standard">{' '}std{' '}
                      </div>
                      <div className="w-7 h-7 rounded-full bg-[#FF5C39]/20 text-[#FF5C39] flex items-center justify-center font-bold text-[10px]" title="osu!taiko">{' '}tai{' '}
                      </div>
                      <div className="w-7 h-7 rounded-full bg-tertiary-container/30 text-tertiary flex items-center justify-center font-bold text-[10px]" title="osu!catch">{' '}ctb{' '}
                      </div>
                      <div className="w-7 h-7 rounded-full bg-primary-container text-on-primary-container shadow-[0_0_10px_rgba(164,118,255,0.45)] flex items-center justify-center font-bold text-[10px]" title="osu!mania (active)">{' '}mna{' '}
                      </div>
                    </div>
                    <span className="font-label-sm text-[11px] text-primary font-semibold pr-2">Mania Active
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
    </AppShell>
  )
}

// ---------------------------------------------------------------------------
// Real variant (M2): same design, live data for the linked player.
// ---------------------------------------------------------------------------

function DashboardReal({ data, onRefresh }: { data: ProfileData; onRefresh: () => void }) {
  const mode = useModeStore((s) => s.mode)
  const { user, skillProfile: p } = data
  const stats = user.statistics ?? {}
  const drop =
    p.ceilingAccuracy !== null
      ? Math.round((p.comfortAccuracy - p.ceilingAccuracy) * 10) / 10
      : null
  const topPlays = data.topPlays.slice(0, 3)
  const caps = useCapabilities()
  // Snapshots reload after a sync (same snapToken pattern as Stats):
  // the new snapshot row is written best-effort by persistProfile, so
  // the refetch may land just before the insert — the next mount or
  // sync picks it up, matching Stats behaviour.
  const [snapToken, setSnapToken] = useState(0)
  const snapshots = useSnapshots(mode, snapToken)
  const handleRefresh = () => {
    onRefresh()
    setSnapToken((n) => n + 1)
  }

  return (
    <div className="flex flex-col w-full">
      <div className="relative w-full">
        <div className="absolute -top-12 left-1/3 w-96 h-96 bg-primary/10 rounded-full blur-[140px] pointer-events-none -z-10"></div>
        <div className="absolute top-48 right-10 w-72 h-72 bg-secondary/5 rounded-full blur-[110px] pointer-events-none -z-10"></div>
        {/* Profile hero */}
        <div className="relative w-full rounded-lg bg-surface-container-low shadow-xl overflow-hidden mb-space-lg">
          <div className="w-full h-44 bg-cover bg-center relative" style={{ backgroundImage: "url('https://lh3.googleusercontent.com/aida-public/AB6AXuDa5Gd6-otAY9OlG_DpeR4pvH7tHzAQdUnTPg-wqPjFx04URRto6MclmhzcPELrSvs7GoGdvl4u_PpZCUavUzP6Dm7UaTdeujXVuIXIUHlbnSHwguyByff45YUMnZzZ447V5sreYDsVe6ydJCvjXMswBsFrbgfHtkHqB3KLJm3KHg9h1iV2m1g2DNdBlUons_7lBswxS-u72kA91JlNiBIEScja7SGNPCjMrb4u3xkefiWg5VXEsxub')" }}>
            <div className="absolute inset-0 bg-gradient-to-t from-surface-container-low via-surface-container-low/80 to-transparent"></div>
            <div className="absolute inset-0 bg-gradient-to-r from-surface-container-lowest/90 via-surface-container-low/40 to-primary-container/20"></div>
            <div className="absolute top-4 right-6 flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-container-lowest/70 backdrop-blur-md">
              <span className="w-2 h-2 rounded-full bg-[#7EE787] shadow-[0_0_8px_#7EE787]"></span>
              <span className="font-label-sm text-label-sm text-on-surface">osu! {MODE_LABELS[mode].toLowerCase()} live tracking</span>
            </div>
          </div>
          <div className="relative px-space-lg pb-space-lg pt-0">
            <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-space-lg -mt-16">
              <div className="flex flex-col sm:flex-row items-start sm:items-end gap-space-md min-w-0">
                <div className="relative group flex-shrink-0">
                  <div className="w-28 h-28 rounded-full bg-surface-container-high p-1 shadow-[0_0_28px_rgba(164,118,255,0.4)]">
                    <img className="w-full h-full object-cover rounded-full" alt="" src={`https://a.ppy.sh/${user.id}`} />
                  </div>
                  {user.country_code && (
                    <div className="absolute bottom-1 right-1 flex items-center justify-center px-1.5 h-7 rounded-full bg-surface-container-lowest shadow-md">
                      <span className="text-[11px] leading-none font-bold text-on-surface" title={user.country_code}>{user.country_code}</span>
                    </div>
                  )}
                </div>
                <div className="flex flex-col min-w-0">
                  <div className="flex flex-wrap items-center gap-space-xs">
                    <h1 className="font-headline-xl text-headline-xl text-on-surface tracking-tight leading-none">{user.username}</h1>
                    <div className="px-2.5 py-0.5 rounded-full bg-primary-container/30 text-primary font-label-sm text-label-sm font-semibold tracking-wide uppercase">
                      {MODE_LABELS[mode]}{p.mainKeyCount ? ` ${p.mainKeyCount}K` : ''} profile
                    </div>
                    {p.globalRank !== null && (
                      <div className="px-2.5 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant font-label-sm text-label-sm">Global #{fmtInt(p.globalRank)}</div>
                    )}
                  </div>
                  <div className="flex items-baseline gap-3 my-1">
                    <span className="font-metric-display text-metric-display text-primary drop-shadow-[0_0_18px_rgba(210,187,255,0.35)]">{fmtInt(p.pp)}</span>
                    <span className="font-headline-md text-headline-md text-on-surface-variant tracking-normal">pp</span>
                    <span className="font-label-sm text-label-sm text-on-surface-variant pl-2">Weighted: 100% ({MODE_LABELS[mode].toLowerCase()})</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-space-md gap-y-1 font-body-sm text-body-sm text-on-surface-variant">
                    <div className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[16px] text-tertiary">public</span>
                      <span className="text-on-surface font-semibold font-label-md text-label-md">Global {p.globalRank !== null ? `#${fmtInt(p.globalRank)}` : '—'}</span>
                    </div>
                    <span className="text-outline-variant">·</span>
                    <div className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[16px] text-secondary">flag</span>
                      <span className="text-on-surface font-semibold font-label-md text-label-md">Country {p.countryRank !== null ? `#${fmtInt(p.countryRank)}` : '—'}</span>
                    </div>
                    <span className="text-outline-variant">·</span>
                    <div className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[16px] text-[#7EE787]">track_changes</span>
                      <span className="text-on-surface font-semibold font-label-md text-label-md">Accuracy {fmtAcc(p.accuracy)}</span>
                    </div>
                    <span className="text-outline-variant">·</span>
                    <div className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[16px] text-primary">equalizer</span>
                      <span className="text-on-surface font-semibold font-label-md text-label-md">{fmtInt(p.playCount)} plays</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-space-sm pt-2 xl:pt-0">
                <button className="flex items-center gap-2 px-space-md py-2.5 rounded-full bg-primary-container text-on-primary-container font-label-md text-label-md font-semibold hover:brightness-110 active:scale-95 transition-all shadow-[0_0_16px_rgba(164,118,255,0.3)]" type="button" onClick={handleRefresh}>
                  <span className="material-symbols-outlined text-[18px]">sync</span>
                  <span>Sync now</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {p.isStarter ? (
          <div className="w-full rounded-lg bg-surface-container-low p-space-lg shadow-md">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2.5 h-2.5 rounded-full bg-secondary shadow-[0_0_8px_rgba(255,176,204,0.7)]"></span>
              <h2 className="font-headline-md text-headline-md text-on-surface">Not enough {MODE_LABELS[mode]} plays yet</h2>
            </div>
            <p className="font-body-md text-body-md text-on-surface-variant max-w-2xl">
              {user.username} has no recorded top plays in {MODE_LABELS[mode]}, so there is no personal
              skill profile to show for this mode. Recommendations for {MODE_LABELS[mode]} use starter
              picks (popular Ranked maps around {fmtSr(p.comfortSrMin)}–{fmtSr(p.comfortSrMax)}★) — clearly
              not personalised. Play some {MODE_LABELS[mode]} and sync again to build the real profile.
            </p>
            <div className="flex flex-wrap gap-2 mt-4">
              <span className="px-3 py-1.5 rounded-full bg-surface-container-high text-on-surface font-label-sm text-label-sm">Starter comfort band: {fmtSr(p.comfortSrMin)}–{fmtSr(p.comfortSrMax)}★</span>
              <span className="px-3 py-1.5 rounded-full bg-surface-container-high text-on-surface font-label-sm text-label-sm">Starter tempo: {p.bpmSweetMin}–{p.bpmSweetMax} BPM</span>
              <span className="px-3 py-1.5 rounded-full bg-surface-container-high text-on-surface font-label-sm text-label-sm">Play count in mode: {fmtInt(stats.play_count ?? 0)}</span>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg">
            <div className="lg:col-span-8 flex flex-col gap-space-lg">
              <div className="w-full rounded-lg bg-surface-container-low p-space-lg shadow-md relative overflow-hidden">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm mb-space-md">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-primary shadow-[0_0_8px_rgba(210,187,255,0.8)]"></span>
                      <h2 className="font-headline-md text-headline-md text-on-surface">Your skill gap</h2>
                    </div>
                    <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">Accuracy degradation across star difficulties ({MODE_LABELS[mode]})</p>
                  </div>
                  {drop !== null && (
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-container-high text-on-surface">
                      <span className="material-symbols-outlined text-secondary text-[16px]">crisis_alert</span>
                      <span className="font-label-sm text-label-sm">Collapse point detected: <strong className="text-secondary font-bold">{fmtSr(p.srCeiling)}★</strong> (-{drop.toFixed(1)}% drop)</span>
                    </div>
                  )}
                </div>
                <AccBandChart profile={p} />
                <div className="mt-space-sm pt-space-xs flex flex-wrap items-center justify-between gap-2 font-body-sm text-body-sm text-on-surface-variant">
                  <span className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-primary text-[16px]">info</span>
                    Analysis derived from your top {p.topPlayCount} plays in {MODE_LABELS[mode]}.
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-space-md">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-secondary shadow-[0_0_8px_rgba(255,176,204,0.7)]"></span>
                  <h2 className="font-headline-md text-headline-md text-on-surface">Your top plays</h2>
                </div>
                {topPlays.map((play) => (
                  <div key={play.id ?? play.beatmap?.id} className="group relative rounded-full bg-surface-container-low hover:bg-surface-container-high transition-all p-2 pr-space-lg flex items-center justify-between gap-space-md shadow-sm">
                    <div className="flex items-center gap-space-md min-w-0 flex-1">
                      <div className="relative flex-shrink-0 w-14 h-14 rounded-full p-0.5 bg-primary/40 shadow-[0_0_12px_rgba(164,118,255,0.4)]">
                        <img className="w-full h-full object-cover rounded-full" alt="" src={play.beatmapset?.covers?.card ?? ''} />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-headline-sm text-headline-sm text-on-surface truncate">{play.beatmapset?.title ?? 'Unknown map'}</span>
                          <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container-highest">
                            <span className="text-[#FFCC22] text-[12px] leading-none">★</span>
                            <span className="font-label-sm text-[11px] font-bold text-[#FFCC22]">{play.beatmap?.difficulty_rating.toFixed(2)}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 font-body-sm text-body-sm text-on-surface-variant truncate">
                          <span className="text-on-surface">{play.beatmapset?.artist}</span>
                          <span>·</span>
                          <span>{play.beatmap?.bpm} BPM</span>
                          <span>·</span>
                          <span>{(play.accuracy * 100).toFixed(2)}% acc</span>
                          <span>·</span>
                          <span>{play.pp ? `${Math.round(play.pp)} pp` : ''}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:col-span-4 flex flex-col gap-space-lg">
              <div className="w-full rounded-lg bg-surface-container-low p-space-lg shadow-md">
                <div className="flex items-center justify-between mb-space-md">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center">
                      <span className="font-headline-sm text-[11px] leading-none">{MODE_LABELS[mode].slice(0, 3).toLowerCase()}</span>
                    </div>
                    <h3 className="font-headline-sm text-headline-sm text-on-surface">Skill profile</h3>
                  </div>
                  <span className="font-label-sm text-label-sm text-primary font-semibold">Active Model</span>
                </div>
                <div className="flex flex-col gap-space-md">
                  <div className="p-space-sm rounded-DEFAULT bg-surface-container flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <span className="font-label-md text-label-md text-on-surface">Comfort band</span>
                      <span className="font-label-md text-label-md text-[#7EE787] font-bold">{fmtSr(p.comfortSrMin)}–{fmtSr(p.comfortSrMax)}★</span>
                    </div>
                    <span className="font-body-sm text-body-sm text-on-surface-variant">{fmtAcc(p.comfortAccuracy)} average accuracy inside the band</span>
                  </div>
                  <div className="p-space-sm rounded-DEFAULT bg-surface-container flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <span className="font-label-md text-label-md text-on-surface">Accuracy ceiling</span>
                      <span className="font-label-md text-label-md text-secondary font-bold">{fmtSr(p.srCeiling)}★</span>
                    </div>
                    <span className="font-body-sm text-body-sm text-on-surface-variant">{p.ceilingAccuracy !== null ? `${fmtAcc(p.ceilingAccuracy)} accuracy at and above it` : 'Not reached in your top plays yet'}</span>
                  </div>
                  <div className="p-space-sm rounded-DEFAULT bg-surface-container flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <span className="font-label-md text-label-md text-on-surface">Best tempo</span>
                      <span className="font-label-md text-label-md text-tertiary font-bold">{p.bpmSweetMin}–{p.bpmSweetMax} BPM</span>
                    </div>
                    <span className="font-body-sm text-body-sm text-on-surface-variant">Mean {p.bpmMean} BPM across your top plays</span>
                  </div>
                  {mode === 'mania' && p.mainKeyCount !== null && (
                    <div className="p-space-sm rounded-DEFAULT bg-surface-container flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <span className="font-label-md text-label-md text-on-surface">Main key count</span>
                        <span className="font-label-md text-label-md text-primary font-bold">{p.mainKeyCount}K</span>
                      </div>
                      <span className="font-body-sm text-body-sm text-on-surface-variant">{p.keySharePct}% of your top plays use this layout</span>
                    </div>
                  )}
                  {p.playstyleTags.length > 0 && (
                    <div className="p-space-sm rounded-DEFAULT bg-surface-container flex flex-col gap-1">
                      <span className="font-label-md text-label-md text-on-surface">Playstyle tags</span>
                      <div className="flex flex-wrap gap-1.5">
                        {p.playstyleTags.map((tag) => (
                          <span key={tag} className="px-2.5 py-1 rounded-full bg-surface-container-high text-on-surface font-label-sm text-label-sm">{tag}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
        {/* Recent plays (§AJ): below the main grid so it shows for
            starters too — same left-column width as the top plays. */}
        <div className="mt-space-lg grid grid-cols-1 lg:grid-cols-12 gap-space-lg">
          <div className="lg:col-span-8">
            <RecentPlaysSection
              plays={data.recentPlays}
              currentPp={p.pp}
              snapshots={snapshots}
              isAccount={caps.isAccount}
              modeLabel={MODE_LABELS[mode]}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const mode = useModeStore((s) => s.mode)
  const { tier } = useAuth()
  const { status, data, identity, refresh } = useProfileData(mode)

  if (status === 'demo' || status === 'error' || !data) {
    if (status === 'loading') {
      return (
        <AppShell
          identity={{
            username: identity?.username ?? 'Loading…',
            pp: null,
            tierLabel: tier === 'account' ? 'account' : tier === 'guest' ? 'guest' : 'free tier',
          }}
        >
          <LoadingState label={`Loading your ${MODE_LABELS[mode]} profile from osu!…`} />
        </AppShell>
      )
    }
    return <DashboardDemo />
  }

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
      <DashboardReal data={data} onRefresh={refresh} />
    </AppShell>
  )
}
