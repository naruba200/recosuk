// Converted from Stitch export: stitch-raw/07-stats.html
// M2: the exported markup below is the DEMO variant (sora_playz),
// rendered unchanged when nothing is linked. The real variant at the
// bottom renders the same design language with live per-mode data,
// the interpretation layer, top plays, and snapshot history.
import { useState } from 'react'
import AppShell from '../components/AppShell'
import LoadingState from '../components/LoadingState'
import AccBandChart from '../components/AccBandChart'
import StatCards from '../components/StatCards'
import LockedButton from '../components/LockedButton'
import { useProfileData, useSnapshots, type ProfileData } from '../lib/profileService'
import { useModeStore } from '../lib/modeStore'
import { MODE_LABELS } from '../lib/mode'
import { fmtAcc, fmtInt, interpretProfile } from '../lib/interpretations'
import { useAuth } from '../lib/auth'
import { useCapabilities } from '../lib/capabilities'

// Identity shown by the demo fallback variant: sample data, not a real player.
const DEMO_IDENTITY = {
  username: 'sora_playz',
  pp: 5284,
  countryCode: 'VN',
  tierLabel: 'free tier',
}

function StatsDemo() {
  return (
    <AppShell identity={DEMO_IDENTITY}>
        <div className="flex flex-col w-full">
          {/* Active Tab Sidebar Override Script for Visual Integrity */}
          {/* Top Page Header Bar */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-md pb-space-lg">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-space-sm">
                <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">Stats — Mania
                </h1>
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary-container/25 text-primary">
                  <span className="w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_rgba(210,187,255,0.8)]">
                  </span>
                  <span className="font-label-sm text-label-sm uppercase tracking-wider font-bold">7K Focused
                  </span>
                </div>
                <div className="hidden sm:flex items-center bg-surface-container-high px-2.5 py-1 rounded-full text-on-surface-variant">
                  <span className="font-label-sm text-label-sm">4K/7K Split: 18% / 82%
                  </span>
                </div>
              </div>
              <p className="font-body-md text-body-md text-on-surface-variant">In-depth performance tracking and skill degradation analysis
              </p>
            </div>
            {/* Right Side Actions & Sync Telemetry */}
            <div className="flex flex-wrap items-center gap-space-md">
              <div className="flex flex-col text-left lg:text-right">
                <div className="flex items-center lg:justify-end gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#7EE787] shadow-[0_0_6px_rgba(126,231,135,0.8)]">
                  </span>
                  <span className="font-label-sm text-label-sm text-on-surface font-medium">Last refreshed today at 14:20
                  </span>
                </div>
                <span className="font-label-sm text-[10px] text-on-surface-variant">API Bancho poll rate: 15s latency
                </span>
              </div>
              <button className="group relative flex items-center gap-space-xs px-space-md py-2.5 rounded-full bg-primary-container text-on-primary-container font-label-md text-label-md shadow-[0_4px_20px_rgba(164,118,255,0.35)] hover:shadow-[0_4px_26px_rgba(164,118,255,0.55)] active:scale-[0.98] transition-all" id="refresh-btn" type="button">
                <span className="material-symbols-outlined text-[18px] group-hover:rotate-180 transition-transform duration-500">sync
                </span>
                <span>Refresh from osu!
                </span>
              </button>
            </div>
          </div>
          {/* Headline Numbers Banner Strip */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-space-md mb-space-xl">
            {/* Stat 1: PP Metric */}
            <div className="relative overflow-hidden p-space-md rounded-DEFAULT bg-surface-container-low shadow-[0_4px_16px_rgba(0,0,0,0.35)]">
              <div className="absolute -right-6 -bottom-6 w-24 h-24 rounded-full bg-primary/10 blur-xl pointer-events-none">
              </div>
              <div className="flex items-center justify-between text-on-surface-variant mb-1">
                <span className="font-label-sm text-label-sm uppercase tracking-wider">Performance Points
                </span>
                <span className="material-symbols-outlined text-primary text-[18px]">bolt
                </span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="font-metric-display text-metric-display text-primary tracking-tight leading-none">5,284
                </span>
                <span className="font-label-sm text-label-sm text-on-surface-variant">pp
                </span>
              </div>
              <div className="flex items-center gap-1 mt-2 text-[#7EE787]">
                <span className="material-symbols-outlined text-[15px] leading-none">trending_up
                </span>
                <span className="font-label-sm text-label-sm font-semibold">+124 pp
                </span>
                <span className="font-label-sm text-label-sm text-on-surface-variant">this month
                </span>
              </div>
            </div>
            {/* Stat 2: Global & Country Rank */}
            <div className="relative overflow-hidden p-space-md rounded-DEFAULT bg-surface-container-low shadow-[0_4px_16px_rgba(0,0,0,0.35)]">
              <div className="flex items-center justify-between text-on-surface-variant mb-1">
                <span className="font-label-sm text-label-sm uppercase tracking-wider">Global Ranking
                </span>
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary-container text-secondary font-label-sm text-[10px] font-bold">
                  <span>VN
                  </span>
                  <span>#142
                  </span>
                </div>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="font-metric-display text-metric-display text-on-surface tracking-tight leading-none">#18,942
                </span>
              </div>
              <div className="flex items-center gap-1 mt-2 text-[#7EE787]">
                <span className="material-symbols-outlined text-[15px] leading-none">arrow_upward
                </span>
                <span className="font-label-sm text-label-sm font-semibold">▲ 614 ranks
                </span>
                <span className="font-label-sm text-label-sm text-on-surface-variant">peak #17,810
                </span>
              </div>
            </div>
            {/* Stat 3: Accuracy */}
            <div className="relative overflow-hidden p-space-md rounded-DEFAULT bg-surface-container-low shadow-[0_4px_16px_rgba(0,0,0,0.35)]">
              <div className="flex items-center justify-between text-on-surface-variant mb-1">
                <span className="font-label-sm text-label-sm uppercase tracking-wider">Hit Accuracy
                </span>
                <span className="material-symbols-outlined text-tertiary text-[18px]">adjust
                </span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="font-metric-display text-metric-display text-on-surface tracking-tight leading-none">96.84%
                </span>
              </div>
              <div className="flex items-center gap-1 mt-2 text-[#7EE787]">
                <span className="material-symbols-outlined text-[15px] leading-none">trending_up
                </span>
                <span className="font-label-sm text-label-sm font-semibold">+0.18%
                </span>
                <span className="font-label-sm text-label-sm text-on-surface-variant">rolling 50 plays
                </span>
              </div>
            </div>
            {/* Stat 4: Plays */}
            <div className="relative overflow-hidden p-space-md rounded-DEFAULT bg-surface-container-low shadow-[0_4px_16px_rgba(0,0,0,0.35)]">
              <div className="flex items-center justify-between text-on-surface-variant mb-1">
                <span className="font-label-sm text-label-sm uppercase tracking-wider">Total Plays
                </span>
                <span className="material-symbols-outlined text-on-surface-variant text-[18px]">play_circle
                </span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="font-metric-display text-metric-display text-on-surface tracking-tight leading-none">12,430
                </span>
              </div>
              <div className="flex items-center gap-1 mt-2 text-on-surface-variant">
                <span className="font-label-sm text-label-sm font-medium text-on-surface">682
                </span>
                <span className="font-label-sm text-label-sm">clears this week
                </span>
              </div>
            </div>
            {/* Stat 5: Hours Played */}
            <div className="relative overflow-hidden p-space-md rounded-DEFAULT bg-surface-container-low shadow-[0_4px_16px_rgba(0,0,0,0.35)] col-span-2 md:col-span-1">
              <div className="flex items-center justify-between text-on-surface-variant mb-1">
                <span className="font-label-sm text-label-sm uppercase tracking-wider">Time on Stage
                </span>
                <span className="material-symbols-outlined text-on-surface-variant text-[18px]">timer
                </span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="font-metric-display text-metric-display text-on-surface tracking-tight leading-none">214
                </span>
                <span className="font-headline-sm text-headline-sm text-on-surface-variant">hrs
                </span>
              </div>
              <div className="flex items-center gap-1 mt-2 text-primary font-label-sm text-label-sm font-medium">
                <span>Level 94
                </span>
                <span className="text-on-surface-variant">• 44% to L95
                </span>
              </div>
            </div>
          </div>
          {/* Primary Two-Column Rhythm Workspace */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-start">
            {/* LEFT COLUMN (Wider ~60% -> col-span-7) */}
            <div className="lg:col-span-7 flex flex-col gap-space-lg">
              {/* a) Accuracy by Star Rating Chart */}
              <div className="relative p-space-lg rounded-DEFAULT bg-surface-container-low shadow-[0_4px_24px_rgba(0,0,0,0.4)] overflow-hidden">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-space-md">
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary text-[20px]">bar_chart
                      </span>
                      <h2 className="font-headline-sm text-headline-sm text-on-surface">Accuracy by Star Rating Band
                      </h2>
                    </div>
                    <p className="font-body-sm text-body-sm text-on-surface-variant">Rolling performance analysis across calibrated difficulty bands
                    </p>
                  </div>
                  <div className="flex items-center gap-2 self-start sm:self-auto">
                    <span className="px-2.5 py-1 rounded-full bg-surface-container-high text-on-surface-variant font-label-sm text-label-sm">Sample: 420 ranked maps
                    </span>
                  </div>
                </div>
                {/* Chart Visualization Area */}
                <div className="relative mt-space-md pt-6 pb-2">
                  {/* Threshold Indicators */}
                  <div className="absolute inset-x-0 top-[28%] pointer-events-none flex items-center z-10">
                    <div className="w-full border-b border-dashed border-[#7EE787]/40">
                    </div>
                    <span className="shrink-0 pl-2 font-label-sm text-[10px] text-[#7EE787] bg-surface-container-low/90 px-1 rounded">97.0% Comfort Baseline
                    </span>
                  </div>
                  <div className="absolute inset-x-0 top-[52%] pointer-events-none flex items-center z-10">
                    <div className="w-full border-b border-dashed border-secondary/40">
                    </div>
                    <span className="shrink-0 pl-2 font-label-sm text-[10px] text-secondary bg-surface-container-low/90 px-1 rounded">95.0% Pass Target
                    </span>
                  </div>
                  {/* Target Training Zone Highlight Column Backdrop */}
                  <div className="absolute right-0 top-0 bottom-8 w-[42%] bg-primary/5 rounded-DEFAULT pointer-events-none flex flex-col items-center justify-start pt-1">
                    <span className="px-2 py-0.5 rounded-full bg-primary-container text-on-primary-container font-label-sm text-[10px] uppercase font-bold tracking-wider shadow-[0_0_12px_rgba(164,118,255,0.4)]">{' '}Target Training Zone{' '}
                    </span>
                  </div>
                  {/* SVG Star Bands Bar Chart */}
                  <svg className="w-full h-56 overflow-visible" preserveAspectRatio="none" viewBox="0 0 640 220">
                    <defs>
                      {/* Stable Green Gradient */}
                      <linearGradient id="accGreenGrad" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#7EE787">
                        </stop>
                        <stop offset="100%" stopColor="#3d8f45">
                        </stop>
                      </linearGradient>
                      {/* Transition Amber Gradient */}
                      <linearGradient id="accAmberGrad" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#FFCC22">
                        </stop>
                        <stop offset="100%" stopColor="#9d7803">
                        </stop>
                      </linearGradient>
                      {/* Target Collapse Mania Glow Gradient */}
                      <linearGradient id="accTargetGrad" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#d2bbff">
                        </stop>
                        <stop offset="60%" stopColor="#a476ff">
                        </stop>
                        <stop offset="100%" stopColor="#4f18b3">
                        </stop>
                      </linearGradient>
                      <filter height="140%" id="purpleGlow" width="140%" x="-20%" y="-20%">
                        <feGaussianBlur result="blur" stdDeviation="6">
                        </feGaussianBlur>
                        <feComposite in="SourceGraphic" in2="blur" operator="over">
                        </feComposite>
                      </filter>
                    </defs>
                    {/* Grid Lines */}
                    <line stroke="#35284D" strokeOpacity="0.5" strokeWidth="1" x1="0" x2="640" y1="20" y2="20">
                    </line>
                    <line stroke="#35284D" strokeOpacity="0.5" strokeWidth="1" x1="0" x2="640" y1="65" y2="65">
                    </line>
                    <line stroke="#35284D" strokeOpacity="0.5" strokeWidth="1" x1="0" x2="640" y1="115" y2="115">
                    </line>
                    <line stroke="#35284D" strokeOpacity="0.5" strokeWidth="1" x1="0" x2="640" y1="165" y2="165">
                    </line>
                    {/* Bars */}
                    {/* 1: 3.5 - 3.9★ (98.9%) */}
                    <g className="cursor-pointer transition-transform hover:opacity-90">
                      <rect fill="url(#accGreenGrad)" height="156" rx="8" width="60" x="20" y="24">
                      </rect>
                      <text fill="#7EE787" fontFamily="Outfit" fontSize="12" fontWeight="700" textAnchor="middle" x="50" y="16">98.9%
                      </text>
                      <text fill="#ccc3d6" fontFamily="Inter" fontSize="11" textAnchor="middle" x="50" y="200">3.5–3.9★
                      </text>
                    </g>
                    {/* 2: 4.0 - 4.3★ (98.4%) */}
                    <g className="cursor-pointer transition-transform hover:opacity-90">
                      <rect fill="url(#accGreenGrad)" height="148" rx="8" width="60" x="108" y="32">
                      </rect>
                      <text fill="#7EE787" fontFamily="Outfit" fontSize="12" fontWeight="700" textAnchor="middle" x="138" y="24">98.4%
                      </text>
                      <text fill="#ccc3d6" fontFamily="Inter" fontSize="11" textAnchor="middle" x="138" y="200">4.0–4.3★
                      </text>
                    </g>
                    {/* 3: 4.4 - 4.7★ (97.8%) */}
                    <g className="cursor-pointer transition-transform hover:opacity-90">
                      <rect fill="url(#accGreenGrad)" height="136" rx="8" width="60" x="196" y="44">
                      </rect>
                      <text fill="#7EE787" fontFamily="Outfit" fontSize="12" fontWeight="700" textAnchor="middle" x="226" y="36">97.8%
                      </text>
                      <text fill="#ccc3d6" fontFamily="Inter" fontSize="11" textAnchor="middle" x="226" y="200">4.4–4.7★
                      </text>
                    </g>
                    {/* 4: 4.8 - 4.9★ (96.7%) */}
                    <g className="cursor-pointer transition-transform hover:opacity-90">
                      <rect fill="url(#accAmberGrad)" height="114" rx="8" width="60" x="284" y="66">
                      </rect>
                      <text fill="#FFCC22" fontFamily="Outfit" fontSize="12" fontWeight="700" textAnchor="middle" x="314" y="58">96.7%
                      </text>
                      <text fill="#ccc3d6" fontFamily="Inter" fontSize="11" textAnchor="middle" x="314" y="200">4.8–4.9★
                      </text>
                    </g>
                    {/* 5: 5.0 - 5.2★ (94.2% - Drop band) */}
                    <g className="cursor-pointer transition-transform hover:opacity-90" filter="url(#purpleGlow)">
                      <rect fill="url(#accTargetGrad)" height="76" rx="8" width="60" x="372" y="104">
                      </rect>
                      <text fill="#d2bbff" fontFamily="Outfit" fontSize="12" fontWeight="800" textAnchor="middle" x="402" y="96">94.2%
                      </text>
                      <text fill="#d2bbff" fontFamily="Inter" fontSize="11" fontWeight="700" textAnchor="middle" x="402" y="200">5.0–5.2★
                      </text>
                    </g>
                    {/* 6: 5.3 - 5.5★ (92.1%) */}
                    <g className="cursor-pointer transition-transform hover:opacity-90" filter="url(#purpleGlow)">
                      <rect fill="url(#accTargetGrad)" height="52" rx="8" width="60" x="460" y="128">
                      </rect>
                      <text fill="#d2bbff" fontFamily="Outfit" fontSize="12" fontWeight="800" textAnchor="middle" x="490" y="120">92.1%
                      </text>
                      <text fill="#d2bbff" fontFamily="Inter" fontSize="11" fontWeight="700" textAnchor="middle" x="490" y="200">5.3–5.5★
                      </text>
                    </g>
                    {/* 7: 5.6★+ (88.6%) */}
                    <g className="cursor-pointer transition-transform hover:opacity-90" filter="url(#purpleGlow)">
                      <rect fill="url(#accTargetGrad)" height="32" rx="8" width="60" x="548" y="148">
                      </rect>
                      <text fill="#ffb0cc" fontFamily="Outfit" fontSize="12" fontWeight="800" textAnchor="middle" x="578" y="140">88.6%
                      </text>
                      <text fill="#ffb0cc" fontFamily="Inter" fontSize="11" fontWeight="700" textAnchor="middle" x="578" y="200">5.6★+
                      </text>
                    </g>
                  </svg>
                </div>
                {/* Star Rating Insight Caption */}
                <div className="mt-space-md p-space-sm rounded-DEFAULT bg-surface-container flex items-start gap-space-sm">
                  <span className="material-symbols-outlined text-primary text-[20px] shrink-0 mt-0.5">crisis_alert
                  </span>
                  <div className="flex flex-col">
                    <span className="font-label-md text-label-md text-on-surface font-semibold">Degradation Analysis
                    </span>
                    <p className="font-body-sm text-body-sm text-on-surface-variant">Accuracy drops 6.6% past 5.0★ due to release timing instability in dense chordstreams.
                    </p>
                  </div>
                </div>
              </div>
              {/* b) "Progress" Line Chart (6 Months PP Trajectory) */}
              <div className="relative p-space-lg rounded-DEFAULT bg-surface-container-low shadow-[0_4px_24px_rgba(0,0,0,0.4)]">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-space-md">
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-tertiary text-[20px]">show_chart
                      </span>
                      <h2 className="font-headline-sm text-headline-sm text-on-surface">Performance Progress (6 Months)
                      </h2>
                    </div>
                    <p className="font-body-sm text-body-sm text-on-surface-variant">Continuous net pp progression from calibrated submission milestones
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary-container/20 text-primary font-label-sm text-label-sm">
                      <span className="material-symbols-outlined text-[14px]">lock
                      </span>{' '}Account synced{' '}
                    </span>
                  </div>
                </div>
                {/* PP Trajectory Visualizer */}
                <div className="relative w-full h-48 mt-2">
                  <svg className="w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 600 180">
                    <defs>
                      <linearGradient id="ppAreaGrad" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#a476ff" stopOpacity="0.35">
                        </stop>
                        <stop offset="100%" stopColor="#a476ff" stopOpacity="0.0">
                        </stop>
                      </linearGradient>
                    </defs>
                    {/* Horizontal guidelines */}
                    <line stroke="#35284D" strokeOpacity="0.3" strokeWidth="1" x1="40" x2="580" y1="20" y2="20">
                    </line>
                    <line stroke="#35284D" strokeOpacity="0.3" strokeWidth="1" x1="40" x2="580" y1="65" y2="65">
                    </line>
                    <line stroke="#35284D" strokeOpacity="0.3" strokeWidth="1" x1="40" x2="580" y1="110" y2="110">
                    </line>
                    <line stroke="#35284D" strokeOpacity="0.3" strokeWidth="1" x1="40" x2="580" y1="150" y2="150">
                    </line>
                    {/* Y Axis Labels */}
                    <text fill="#958d9f" fontFamily="Inter" fontSize="10" textAnchor="end" x="30" y="24">5.3k
                    </text>
                    <text fill="#958d9f" fontFamily="Inter" fontSize="10" textAnchor="end" x="30" y="69">5.0k
                    </text>
                    <text fill="#958d9f" fontFamily="Inter" fontSize="10" textAnchor="end" x="30" y="114">4.8k
                    </text>
                    <text fill="#958d9f" fontFamily="Inter" fontSize="10" textAnchor="end" x="30" y="154">4.6k
                    </text>
                    {/* Closed Area Fill */}
                    <polygon fill="url(#ppAreaGrad)" points="60,150 160,132 260,98 360,82 460,46 560,20 560,160 60,160">
                    </polygon>
                    {/* Spline Line */}
                    <polyline fill="none" points="60,150 160,132 260,98 360,82 460,46 560,20" stroke="#d2bbff" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3">
                    </polyline>
                    {/* Data Point Circles & Tooltip Markers */}
                    {/* Nov: 4,610 */}
                    <circle cx="60" cy="150" fill="#161020" r="4" stroke="#d2bbff" strokeWidth="2.5">
                    </circle>
                    <text fill="#ccc3d6" fontFamily="Inter" fontSize="11" textAnchor="middle" x="60" y="174">Nov
                    </text>
                    {/* Dec: 4,730 */}
                    <circle cx="160" cy="132" fill="#161020" r="4" stroke="#d2bbff" strokeWidth="2.5">
                    </circle>
                    <text fill="#ccc3d6" fontFamily="Inter" fontSize="11" textAnchor="middle" x="160" y="174">Dec
                    </text>
                    {/* Jan: 4,890 */}
                    <circle cx="260" cy="98" fill="#161020" r="4" stroke="#d2bbff" strokeWidth="2.5">
                    </circle>
                    <text fill="#ccc3d6" fontFamily="Inter" fontSize="11" textAnchor="middle" x="260" y="174">Jan
                    </text>
                    {/* Feb: 4,990 */}
                    <circle cx="360" cy="82" fill="#161020" r="4" stroke="#d2bbff" strokeWidth="2.5">
                    </circle>
                    <text fill="#ccc3d6" fontFamily="Inter" fontSize="11" textAnchor="middle" x="360" y="174">Feb
                    </text>
                    {/* Mar: 5,140 */}
                    <circle cx="460" cy="46" fill="#161020" r="4" stroke="#d2bbff" strokeWidth="2.5">
                    </circle>
                    <text fill="#ccc3d6" fontFamily="Inter" fontSize="11" textAnchor="middle" x="460" y="174">Mar
                    </text>
                    {/* Apr: 5,284 (Current Milestone) */}
                    <circle cx="560" cy="20" fill="#a476ff" r="6" stroke="#eaddff" strokeWidth="3">
                    </circle>
                    <text fill="#d2bbff" fontFamily="Inter" fontSize="11" fontWeight="700" textAnchor="middle" x="560" y="174">Apr
                    </text>
                  </svg>
                </div>
                <div className="flex items-center justify-between pt-2">
                  <span className="font-body-sm text-body-sm text-on-surface-variant flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[15px] text-primary">cloud_done
                    </span>{' '}Saved each time you refresh — guests don't keep history{' '}
                  </span>
                  <span className="font-label-sm text-label-sm text-primary font-bold">+674 pp total growth
                  </span>
                </div>
              </div>
              {/* c) "Grades" Panel */}
              <div className="p-space-lg rounded-DEFAULT bg-surface-container-low shadow-[0_4px_24px_rgba(0,0,0,0.4)]">
                <div className="flex items-center justify-between mb-space-md">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-secondary text-[20px]">workspace_premium
                    </span>
                    <h2 className="font-headline-sm text-headline-sm text-on-surface">Rhythm Clears & Grade Weights
                    </h2>
                  </div>
                  <span className="font-label-sm text-label-sm text-on-surface-variant">985 ranked pass records
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-space-sm mb-space-md">
                  {/* Grade SS */}
                  <div className="flex flex-col items-center justify-center p-space-sm rounded-DEFAULT bg-surface-container-high/60 relative overflow-hidden group">
                    <div className="absolute inset-0 bg-tertiary/10 opacity-0 group-hover:opacity-100 transition-opacity">
                    </div>
                    <span className="font-headline-md text-headline-md text-tertiary font-black tracking-wider drop-shadow-[0_0_12px_rgba(128,208,255,0.45)]">SS
                    </span>
                    <span className="font-metric-sm text-metric-sm text-on-surface font-bold mt-1">48
                    </span>
                    <span className="font-label-sm text-[10px] text-tertiary uppercase font-semibold">100% Acc
                    </span>
                  </div>
                  {/* Grade S */}
                  <div className="flex flex-col items-center justify-center p-space-sm rounded-DEFAULT bg-surface-container-high/60 relative overflow-hidden group">
                    <div className="absolute inset-0 bg-[#FFCC22]/10 opacity-0 group-hover:opacity-100 transition-opacity">
                    </div>
                    <span className="font-headline-md text-headline-md text-[#FFCC22] font-black tracking-wider drop-shadow-[0_0_12px_rgba(255,204,34,0.45)]">S
                    </span>
                    <span className="font-metric-sm text-metric-sm text-on-surface font-bold mt-1">312
                    </span>
                    <span className="font-label-sm text-[10px] text-[#FFCC22] uppercase font-semibold">{'>'} 95% Acc
                    </span>
                  </div>
                  {/* Grade A */}
                  <div className="flex flex-col items-center justify-center p-space-sm rounded-DEFAULT bg-surface-container-high/60 relative overflow-hidden group">
                    <div className="absolute inset-0 bg-[#7EE787]/10 opacity-0 group-hover:opacity-100 transition-opacity">
                    </div>
                    <span className="font-headline-md text-headline-md text-[#7EE787] font-black tracking-wider drop-shadow-[0_0_12px_rgba(126,231,135,0.45)]">A
                    </span>
                    <span className="font-metric-sm text-metric-sm text-on-surface font-bold mt-1">529
                    </span>
                    <span className="font-label-sm text-[10px] text-[#7EE787] uppercase font-semibold">{'>'} 90% Acc
                    </span>
                  </div>
                  {/* Grade B */}
                  <div className="flex flex-col items-center justify-center p-space-sm rounded-DEFAULT bg-surface-container-high/60 relative overflow-hidden group">
                    <div className="absolute inset-0 bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity">
                    </div>
                    <span className="font-headline-md text-headline-md text-primary font-black tracking-wider">B
                    </span>
                    <span className="font-metric-sm text-metric-sm text-on-surface font-bold mt-1">84
                    </span>
                    <span className="font-label-sm text-[10px] text-primary uppercase font-semibold">{'>'} 80% Acc
                    </span>
                  </div>
                  {/* Grade C */}
                  <div className="flex flex-col items-center justify-center p-space-sm rounded-DEFAULT bg-surface-container-high/60 relative overflow-hidden group col-span-2 sm:col-span-1">
                    <span className="font-headline-md text-headline-md text-on-surface-variant font-black tracking-wider">C
                    </span>
                    <span className="font-metric-sm text-metric-sm text-on-surface font-bold mt-1">12
                    </span>
                    <span className="font-label-sm text-[10px] text-on-surface-variant uppercase font-semibold">{'>'} 70% Acc
                    </span>
                  </div>
                </div>
                {/* Grade Distribution Progress Track */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between font-label-sm text-[10px] text-on-surface-variant uppercase font-semibold">
                    <span>Accuracy Tier Weighting
                    </span>
                    <span>90.2% Clean Passes (A+)
                    </span>
                  </div>
                  <div className="h-2.5 w-full bg-surface-container-high rounded-full overflow-hidden flex">
                    <div className="h-full bg-tertiary" style={{ width: "5%" }}>
                    </div>
                    <div className="h-full bg-[#FFCC22]" style={{ width: "32%" }}>
                    </div>
                    <div className="h-full bg-[#7EE787]" style={{ width: "53%" }}>
                    </div>
                    <div className="h-full bg-primary" style={{ width: "8.5%" }}>
                    </div>
                    <div className="h-full bg-outline-variant" style={{ width: "1.5%" }}>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            {/* RIGHT COLUMN (~40% -> col-span-5) */}
            <div className="lg:col-span-5 flex flex-col gap-space-lg">
              {/* a) Top Plays Section */}
              <div className="p-space-lg rounded-DEFAULT bg-surface-container-low shadow-[0_4px_24px_rgba(0,0,0,0.4)]">
                <div className="flex items-center justify-between mb-space-md">
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-secondary text-[20px]">military_tech
                      </span>
                      <h2 className="font-headline-sm text-headline-sm text-on-surface">Top Plays
                      </h2>
                    </div>
                    <span className="font-label-sm text-label-sm text-on-surface-variant">Weighted pp value distribution
                    </span>
                  </div>
                  <a className="font-label-sm text-label-sm text-primary hover:underline flex items-center gap-0.5" data-path="recommendations" href="#">
                    <span>View all
                    </span>
                    <span className="material-symbols-outlined text-[14px]">arrow_forward
                    </span>
                  </a>
                </div>
                {/* 5 Signature osu! Slider-Shaped Rows */}
                <div className="flex flex-col gap-space-sm">
                  {/* Play 1 */}
                  <div className="group relative flex items-center justify-between p-space-sm rounded-full bg-surface-container hover:bg-surface-container-high transition-all">
                    <div className="flex items-center gap-space-sm min-w-0 pr-2">
                      <div className="relative w-11 h-11 rounded-full overflow-hidden flex-shrink-0 shadow-[0_0_10px_rgba(164,118,255,0.4)]">
                        <img className="w-full h-full object-cover" data-alt="High tech cyberpunk arcade music album cover with neon violet synthesizer lasers and rhythmic geometric shapes" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCZxhAef5iXaPoHUtpoVJff2L_A3icjGcwZwI7jY9hXwgEpi8-hZkuUeXbiU4rKdCqUOctFdj6xddsQmj6KOog9f0Y8PCwoSIAH4QITwXpH0MRz7wzh-Hz_mTAEaBdffkHh8eJM_Cen4VT_K0zJLhIubPnjmdVoCrOHDKqDmrGrmG8ploxy7DSydCaqft4qNybKwkjYJE4MdRTz7tuduiLjuryv_Ilb5onlMlyA0KxI8gVmtynCmb0s" />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-label-md text-label-md text-on-surface font-bold truncate">Blastix Riotz
                          </span>
                          <span className="px-1.5 py-0.2 rounded-full bg-primary-container text-on-primary-container font-label-sm text-[9px] font-bold">7K
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-on-surface-variant font-body-sm text-[11px] truncate">
                          <span className="truncate">Camellia
                          </span>
                          <span>•
                          </span>
                          <span className="text-[#FFCC22] font-semibold">5.38★
                          </span>
                          <span>•
                          </span>
                          <span className="text-[#7EE787] font-semibold">98.42%
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 pr-1">
                      <span className="font-metric-sm text-metric-sm text-primary font-bold">+342
                        <span className="font-label-sm text-[10px] text-on-surface-variant">pp
                        </span>
                      </span>
                      <button className="w-7 h-7 rounded-full bg-surface-container-high group-hover:bg-primary-container group-hover:text-on-primary-container text-on-surface-variant flex items-center justify-center transition-colors" title="Listen Preview">
                        <span className="material-symbols-outlined text-[15px]">play_arrow
                        </span>
                      </button>
                    </div>
                  </div>
                  {/* Play 2 */}
                  <div className="group relative flex items-center justify-between p-space-sm rounded-full bg-surface-container hover:bg-surface-container-high transition-all">
                    <div className="flex items-center gap-space-sm min-w-0 pr-2">
                      <div className="relative w-11 h-11 rounded-full overflow-hidden flex-shrink-0 shadow-[0_0_8px_rgba(164,118,255,0.3)]">
                        <img className="w-full h-full object-cover" data-alt="Ethereal ascending fantasy cathedral illuminated by divine twilight beams in deep indigo and purple tones" src="https://lh3.googleusercontent.com/aida-public/AB6AXuA5N2tqQHHq7zQZX5sCWQnnUp2gNTj6IUJCO7y4v76FJu1PcQGIoXY4fAXnjbKB5sJ8865_FWhqTcc0xC_nKcotsBkr--4Z4aiDCOkC1nACC_ID7736IP7FYbpMP3YDlZI7UTBwztdAkG4CX9-4vccumIu1z3nfHeU3j2NeBirX5hVVzTQvivd3opSafownOx83hoDt0EBay7sJUGS9tNjBq_sT1jDWuYIwhxMkXkOlKFa58LAxTN43" />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-label-md text-label-md text-on-surface font-bold truncate">Ascension to Heaven
                          </span>
                          <span className="px-1.5 py-0.2 rounded-full bg-primary-container text-on-primary-container font-label-sm text-[9px] font-bold">7K
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-on-surface-variant font-body-sm text-[11px] truncate">
                          <span className="truncate">xi
                          </span>
                          <span>•
                          </span>
                          <span className="text-[#FFCC22] font-semibold">5.21★
                          </span>
                          <span>•
                          </span>
                          <span className="text-[#7EE787] font-semibold">98.15%
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 pr-1">
                      <span className="font-metric-sm text-metric-sm text-primary font-bold">+328
                        <span className="font-label-sm text-[10px] text-on-surface-variant">pp
                        </span>
                      </span>
                      <button className="w-7 h-7 rounded-full bg-surface-container-high group-hover:bg-primary-container group-hover:text-on-primary-container text-on-surface-variant flex items-center justify-center transition-colors" title="Listen Preview">
                        <span className="material-symbols-outlined text-[15px]">play_arrow
                        </span>
                      </button>
                    </div>
                  </div>
                  {/* Play 3 */}
                  <div className="group relative flex items-center justify-between p-space-sm rounded-full bg-surface-container hover:bg-surface-container-high transition-all">
                    <div className="flex items-center gap-space-sm min-w-0 pr-2">
                      <div className="relative w-11 h-11 rounded-full overflow-hidden flex-shrink-0">
                        <img className="w-full h-full object-cover" data-alt="Surrealistic shattered mirror reflecting an ominous distorted violet silhouette in an abstract digital void" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAZA1eZJd3I42JlGCLW-1jZ-a_HQrv1WMsFvcmmSiX-oVLPrAHyAwj-8uLaInkph44zDdJ4QGTGK7DvUYxrMG5sSC0Tya7O-dvuE5Su_p9SlbXyqbvBPkpKVXSJWTdpR5XAlqgjcjaUl5wkXPAOsVkhftlgDZ81eL7WfVh1U10Jvyan5qjeQP0SSX36ND4btVijsId6XH6iZKGDuFk2ha8ne4jsFc7MF2UnmcDu-nDEMTWf2B0HmAQU" />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-label-md text-label-md text-on-surface font-bold truncate">Doppelganger
                          </span>
                          <span className="px-1.5 py-0.2 rounded-full bg-secondary-container text-secondary font-label-sm text-[9px] font-bold">Free
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-on-surface-variant font-body-sm text-[11px] truncate">
                          <span className="truncate">LeaF
                          </span>
                          <span>•
                          </span>
                          <span className="text-[#FFCC22] font-semibold">5.14★
                          </span>
                          <span>•
                          </span>
                          <span className="text-[#7EE787] font-semibold">97.90%
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 pr-1">
                      <span className="font-metric-sm text-metric-sm text-primary font-bold">+315
                        <span className="font-label-sm text-[10px] text-on-surface-variant">pp
                        </span>
                      </span>
                      <button className="w-7 h-7 rounded-full bg-surface-container-high group-hover:bg-primary-container group-hover:text-on-primary-container text-on-surface-variant flex items-center justify-center transition-colors" title="Listen Preview">
                        <span className="material-symbols-outlined text-[15px]">play_arrow
                        </span>
                      </button>
                    </div>
                  </div>
                  {/* Play 4 */}
                  <div className="group relative flex items-center justify-between p-space-sm rounded-full bg-surface-container hover:bg-surface-container-high transition-all">
                    <div className="flex items-center gap-space-sm min-w-0 pr-2">
                      <div className="relative w-11 h-11 rounded-full overflow-hidden flex-shrink-0">
                        <img className="w-full h-full object-cover" data-alt="Cosmic geometric particle vortex with luminous cyan and magenta crystalline prisms" src="https://lh3.googleusercontent.com/aida-public/AB6AXuA-v5GwTWyVmaKY6iNlV3haktsqyc9UQEDquddhnV5YaNcFmS3YDGAS4A6orUUVK42s0rC0Rkj46bWLwfW01f8Cg-tZfzK_a1fGaXeVs6U1R9jM7kdNQ-NLTnmWGHogVBB0tZVY96o3Re-7M_BcQNmv07HdMARqr_y5ckXt-T3DQdq82N8GJl-hS-NklWmmVxVWvy5scvFdVkX12pfXtzpZ3Exr2eYgyZFffnQ5vqw3Cio6Qf67VHqE" />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-label-md text-label-md text-on-surface font-bold truncate">AXION
                          </span>
                          <span className="px-1.5 py-0.2 rounded-full bg-primary-container text-on-primary-container font-label-sm text-[9px] font-bold">7K
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-on-surface-variant font-body-sm text-[11px] truncate">
                          <span className="truncate">sakuzyo
                          </span>
                          <span>•
                          </span>
                          <span className="text-[#FFCC22] font-semibold">5.08★
                          </span>
                          <span>•
                          </span>
                          <span className="text-[#7EE787] font-semibold">97.64%
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 pr-1">
                      <span className="font-metric-sm text-metric-sm text-primary font-bold">+301
                        <span className="font-label-sm text-[10px] text-on-surface-variant">pp
                        </span>
                      </span>
                      <button className="w-7 h-7 rounded-full bg-surface-container-high group-hover:bg-primary-container group-hover:text-on-primary-container text-on-surface-variant flex items-center justify-center transition-colors" title="Listen Preview">
                        <span className="material-symbols-outlined text-[15px]">play_arrow
                        </span>
                      </button>
                    </div>
                  </div>
                  {/* Play 5 */}
                  <div className="group relative flex items-center justify-between p-space-sm rounded-full bg-surface-container hover:bg-surface-container-high transition-all">
                    <div className="flex items-center gap-space-sm min-w-0 pr-2">
                      <div className="relative w-11 h-11 rounded-full overflow-hidden flex-shrink-0">
                        <img className="w-full h-full object-cover" data-alt="Gothic dark orchestra stage with grand pipe organs enveloped in deep purple mist and stage spotlights" src="https://lh3.googleusercontent.com/aida-public/AB6AXuA_ZtFqmAn2JPb-52iJeexybst61u59VnMrIuIQek47U2gu_dBzMt8P1xRBXYljaVgcD3vG1LyEN5SM4GHbQVSVYUULsMNb9bvSvdq5GvvsZP2sfEISMEdrkBDxUvSSG32jsOOJnSezsoEmIo1qI702eYwv341yyvPNfdw4EufubqRDyW5flInpK_IJXLOF1I40-4EqrRM2wirSPjeN46j8ZDXQ3VMda61zAWRcMaLfIvzEkr2ZsZze" />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-label-md text-label-md text-on-surface font-bold truncate">Grievance
                          </span>
                          <span className="px-1.5 py-0.2 rounded-full bg-primary-container text-on-primary-container font-label-sm text-[9px] font-bold">7K
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-on-surface-variant font-body-sm text-[11px] truncate">
                          <span className="truncate">Team Grimoire
                          </span>
                          <span>•
                          </span>
                          <span className="text-[#FFCC22] font-semibold">4.98★
                          </span>
                          <span>•
                          </span>
                          <span className="text-[#7EE787] font-semibold">98.80%
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 pr-1">
                      <span className="font-metric-sm text-metric-sm text-primary font-bold">+298
                        <span className="font-label-sm text-[10px] text-on-surface-variant">pp
                        </span>
                      </span>
                      <button className="w-7 h-7 rounded-full bg-surface-container-high group-hover:bg-primary-container group-hover:text-on-primary-container text-on-surface-variant flex items-center justify-center transition-colors" title="Listen Preview">
                        <span className="material-symbols-outlined text-[15px]">play_arrow
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              {/* b) Most Played Beatmaps (Retry Counts) */}
              <div className="p-space-lg rounded-DEFAULT bg-surface-container-low shadow-[0_4px_24px_rgba(0,0,0,0.4)]">
                <div className="flex items-center justify-between mb-space-md">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-[20px]">replay
                    </span>
                    <h2 className="font-headline-sm text-headline-sm text-on-surface">Most Played Maps
                    </h2>
                  </div>
                  <span className="font-label-sm text-label-sm text-on-surface-variant">Grind count
                  </span>
                </div>
                <div className="flex flex-col gap-2.5">
                  {/* Item 1 */}
                  <div className="flex items-center justify-between p-2.5 rounded-DEFAULT bg-surface-container hover:bg-surface-container-high transition-colors">
                    <div className="flex items-center gap-space-sm min-w-0 pr-2">
                      <span className="font-headline-sm text-headline-sm text-primary font-extrabold w-5 text-center">1
                      </span>
                      <div className="flex flex-col min-w-0">
                        <span className="font-label-md text-label-md text-on-surface font-semibold truncate">Exit This Earth's Atomosphere
                        </span>
                        <span className="font-body-sm text-body-sm text-on-surface-variant truncate">Camellia • 5.42★
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-secondary-container text-secondary shrink-0">
                      <span className="font-label-md text-label-md font-bold">142
                      </span>
                      <span className="font-label-sm text-[10px] uppercase">retries
                      </span>
                    </div>
                  </div>
                  {/* Item 2 */}
                  <div className="flex items-center justify-between p-2.5 rounded-DEFAULT bg-surface-container hover:bg-surface-container-high transition-colors">
                    <div className="flex items-center gap-space-sm min-w-0 pr-2">
                      <span className="font-headline-sm text-headline-sm text-on-surface-variant font-extrabold w-5 text-center">2
                      </span>
                      <div className="flex flex-col min-w-0">
                        <span className="font-label-md text-label-md text-on-surface font-semibold truncate">Blue Zenith
                        </span>
                        <span className="font-body-sm text-body-sm text-on-surface-variant truncate">xi • 5.12★
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-container-high text-on-surface-variant shrink-0">
                      <span className="font-label-md text-label-md font-bold text-on-surface">98
                      </span>
                      <span className="font-label-sm text-[10px] uppercase">retries
                      </span>
                    </div>
                  </div>
                  {/* Item 3 */}
                  <div className="flex items-center justify-between p-2.5 rounded-DEFAULT bg-surface-container hover:bg-surface-container-high transition-colors">
                    <div className="flex items-center gap-space-sm min-w-0 pr-2">
                      <span className="font-headline-sm text-headline-sm text-on-surface-variant font-extrabold w-5 text-center">3
                      </span>
                      <div className="flex flex-col min-w-0">
                        <span className="font-label-md text-label-md text-on-surface font-semibold truncate">Bookmaker
                        </span>
                        <span className="font-body-sm text-body-sm text-on-surface-variant truncate">Kobaryo • 5.65★
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-container-high text-on-surface-variant shrink-0">
                      <span className="font-label-md text-label-md font-bold text-on-surface">76
                      </span>
                      <span className="font-label-sm text-[10px] uppercase">retries
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              {/* c) Skill Tag Cloud Panel */}
              <div className="p-space-lg rounded-DEFAULT bg-surface-container-low shadow-[0_4px_24px_rgba(0,0,0,0.4)]">
                <div className="flex items-center justify-between mb-space-md">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-[20px]">category
                    </span>
                    <h2 className="font-headline-sm text-headline-sm text-on-surface">Pattern Breakdown & Skills
                    </h2>
                  </div>
                  <span className="font-label-sm text-label-sm text-primary font-semibold">Mania 7K Engine
                  </span>
                </div>
                <p className="font-body-sm text-body-sm text-on-surface-variant mb-space-md">Weighted tag density extracted across your active top 100 performance clears:
                </p>
                {/* Dynamic Tag Cloud */}
                <div className="flex flex-wrap items-center gap-2.5">
                  {/* chordjack (Largest, Primary Purple Neon Glow) */}
                  <button className="px-4 py-2 rounded-full bg-primary-container text-on-primary-container font-headline-sm text-headline-sm font-extrabold shadow-[0_0_18px_rgba(164,118,255,0.4)] hover:scale-105 transition-transform" type="button">{' '}chordjack{' '}
                  </button>
                  {/* stream (Large) */}
                  <button className="px-3.5 py-1.5 rounded-full bg-surface-container-high text-on-surface font-headline-sm text-[16px] font-bold hover:bg-surface-bright transition-colors" type="button">{' '}stream{' '}
                  </button>
                  {/* jumpstream (Medium-Large) */}
                  <button className="px-3 py-1.5 rounded-full bg-surface-container-high text-primary font-headline-sm text-[15px] font-bold hover:bg-surface-bright transition-colors" type="button">{' '}jumpstream{' '}
                  </button>
                  {/* LN (Medium) */}
                  <button className="px-3 py-1 rounded-full bg-surface-container text-[#7EE787] font-label-md text-label-md font-semibold hover:bg-surface-container-high transition-colors" type="button">{' '}LN (long notes){' '}
                  </button>
                  {/* technical (Medium) */}
                  <button className="px-3 py-1 rounded-full bg-surface-container text-tertiary font-label-md text-label-md font-semibold hover:bg-surface-container-high transition-colors" type="button">{' '}technical{' '}
                  </button>
                  {/* handstream (Small-Medium) */}
                  <button className="px-2.5 py-1 rounded-full bg-surface-container text-on-surface-variant font-label-sm text-label-sm hover:text-on-surface transition-colors" type="button">{' '}handstream{' '}
                  </button>
                  {/* speed (Small) */}
                  <button className="px-2 py-0.5 rounded-full bg-surface-container text-secondary font-label-sm text-label-sm hover:bg-surface-container-high transition-colors" type="button">{' '}speed{' '}
                  </button>
                  {/* stamina (Small) */}
                  <button className="px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant font-label-sm text-label-sm hover:text-on-surface transition-colors" type="button">{' '}stamina{' '}
                  </button>
                  {/* sv / scroll velocity (Small) */}
                  <button className="px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant font-label-sm text-label-sm hover:text-on-surface transition-colors" type="button">{' '}sv / scroll velocity{' '}
                  </button>
                </div>
                <div className="mt-space-md pt-space-sm flex items-center justify-between text-on-surface-variant font-label-sm text-[11px]">
                  <span>Dominant archetype:{' '}
                    <strong className="text-primary font-semibold">Dense Chord Precision
                    </strong>
                  </span>
                  <span>Entropy: 0.14
                  </span>
                </div>
              </div>
            </div>
          </div>
          {/* Interactive Sync Button Toast Simulation JS */}
        </div>
    </AppShell>
  )
}

// ---------------------------------------------------------------------------
// Real variant (M2): full stat tracker for the linked player.
// ---------------------------------------------------------------------------

function formatHours(seconds: number | undefined): string {
  if (!seconds) return '0'
  return fmtInt(Math.round(seconds / 3600))
}

function StatsReal({
  data,
  onRefresh,
}: {
  data: ProfileData
  onRefresh: () => void
}) {
  const mode = useModeStore((s) => s.mode)
  const { user, skillProfile: p } = data
  const stats = user.statistics ?? {}
  const caps = useCapabilities()
  const [snapToken, setSnapToken] = useState(0)
  const snapshots = useSnapshots(mode, snapToken)
  const refreshedAt = new Date(p.generatedAt)

  const handleRefresh = () => {
    onRefresh()
    setSnapToken((n) => n + 1)
  }

  return (
    <div className="flex flex-col w-full">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-md pb-space-lg">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-space-sm">
            <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">Stats — {MODE_LABELS[mode]}</h1>
            {mode === 'mania' && p.mainKeyCount !== null && (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary-container/25 text-primary">
                <span className="w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_rgba(210,187,255,0.8)]"></span>
                <span className="font-label-sm text-label-sm uppercase tracking-wider font-bold">{p.mainKeyCount}K Focused</span>
              </div>
            )}
          </div>
          <p className="font-body-md text-body-md text-on-surface-variant">In-depth performance tracking and skill degradation analysis</p>
        </div>
        <div className="flex flex-wrap items-center gap-space-md">
          <div className="flex flex-col text-left lg:text-right">
            <div className="flex items-center lg:justify-end gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#7EE787] shadow-[0_0_6px_rgba(126,231,135,0.8)]"></span>
              <span className="font-label-sm text-label-sm text-on-surface font-medium">
                Last refreshed {refreshedAt.toLocaleDateString()} {refreshedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <span className="font-label-sm text-[10px] text-on-surface-variant">Live from osu! via RecOsuk proxy</span>
          </div>
          <button className="group relative flex items-center gap-space-xs px-space-md py-2.5 rounded-full bg-primary-container text-on-primary-container font-label-md text-label-md shadow-[0_4px_20px_rgba(164,118,255,0.35)] hover:shadow-[0_4px_26px_rgba(164,118,255,0.55)] active:scale-[0.98] transition-all" id="refresh-btn" type="button" onClick={handleRefresh}>
            <span className="material-symbols-outlined text-[18px] group-hover:rotate-180 transition-transform duration-500">sync</span>
            <span>Refresh from osu!</span>
          </button>
        </div>
      </div>

      {p.isStarter && (
        <div className="p-space-md rounded-DEFAULT bg-surface-container-low shadow-[0_4px_16px_rgba(0,0,0,0.35)] mb-space-xl">
          <p className="font-body-md text-body-md text-on-surface">
            Not enough {MODE_LABELS[mode]} plays yet — {user.username} has no top plays in this mode, so
            the numbers below are their account totals and the analysis cards show starter estimates,
            not a personalised profile.
          </p>
        </div>
      )}

      {/* Headline numbers strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-space-md mb-space-xl">
        <div className="relative overflow-hidden p-space-md rounded-DEFAULT bg-surface-container-low shadow-[0_4px_16px_rgba(0,0,0,0.35)]">
          <div className="absolute -right-6 -bottom-6 w-24 h-24 rounded-full bg-primary/10 blur-xl pointer-events-none"></div>
          <div className="flex items-center justify-between text-on-surface-variant mb-1">
            <span className="font-label-sm text-label-sm uppercase tracking-wider">Performance Points</span>
            <span className="material-symbols-outlined text-primary text-[18px]">bolt</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="font-metric-display text-metric-display text-primary tracking-tight leading-none">{fmtInt(p.pp)}</span>
            <span className="font-label-sm text-label-sm text-on-surface-variant">pp</span>
          </div>
          <div className="flex items-center gap-1 mt-2 text-on-surface-variant">
            <span className="font-label-sm text-label-sm">from your top {p.topPlayCount} plays</span>
          </div>
        </div>
        <div className="relative overflow-hidden p-space-md rounded-DEFAULT bg-surface-container-low shadow-[0_4px_16px_rgba(0,0,0,0.35)]">
          <div className="flex items-center justify-between text-on-surface-variant mb-1">
            <span className="font-label-sm text-label-sm uppercase tracking-wider">Global Ranking</span>
            {user.country_code && (
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary-container text-secondary font-label-sm text-[10px] font-bold">
                <span>{user.country_code}</span>
                <span>{p.countryRank !== null ? `#${fmtInt(p.countryRank)}` : ''}</span>
              </div>
            )}
          </div>
          <div className="flex items-baseline gap-1">
            <span className="font-metric-display text-metric-display text-on-surface tracking-tight leading-none">{p.globalRank !== null ? `#${fmtInt(p.globalRank)}` : '—'}</span>
          </div>
          <div className="flex items-center gap-1 mt-2 text-on-surface-variant">
            <span className="font-label-sm text-label-sm">{MODE_LABELS[mode]} leaderboard</span>
          </div>
        </div>
        <div className="relative overflow-hidden p-space-md rounded-DEFAULT bg-surface-container-low shadow-[0_4px_16px_rgba(0,0,0,0.35)]">
          <div className="flex items-center justify-between text-on-surface-variant mb-1">
            <span className="font-label-sm text-label-sm uppercase tracking-wider">Hit Accuracy</span>
            <span className="material-symbols-outlined text-tertiary text-[18px]">adjust</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="font-metric-display text-metric-display text-on-surface tracking-tight leading-none">{fmtAcc(p.accuracy)}</span>
          </div>
          <div className="flex items-center gap-1 mt-2 text-on-surface-variant">
            <span className="font-label-sm text-label-sm">{p.recentAccuracy !== null ? `recent plays ${fmtAcc(p.recentAccuracy)}` : 'lifetime average'}</span>
          </div>
        </div>
        <div className="relative overflow-hidden p-space-md rounded-DEFAULT bg-surface-container-low shadow-[0_4px_16px_rgba(0,0,0,0.35)]">
          <div className="flex items-center justify-between text-on-surface-variant mb-1">
            <span className="font-label-sm text-label-sm uppercase tracking-wider">Total Plays</span>
            <span className="material-symbols-outlined text-on-surface-variant text-[18px]">play_circle</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="font-metric-display text-metric-display text-on-surface tracking-tight leading-none">{fmtInt(p.playCount)}</span>
          </div>
          <div className="flex items-center gap-1 mt-2 text-on-surface-variant">
            <span className="font-label-sm text-label-sm">grades: {stats.grade_counts?.ss ?? 0} SS · {stats.grade_counts?.s ?? 0} S · {stats.grade_counts?.a ?? 0} A</span>
          </div>
        </div>
        <div className="relative overflow-hidden p-space-md rounded-DEFAULT bg-surface-container-low shadow-[0_4px_16px_rgba(0,0,0,0.35)] col-span-2 md:col-span-1">
          <div className="flex items-center justify-between text-on-surface-variant mb-1">
            <span className="font-label-sm text-label-sm uppercase tracking-wider">Time on Stage</span>
            <span className="material-symbols-outlined text-on-surface-variant text-[18px]">timer</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="font-metric-display text-metric-display text-on-surface tracking-tight leading-none">{formatHours(stats.play_time)}</span>
            <span className="font-headline-sm text-headline-sm text-on-surface-variant">hrs</span>
          </div>
          <div className="flex items-center gap-1 mt-2 text-primary font-label-sm text-label-sm font-medium">
            <span>Level {stats.level?.current ?? '—'}</span>
            <span className="text-on-surface-variant">• max combo {fmtInt(stats.maximum_combo ?? 0)}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-start">
        <div className="lg:col-span-7 flex flex-col gap-space-lg">
          <div className="relative p-space-lg rounded-DEFAULT bg-surface-container-low shadow-[0_4px_24px_rgba(0,0,0,0.4)] overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-space-md">
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-[20px]">bar_chart</span>
                  <h2 className="font-headline-sm text-headline-sm text-on-surface">Accuracy by Star Rating Band</h2>
                </div>
                <p className="font-body-sm text-body-sm text-on-surface-variant">Your average accuracy grouped by map difficulty — the comfort band and the collapse band</p>
              </div>
              <div className="flex items-center gap-2 self-start sm:self-auto">
                <span className="px-2.5 py-1 rounded-full bg-surface-container-high text-on-surface-variant font-label-sm text-label-sm">Sample: top {p.topPlayCount} plays</span>
              </div>
            </div>
            <AccBandChart profile={p} />
          </div>

          <div className="relative p-space-lg rounded-DEFAULT bg-surface-container-low shadow-[0_4px_24px_rgba(0,0,0,0.4)] overflow-hidden">
            <div className="flex items-center gap-2 mb-space-md">
              <span className="material-symbols-outlined text-primary text-[20px]">emoji_events</span>
              <h2 className="font-headline-sm text-headline-sm text-on-surface">Top Plays</h2>
            </div>
            {data.topPlays.length === 0 ? (
              <p className="font-body-sm text-body-sm text-on-surface-variant">No top plays in {MODE_LABELS[mode]} yet.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {data.topPlays.slice(0, 15).map((play) => (
                  <div key={play.id ?? play.beatmap?.id} className="flex items-center gap-space-md p-2 rounded-DEFAULT bg-surface-container">
                    {play.beatmapset?.covers?.list ? (
                      <img className="w-16 h-10 rounded object-cover flex-shrink-0" alt="" src={play.beatmapset.covers.list} />
                    ) : (
                      <div className="w-16 h-10 rounded bg-surface-container-highest flex-shrink-0"></div>
                    )}
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="font-label-md text-label-md text-on-surface truncate">
                        {play.beatmapset?.title ?? 'Unknown map'} <span className="text-on-surface-variant">[{play.beatmap?.version}]</span>
                      </span>
                      <span className="font-label-sm text-label-sm text-on-surface-variant truncate">
                        {play.beatmapset?.artist} · {play.beatmap?.bpm ?? '—'} BPM · mapped by {play.beatmapset?.creator ?? '—'}
                      </span>
                    </div>
                    <div className="flex items-center gap-space-md flex-shrink-0 font-label-sm text-label-sm">
                      <span className="text-[#FFCC22] font-bold">{play.beatmap?.difficulty_rating.toFixed(2)}★</span>
                      <span className="text-on-surface">{(play.accuracy * 100).toFixed(2)}%</span>
                      <span className="text-primary font-bold">{play.pp ? `${Math.round(play.pp)}pp` : '—'}</span>
                      <span className="text-on-surface-variant hidden xl:inline">{fmtInt(play.max_combo)}x{(play.mods ?? []).length > 0 ? ` · ${(play.mods ?? []).join('')}` : ''}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {data.mostPlayed.length > 0 && (
            <div className="relative p-space-lg rounded-DEFAULT bg-surface-container-low shadow-[0_4px_24px_rgba(0,0,0,0.4)] overflow-hidden">
              <div className="flex items-center gap-2 mb-space-md">
                <span className="material-symbols-outlined text-primary text-[20px]">repeat</span>
                <h2 className="font-headline-sm text-headline-sm text-on-surface">Most Played Maps</h2>
              </div>
              <div className="flex flex-col gap-2">
                {data.mostPlayed.slice(0, 8).map((entry) => (
                  <div key={entry.beatmap?.id ?? entry.beatmapset?.id} className="flex items-center gap-space-md p-2 rounded-DEFAULT bg-surface-container">
                    {entry.beatmapset?.covers?.list ? (
                      <img className="w-16 h-10 rounded object-cover flex-shrink-0" alt="" src={entry.beatmapset.covers.list} />
                    ) : (
                      <div className="w-16 h-10 rounded bg-surface-container-highest flex-shrink-0"></div>
                    )}
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="font-label-md text-label-md text-on-surface truncate">{entry.beatmapset?.title ?? 'Unknown map'}</span>
                      <span className="font-label-sm text-label-sm text-on-surface-variant truncate">{entry.beatmapset?.artist}</span>
                    </div>
                    <span className="font-label-sm text-label-sm text-primary font-bold flex-shrink-0">{entry.count} plays</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-5 flex flex-col gap-space-lg">
          <div className="relative p-space-lg rounded-DEFAULT bg-surface-container-low shadow-[0_4px_24px_rgba(0,0,0,0.4)] overflow-hidden">
            <div className="flex items-center gap-2 mb-space-md">
              <span className="material-symbols-outlined text-primary text-[20px]">insights</span>
              <h2 className="font-headline-sm text-headline-sm text-on-surface">What your numbers mean</h2>
            </div>
            <StatCards cards={interpretProfile(p)} />
          </div>

          {/* Snapshot history: accounts get their progress log; guests get
              the locked panel (PLAN-v2 §4.2/§6). */}
          <div className="relative p-space-lg rounded-DEFAULT bg-surface-container-low shadow-[0_4px_24px_rgba(0,0,0,0.4)] overflow-hidden">
            <div className="flex items-center gap-2 mb-space-md">
              <span className="material-symbols-outlined text-primary text-[20px]">history</span>
              <h2 className="font-headline-sm text-headline-sm text-on-surface">Progress history</h2>
            </div>
            {caps.canSnapshotHistory ? (
              snapshots === null ? (
                <p className="font-body-sm text-body-sm text-on-surface-variant">Loading snapshots…</p>
              ) : snapshots.length === 0 ? (
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  No snapshots yet for {MODE_LABELS[mode]}. Hit "Refresh from osu!" and your first
                  snapshot is saved — future refreshes build your progress-over-time line.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {snapshots.map((snap) => (
                    <div key={snap.id} className="flex items-center justify-between p-2 rounded-DEFAULT bg-surface-container font-label-sm text-label-sm">
                      <span className="text-on-surface-variant">{new Date(snap.created_at).toLocaleDateString()} {new Date(snap.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      <span className="text-primary font-bold">{snap.pp !== null ? `${fmtInt(snap.pp)} pp` : '—'}</span>
                      <span className="text-on-surface">{snap.global_rank !== null ? `#${fmtInt(snap.global_rank)}` : '—'}</span>
                      <span className="text-on-surface-variant">{snap.accuracy !== null ? fmtAcc(snap.accuracy) : '—'}</span>
                    </div>
                  ))}
                </div>
              )
            ) : (
              <div className="flex flex-col gap-space-sm">
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  Snapshot history is account-only: guests get live stats, but their progress
                  over time isn't kept. Create a free account and every refresh is saved here.
                </p>
                <LockedButton
                  allowed={false}
                  lockedTitle="Create a free account to keep snapshot history"
                  className="flex items-center justify-center gap-2 px-space-md py-2.5 rounded-full bg-surface-container-high text-on-surface font-label-md text-label-md"
                >
                  View snapshot history
                </LockedButton>
              </div>
            )}
          </div>

          {p.modUsage.length > 0 && (
            <div className="relative p-space-lg rounded-DEFAULT bg-surface-container-low shadow-[0_4px_24px_rgba(0,0,0,0.4)] overflow-hidden">
              <div className="flex items-center gap-2 mb-space-md">
                <span className="material-symbols-outlined text-primary text-[20px]">tune</span>
                <h2 className="font-headline-sm text-headline-sm text-on-surface">Mod usage</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                {p.modUsage.slice(0, 8).map((entry) => (
                  <span key={entry.mod} className="px-3 py-1.5 rounded-full bg-surface-container-high text-on-surface font-label-sm text-label-sm">
                    {entry.mod} · {entry.count}
                  </span>
                ))}
              </div>
              {p.playstyleTags.length > 0 && (
                <>
                  <div className="flex items-center gap-2 mt-space-md mb-space-sm">
                    <span className="material-symbols-outlined text-primary text-[20px]">sell</span>
                    <h2 className="font-headline-sm text-headline-sm text-on-surface">Playstyle tags</h2>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {p.playstyleTags.map((tag) => (
                      <span key={tag} className="px-3 py-1.5 rounded-full bg-primary-container/25 text-primary font-label-sm text-label-sm">{tag}</span>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Stats() {
  const mode = useModeStore((s) => s.mode)
  const { tier } = useAuth()
  const { status, data, identity, refresh } = useProfileData(mode)

  if (status === 'loading') {
    return (
      <AppShell
        identity={{
          username: identity?.username ?? 'Loading…',
          pp: null,
          tierLabel: tier === 'account' ? 'account' : tier === 'guest' ? 'guest' : 'free tier',
        }}
      >
        <LoadingState label={`Loading your ${MODE_LABELS[mode]} stats from osu!…`} />
      </AppShell>
    )
  }
  if (status !== 'ready' && status !== 'empty') return <StatsDemo />
  if (!data) return <StatsDemo />

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
      <StatsReal data={data} onRefresh={refresh} />
    </AppShell>
  )
}
