// Converted from Stitch export: stitch-raw/09-mirror.html
// M6: the exported markup below is the DEMO variant (sora_playz),
// rendered unchanged when the proxy is not configured. The real
// variant at the bottom wires the search to the osu! API via the
// proxy, with mode tabs (incl. All) and real mirror download links.
import { useCallback, useEffect, useRef, useState } from 'react'
import AppShell from '../components/AppShell'
import BeatmapRow from '../components/BeatmapRow'
import { isProxyConfigured, proxyCall } from '../lib/osu'
import { GAME_MODES, MODE_LABELS, type GameMode } from '../lib/mode'
import { useModeStore } from '../lib/modeStore'
import { computeSkillProfile } from '../lib/skillProfile'
import {
  setToCandidate,
  type RecCandidate,
  type SearchPage,
} from '../lib/recommend'
import { seenKey, seenStore } from '../lib/seenStore'
import { useAuth } from '../lib/auth'
import { useGuestStore } from '../lib/guestStore'

// Identity shown by the demo fallback variant: sample data, not a real player.
const DEMO_IDENTITY = {
  username: 'sora_playz',
  pp: 5284,
  countryCode: 'VN',
  tierLabel: 'free tier',
}

function MirrorDemo() {
  return (
    <AppShell identity={DEMO_IDENTITY}>
        <div className="flex flex-col w-full gap-space-lg">
          {/* Top Command & Header Band */}
          <section className="flex flex-col gap-space-md">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-space-md">
              <div className="flex flex-col">
                <div className="flex items-center gap-space-xs text-on-surface-variant font-label-sm text-label-sm uppercase tracking-widest mb-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping">
                  </span>
                  <span>Fast Beatmap Pipeline
                  </span>
                  <span className="text-outline-variant">•
                  </span>
                  <span>Latency Optimized
                  </span>
                </div>
                <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">Mirror — Mania
                </h1>
              </div>
              {/* Mode Selector Switcher Pills */}
              <div className="flex items-center gap-1.5 p-1 rounded-full bg-surface-container-low shadow-inner">
                <button className="px-space-md py-1.5 rounded-full font-label-md text-label-md text-on-surface-variant hover:text-on-surface transition-colors" type="button">{' '}All{' '}
                </button>
                <button className="flex items-center gap-1.5 px-space-md py-1.5 rounded-full font-label-md text-label-md text-on-surface-variant hover:text-secondary transition-all group" type="button">
                  <span className="w-2 h-2 rounded-full bg-secondary group-hover:scale-125 transition-transform">
                  </span>
                  <span>Standard
                  </span>
                </button>
                <button className="flex items-center gap-1.5 px-space-md py-1.5 rounded-full font-label-md text-label-md text-on-surface-variant hover:text-[#FF5C39] transition-all group" type="button">
                  <span className="w-2 h-2 rounded-full bg-[#FF5C39] group-hover:scale-125 transition-transform">
                  </span>
                  <span>Taiko
                  </span>
                </button>
                <button className="flex items-center gap-1.5 px-space-md py-1.5 rounded-full font-label-md text-label-md text-on-surface-variant hover:text-tertiary transition-all group" type="button">
                  <span className="w-2 h-2 rounded-full bg-tertiary group-hover:scale-125 transition-transform">
                  </span>
                  <span>Catch
                  </span>
                </button>
                <button className="flex items-center gap-1.5 px-space-md py-1.5 rounded-full font-label-md text-label-md bg-primary-container text-on-primary-container shadow-[0_0_16px_rgba(164,118,255,0.4)]" type="button">
                  <span className="w-2 h-2 rounded-full bg-primary-fixed">
                  </span>
                  <span>Mania
                  </span>
                </button>
              </div>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant -mt-1">{' '}Downloads are the full beatmapset file. The mode changes what you discover and which difficulty is shown.{' '}
            </p>
            {/* Search input & filter rail */}
            <div className="flex flex-col gap-space-sm pt-space-xs">
              <div className="relative flex items-center w-full">
                <span className="material-symbols-outlined absolute left-4 text-on-surface-variant text-[22px] pointer-events-none">search
                </span>
                <input className="w-full h-12 pl-12 pr-32 rounded-full bg-surface-container text-on-surface placeholder:text-on-surface-variant/60 font-body-md text-body-md focus:outline-none focus:ring-2 focus:ring-primary shadow-sm transition-all" placeholder="Search beatmaps, artists, or mappers" type="text" value="Camellia xi" />
                <div className="absolute right-1.5 flex items-center">
                  <button className="px-space-lg h-9 rounded-full bg-primary text-on-primary font-label-md text-label-md flex items-center gap-1 shadow-md hover:bg-primary-container hover:text-on-primary-container active:scale-95 transition-all" type="button">
                    <span className="material-symbols-outlined text-[18px]">tune
                    </span>
                    <span>Search
                    </span>
                  </button>
                </div>
              </div>
              {/* Quick Filter Pills */}
              <div className="flex flex-wrap items-center gap-2">
                <button className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container-high text-on-surface font-label-sm text-label-sm hover:bg-surface-bright transition-colors" type="button">
                  <span className="text-on-surface-variant">Status:
                  </span>
                  <span className="text-primary font-semibold">Ranked
                  </span>
                  <span className="material-symbols-outlined text-[14px] text-on-surface-variant">arrow_drop_down
                  </span>
                </button>
                <button className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container-high text-on-surface font-label-sm text-label-sm hover:bg-surface-bright transition-colors" type="button">
                  <span className="text-on-surface-variant">Key:
                  </span>
                  <span className="text-tertiary font-semibold">7K
                  </span>
                  <span className="material-symbols-outlined text-[14px] text-on-surface-variant">arrow_drop_down
                  </span>
                </button>
                <button className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container-high text-on-surface font-label-sm text-label-sm hover:bg-surface-bright transition-colors" type="button">
                  <span className="text-on-surface-variant">Sort:
                  </span>
                  <span>Ranked Date ↓
                  </span>
                  <span className="material-symbols-outlined text-[14px] text-on-surface-variant">arrow_drop_down
                  </span>
                </button>
                <button className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container text-on-surface-variant font-label-sm text-label-sm hover:text-on-surface transition-colors" type="button">
                  <span className="material-symbols-outlined text-[14px]">filter_list
                  </span>
                  <span>More Filters
                  </span>
                </button>
              </div>
            </div>
          </section>
          {/* Two Column Main Layout */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-space-xl">
            {/* Left Column: Beatmap Feed (8 Cols) */}
            <section className="xl:col-span-8 flex flex-col gap-space-md min-w-0">
              {/* Subheader + Mirror status */}
              <div className="flex items-center justify-between pb-1">
                <div className="flex items-center gap-space-sm">
                  <span className="font-headline-sm text-headline-sm text-on-surface">Search results
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-surface-container-high font-label-sm text-label-sm text-on-surface-variant font-medium">84 beatmapsets
                  </span>
                </div>
                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-surface-container-low font-label-sm text-label-sm">
                  <span className="w-2 h-2 rounded-full bg-[#7EE787] animate-pulse">
                  </span>
                  <span className="text-on-surface-variant">Mirror status:
                  </span>
                  <span className="text-on-surface font-semibold">Online · 42ms
                  </span>
                </div>
              </div>
              {/* Beatmap Tracks Container */}
              <div className="flex flex-col gap-3">
                {/* Track 1: Active In-Progress Download (62%) */}
                <article className="relative overflow-hidden rounded-xl bg-surface-container-low hover:bg-surface-container transition-all group shadow-md">
                  {/* Active Progress Bar Background Fill */}
                  <div className="absolute inset-y-0 left-0 bg-primary/10 w-[62%] pointer-events-none transition-all">
                  </div>
                  <div className="absolute bottom-0 left-0 h-1 bg-gradient-to-r from-tertiary via-primary to-primary-container w-[62%] shadow-[0_0_8px_rgba(210,187,255,0.7)] pointer-events-none">
                  </div>
                  <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-space-md p-space-md">
                    {/* Left Info Cluster */}
                    <div className="flex items-center gap-space-md min-w-0 flex-1">
                      {/* Lead Circle Cover Art */}
                      <div className="relative w-14 h-14 rounded-full overflow-hidden flex-shrink-0 ring-2 ring-primary shadow-md">
                        <img className="w-full h-full object-cover" data-alt="Futuristic electronic cyberpunk aesthetic cover art featuring glowing neon orbital rings, deep purple and celestial blue nebulae in deep outer space with dynamic lighting." src="https://lh3.googleusercontent.com/aida-public/AB6AXuByvNRXpTuH_mrmeMre9i9ZKXNtwDHaJYgjq89TA6aajWxwBmH9DQPefEgu_TzWN1SLCMKWVu36G39B0KH-3D2oEWlnDgJHZgfExU5pl118jjmcqyLNGlNgWoy-c5NFEEBfWPldo4-zITpYV_mMk87HRMI65DKz5Munut-yDQ3a73Df8dr2SXvZ6zPq2TNaIPE8kKnc3B7yHNBiyZ5R_ED7HVVl42s731UECOfw9lCxXC_K1Ohh4IyB" />
                        <div className="absolute inset-0 bg-surface-container-lowest/30 flex items-center justify-center">
                          <span className="material-symbols-outlined text-primary text-[20px] animate-spin">sync
                          </span>
                        </div>
                      </div>
                      {/* Metadata Text Hierarchy */}
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-headline-sm text-headline-sm text-on-surface truncate">Exit This Earth's Atomosphere
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-[#FFCC22]/15 text-[#FFCC22] font-label-sm text-label-sm font-bold flex items-center gap-0.5">
                            <span className="material-symbols-outlined text-[13px] leading-none" style={{ fontVariationSettings: "'FILL' 1" }}>star
                            </span>
                            <span>5.24★
                            </span>
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-surface-container text-tertiary font-label-sm text-label-sm font-semibold">7K
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-on-surface-variant font-body-sm text-body-sm truncate mt-0.5">
                          <span className="text-on-surface font-medium">Camellia
                          </span>
                          <span>•
                          </span>
                          <span>mapped by{' '}
                            <strong className="text-on-surface-variant font-medium">Evening
                            </strong>
                          </span>
                          <span>•
                          </span>
                          <span>182 BPM
                          </span>
                          <span>•
                          </span>
                          <span>2:44
                          </span>
                        </div>
                        {/* Download Velocity Status Bar Text */}
                        <div className="flex items-center gap-space-sm mt-2 text-on-surface-variant font-label-sm text-label-sm">
                          <span className="text-primary font-bold">62%
                          </span>
                          <span>•
                          </span>
                          <span className="text-on-surface">18.4 MB / 29.8 MB
                          </span>
                          <span className="text-tertiary font-medium">(3.4 MB/s)
                          </span>
                          <span className="hidden sm:inline text-outline-variant">•
                          </span>
                          <span className="hidden sm:inline px-2 py-0.5 rounded bg-surface-container-lowest text-on-surface-variant text-[10px]">Source: beatconnect
                          </span>
                        </div>
                      </div>
                    </div>
                    {/* Action Cluster */}
                    <div className="flex items-center gap-2 self-end lg:self-center">
                      <button className="w-10 h-10 rounded-full bg-surface-container-high hover:bg-surface-bright text-on-surface flex items-center justify-center transition-all" title="Pause download" type="button">
                        <span className="material-symbols-outlined text-[20px]">pause
                        </span>
                      </button>
                      <button className="w-10 h-10 rounded-full bg-surface-container-high hover:bg-error-container hover:text-error text-on-surface-variant flex items-center justify-center transition-all" title="Cancel download" type="button">
                        <span className="material-symbols-outlined text-[20px]">close
                        </span>
                      </button>
                    </div>
                  </div>
                </article>
                {/* Track 2: Queued Download (#1) */}
                <article className="relative overflow-hidden rounded-xl bg-surface-container-low hover:bg-surface-container transition-all group shadow-sm">
                  <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-space-md p-space-md">
                    {/* Left Info Cluster */}
                    <div className="flex items-center gap-space-md min-w-0 flex-1">
                      <div className="relative w-14 h-14 rounded-full overflow-hidden flex-shrink-0 ring-2 ring-outline-variant">
                        <img className="w-full h-full object-cover" data-alt="Anime style illustration of a mystical gothic citadel floating in a cerulean and indigo dusk sky, digital speed painting with dramatic purple lighting." src="https://lh3.googleusercontent.com/aida-public/AB6AXuDvL-m99_fKpnxS8dBgZQrqkCankMjvbZHdKXzVGjYbuQIH1g6e-P9olvPii2fni4KMAL_5NtzY3KjJtWTcn0LnSetGqaqmXaFuJRlhM0FaQFawvwVtSXIUZOUZgiBow8IKbCldPEzmowwW_af3jBIkaBLPGu15UfsNYfGaj1-BUs9bZYzUGEOlCQ86bjFZfs4MigaGws7XA679rR6qMj2RM1qpxEc8Z1mImP4o-FYyRStdzItkujme" />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-headline-sm text-headline-sm text-on-surface truncate">Blue Zenith
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-[#FFCC22]/15 text-[#FFCC22] font-label-sm text-label-sm font-bold flex items-center gap-0.5">
                            <span className="material-symbols-outlined text-[13px] leading-none" style={{ fontVariationSettings: "'FILL' 1" }}>star
                            </span>
                            <span>4.86★
                            </span>
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-surface-container text-tertiary font-label-sm text-label-sm font-semibold">7K
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-on-surface-variant font-body-sm text-body-sm truncate mt-0.5">
                          <span className="text-on-surface font-medium">xi
                          </span>
                          <span>•
                          </span>
                          <span>mapped by{' '}
                            <strong className="text-on-surface-variant font-medium">Asuka_-
                            </strong>
                          </span>
                          <span>•
                          </span>
                          <span>200 BPM
                          </span>
                          <span>•
                          </span>
                          <span>4:12
                          </span>
                        </div>
                        <div className="flex items-center gap-space-sm mt-1.5 text-on-surface-variant font-label-sm text-label-sm">
                          <span className="flex items-center gap-1 text-on-surface-variant">
                            <span className="material-symbols-outlined text-[15px] text-tertiary">schedule
                            </span>
                            <span>Queued #1 in line • Waiting for slot
                            </span>
                          </span>
                          <span>•
                          </span>
                          <span className="px-2 py-0.5 rounded bg-surface-container-lowest text-on-surface-variant text-[10px]">Source: nerinyan (fallback)
                          </span>
                        </div>
                      </div>
                    </div>
                    {/* Action Cluster */}
                    <div className="flex items-center gap-2 self-end lg:self-center">
                      <button className="w-10 h-10 rounded-full bg-surface-container text-on-surface-variant flex items-center justify-center cursor-default" title="In queue" type="button">
                        <span className="material-symbols-outlined text-[20px] text-tertiary">hourglass_top
                        </span>
                      </button>
                      <button className="w-10 h-10 rounded-full bg-surface-container-high hover:bg-error-container hover:text-error text-on-surface-variant flex items-center justify-center transition-all" title="Remove from queue" type="button">
                        <span className="material-symbols-outlined text-[20px]">close
                        </span>
                      </button>
                    </div>
                  </div>
                </article>
                {/* Track 3: Ready to Download (Calamity Fortune) */}
                <article className="relative overflow-hidden rounded-xl bg-surface-container-low hover:bg-surface-container transition-all group shadow-sm">
                  <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-space-md p-space-md">
                    <div className="flex items-center gap-space-md min-w-0 flex-1">
                      <div className="relative w-14 h-14 rounded-full overflow-hidden flex-shrink-0 ring-2 ring-surface-variant group-hover:ring-primary transition-all">
                        <img className="w-full h-full object-cover" data-alt="Abstract kaleidoscopic rhythm game banner with vivid magenta shards, electric violet prisms, and shattered geometric dark glass against deep purple backdrop." src="https://lh3.googleusercontent.com/aida-public/AB6AXuDdgCZBy15Q41dzpG2BVWEXvtgD6lur3W3mWggUIrnsUcI_scN3g2yLjdbVZmnDxa8iN6VqgCpHaE26aGY-4xNTCg5mVRe86vaINB9cRUbiFbu0PoN4847bh0BPO42Dvb3-vC0CBi9htij5t3u3ML9Jh0R2OOus31hr6haEtWySZdhyzdQFik3mcqtVnV6HxvRGv0eMpgxzdQ1H7IUCJal-YCN2wYSe4A9sjODeXsV5Jc1sLH45TWpv" />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-headline-sm text-headline-sm text-on-surface truncate">Calamity Fortune
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-[#FFCC22]/15 text-[#FFCC22] font-label-sm text-label-sm font-bold flex items-center gap-0.5">
                            <span className="material-symbols-outlined text-[13px] leading-none" style={{ fontVariationSettings: "'FILL' 1" }}>star
                            </span>
                            <span>5.12★
                            </span>
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-surface-container text-tertiary font-label-sm text-label-sm font-semibold">7K
                          </span>
                          <span className="font-label-sm text-label-sm text-on-surface-variant">24.1 MB (.osz)
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-on-surface-variant font-body-sm text-body-sm truncate mt-0.5">
                          <span className="text-on-surface font-medium">LeaF
                          </span>
                          <span>•
                          </span>
                          <span>mapped by{' '}
                            <strong className="text-on-surface-variant font-medium">inteliser
                            </strong>
                          </span>
                          <span>•
                          </span>
                          <span>174 BPM
                          </span>
                          <span>•
                          </span>
                          <span>2:18
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1.5 font-label-sm text-label-sm text-on-surface-variant">
                          <span className="px-2 py-0.5 rounded bg-surface-container-lowest text-on-surface-variant text-[10px]">Source: beatconnect
                          </span>
                          <span>•
                          </span>
                          <span className="text-on-surface-variant">Direct mirror verified
                          </span>
                        </div>
                      </div>
                    </div>
                    {/* Action Buttons Suite */}
                    <div className="flex items-center gap-2 self-end lg:self-center">
                      <button className="w-10 h-10 rounded-full bg-surface-container-high hover:bg-surface-bright text-on-surface-variant hover:text-on-surface flex items-center justify-center transition-all" title="Audio preview" type="button">
                        <span className="material-symbols-outlined text-[20px]">play_arrow
                        </span>
                      </button>
                      <button className="w-10 h-10 rounded-full bg-surface-container-high hover:bg-surface-bright text-on-surface-variant hover:text-secondary flex items-center justify-center transition-all" title="Bookmark beatmap" type="button">
                        <span className="material-symbols-outlined text-[20px]">bookmark
                        </span>
                      </button>
                      <button className="w-10 h-10 rounded-full bg-primary text-on-primary hover:bg-primary-container hover:text-on-primary-container shadow-md flex items-center justify-center active:scale-95 transition-all" title="Download .osz" type="button">
                        <span className="material-symbols-outlined text-[20px]">download
                        </span>
                      </button>
                    </div>
                  </div>
                </article>
                {/* Track 4: Ready to Download (Blastix Riotz) */}
                <article className="relative overflow-hidden rounded-xl bg-surface-container-low hover:bg-surface-container transition-all group shadow-sm">
                  <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-space-md p-space-md">
                    <div className="flex items-center gap-space-md min-w-0 flex-1">
                      <div className="relative w-14 h-14 rounded-full overflow-hidden flex-shrink-0 ring-2 ring-surface-variant group-hover:ring-primary transition-all">
                        <img className="w-full h-full object-cover" data-alt="High energy explosive rhythm game visualizer graphic with laser sparks, cybernetic purple lightning, intense hyper-detailed sci-fi rave atmosphere." src="https://lh3.googleusercontent.com/aida-public/AB6AXuD0aKl374sXYs00riZPk8YYEhQryEgbtJQPDSETyU-wMNT0-ZW7_nnr28WRqgGsjL7IjdhQRbmWYn_1Mx5UGmkK6JoB6PgnlT6Xz_NqGPMnAgOz9rR8KXJkzEXY9TEdA1lWlrAlJk6BEpYIP1Sth0C8Wn49xxtj8AbY_pF_E69ATvFVuULQuLT-JtS48iXrdISlj4ilDt2upysU1hUUaG5CK1vi9vqBKwjq2e57zDDzQFeBLmtUY5Lg" />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-headline-sm text-headline-sm text-on-surface truncate">Blastix Riotz
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-[#FFCC22]/15 text-[#FFCC22] font-label-sm text-label-sm font-bold flex items-center gap-0.5">
                            <span className="material-symbols-outlined text-[13px] leading-none" style={{ fontVariationSettings: "'FILL' 1" }}>star
                            </span>
                            <span>5.38★
                            </span>
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-surface-container text-tertiary font-label-sm text-label-sm font-semibold">7K
                          </span>
                          <span className="font-label-sm text-label-sm text-on-surface-variant">31.2 MB (.osz)
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-on-surface-variant font-body-sm text-body-sm truncate mt-0.5">
                          <span className="text-on-surface font-medium">Camellia
                          </span>
                          <span>•
                          </span>
                          <span>mapped by{' '}
                            <strong className="text-on-surface-variant font-medium">Kamuy
                            </strong>
                          </span>
                          <span>•
                          </span>
                          <span>210 BPM
                          </span>
                          <span>•
                          </span>
                          <span>2:15
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1.5 font-label-sm text-label-sm text-on-surface-variant">
                          <span className="px-2 py-0.5 rounded bg-surface-container-lowest text-on-surface-variant text-[10px]">Source: beatconnect
                          </span>
                          <span>•
                          </span>
                          <span className="text-on-surface-variant">No video included
                          </span>
                        </div>
                      </div>
                    </div>
                    {/* Action Suite */}
                    <div className="flex items-center gap-2 self-end lg:self-center">
                      <button className="w-10 h-10 rounded-full bg-surface-container-high hover:bg-surface-bright text-on-surface-variant hover:text-on-surface flex items-center justify-center transition-all" title="Audio preview" type="button">
                        <span className="material-symbols-outlined text-[20px]">play_arrow
                        </span>
                      </button>
                      <button className="w-10 h-10 rounded-full bg-surface-container-high hover:bg-surface-bright text-on-surface-variant hover:text-secondary flex items-center justify-center transition-all" title="Bookmark beatmap" type="button">
                        <span className="material-symbols-outlined text-[20px]">bookmark
                        </span>
                      </button>
                      <button className="w-10 h-10 rounded-full bg-primary text-on-primary hover:bg-primary-container hover:text-on-primary-container shadow-md flex items-center justify-center active:scale-95 transition-all" title="Download .osz" type="button">
                        <span className="material-symbols-outlined text-[20px]">download
                        </span>
                      </button>
                    </div>
                  </div>
                </article>
                {/* Track 5: Completed / Already In Library */}
                <article className="relative overflow-hidden rounded-xl bg-surface-container-lowest/60 hover:bg-surface-container-low transition-all group shadow-sm opacity-90 hover:opacity-100">
                  <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-space-md p-space-md">
                    <div className="flex items-center gap-space-md min-w-0 flex-1">
                      <div className="relative w-14 h-14 rounded-full overflow-hidden flex-shrink-0 ring-2 ring-[#7EE787]/50">
                        <img className="w-full h-full object-cover" data-alt="Ethereal golden dawn ascension scene with celestial cathedral spires piercing high violet clouds, majestic spiritual high fantasy concept artwork." src="https://lh3.googleusercontent.com/aida-public/AB6AXuCC-twOhyN5OUYqR71dqyWH65Y0BfMnH2zyCFIsQwduU3klB-tYYO27z2fE1qPU6NqTfgk9BCRua9E6G4I7_tFvoAH-f4ikklTsFn-idbT3ahOLaPPJWfAYH-rIY5sUbE6imwtQQaRQK9CvPho757dm9CmsbBf0sFYitW5PIZ1W3yuN0VXsHJrwsyKkPM6WRk1pj2Aow5vj2ay4F3KIF6TseG4JBh8BvsWIYy7JxfYZITKZ7dniJ6sx" />
                        <div className="absolute bottom-0 right-0 w-4 h-4 rounded-full bg-[#7EE787] flex items-center justify-center">
                          <span className="material-symbols-outlined text-surface text-[12px] font-bold">check
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-headline-sm text-headline-sm text-on-surface truncate">Ascension to Heaven
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-[#FFCC22]/15 text-[#FFCC22] font-label-sm text-label-sm font-bold flex items-center gap-0.5">
                            <span className="material-symbols-outlined text-[13px] leading-none" style={{ fontVariationSettings: "'FILL' 1" }}>star
                            </span>
                            <span>5.21★
                            </span>
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-surface-container text-tertiary font-label-sm text-label-sm font-semibold">7K
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-on-surface-variant font-body-sm text-body-sm truncate mt-0.5">
                          <span className="text-on-surface font-medium">xi
                          </span>
                          <span>•
                          </span>
                          <span>mapped by{' '}
                            <strong className="text-on-surface-variant font-medium">DeviousPanda
                            </strong>
                          </span>
                          <span>•
                          </span>
                          <span>190 BPM
                          </span>
                          <span>•
                          </span>
                          <span>3:05
                          </span>
                        </div>
                        <div className="flex items-center gap-space-sm mt-1.5 text-on-surface-variant font-label-sm text-label-sm">
                          <span className="flex items-center gap-1 text-[#7EE787] font-semibold">
                            <span className="material-symbols-outlined text-[15px]">check_circle
                            </span>
                            <span>Downloaded • In library
                            </span>
                          </span>
                          <span>•
                          </span>
                          <span className="px-2 py-0.5 rounded bg-surface-container-lowest text-on-surface-variant text-[10px]">Source: nerinyan (fallback)
                          </span>
                        </div>
                      </div>
                    </div>
                    {/* Action Suite */}
                    <div className="flex items-center gap-2 self-end lg:self-center">
                      <button className="w-10 h-10 rounded-full bg-surface-container-high hover:bg-surface-bright text-on-surface-variant hover:text-on-surface flex items-center justify-center transition-all" title="Audio preview" type="button">
                        <span className="material-symbols-outlined text-[20px]">play_arrow
                        </span>
                      </button>
                      <button className="flex items-center gap-1.5 px-space-md h-10 rounded-full bg-surface-container-high hover:bg-surface-bright text-on-surface font-label-md text-label-md transition-all" title="Show file in Explorer" type="button">
                        <span className="material-symbols-outlined text-[18px] text-tertiary">folder_open
                        </span>
                        <span>Open File
                        </span>
                      </button>
                    </div>
                  </div>
                </article>
              </div>
              {/* Pagination / Feed Footer */}
              <div className="flex items-center justify-between pt-space-sm">
                <span className="font-label-sm text-label-sm text-on-surface-variant">Showing 1–5 of 84 beatmaps
                </span>
                <div className="flex items-center gap-1">
                  <button className="w-8 h-8 rounded-full bg-surface-container-low text-on-surface-variant flex items-center justify-center hover:bg-surface-container transition-colors disabled:opacity-30" disabled type="button">
                    <span className="material-symbols-outlined text-[18px]">chevron_left
                    </span>
                  </button>
                  <button className="w-8 h-8 rounded-full bg-primary-container text-on-primary-container font-label-sm text-label-sm font-bold flex items-center justify-center" type="button">1
                  </button>
                  <button className="w-8 h-8 rounded-full bg-surface-container-low text-on-surface-variant font-label-sm text-label-sm hover:bg-surface-container transition-colors flex items-center justify-center" type="button">2
                  </button>
                  <button className="w-8 h-8 rounded-full bg-surface-container-low text-on-surface-variant font-label-sm text-label-sm hover:bg-surface-container transition-colors flex items-center justify-center" type="button">3
                  </button>
                  <button className="w-8 h-8 rounded-full bg-surface-container-low text-on-surface-variant flex items-center justify-center hover:bg-surface-container transition-colors" type="button">
                    <span className="material-symbols-outlined text-[18px]">chevron_right
                    </span>
                  </button>
                </div>
              </div>
            </section>
            {/* Right Rail Column: Download Queue & Controls (4 Cols) */}
            <aside className="xl:col-span-4 flex flex-col gap-space-lg">
              {/* Panel Card 1: Download Queue */}
              <div className="flex flex-col rounded-DEFAULT bg-surface-container-low p-space-lg shadow-md">
                <div className="flex items-center justify-between pb-space-md">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-[20px]">downloading
                    </span>
                    <h2 className="font-headline-sm text-headline-sm text-on-surface">Queue (3 files)
                    </h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="font-label-sm text-label-sm text-on-surface-variant hover:text-on-surface transition-colors" type="button">Pause all
                    </button>
                    <span className="text-outline-variant font-label-sm text-label-sm">•
                    </span>
                    <button className="font-label-sm text-label-sm text-error hover:underline transition-all" type="button">Clear
                    </button>
                  </div>
                </div>
                {/* Queue Items List */}
                <div className="flex flex-col gap-3">
                  {/* Queue Item 1: Active In Progress */}
                  <div className="flex flex-col gap-2 p-space-sm rounded-DEFAULT bg-surface-container">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-col min-w-0">
                        <span className="font-label-md text-label-md text-on-surface truncate font-semibold">Exit This Earth's Atomosphere.osz
                        </span>
                        <span className="font-label-sm text-label-sm text-on-surface-variant">Camellia
                        </span>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button className="w-7 h-7 rounded-full bg-surface-container-high hover:bg-surface-bright text-on-surface flex items-center justify-center transition-all" title="Pause" type="button">
                          <span className="material-symbols-outlined text-[15px]">pause
                          </span>
                        </button>
                        <button className="w-7 h-7 rounded-full bg-surface-container-high hover:bg-error-container hover:text-error text-on-surface-variant flex items-center justify-center transition-all" title="Cancel" type="button">
                          <span className="material-symbols-outlined text-[15px]">close
                          </span>
                        </button>
                      </div>
                    </div>
                    {/* Mini progress track */}
                    <div className="w-full h-1.5 rounded-full bg-surface-container-highest overflow-hidden">
                      <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: "62%" }}>
                      </div>
                    </div>
                    <div className="flex items-center justify-between font-label-sm text-[10px] text-on-surface-variant">
                      <span>18.4 / 29.8 MB · 3.4 MB/s
                      </span>
                      <span className="text-primary font-bold">0:03 remaining
                      </span>
                    </div>
                  </div>
                  {/* Queue Item 2: Queued Item */}
                  <div className="flex items-center justify-between gap-space-sm p-space-sm rounded-DEFAULT bg-surface-container/70 hover:bg-surface-container transition-colors">
                    <div className="flex items-center gap-space-sm min-w-0">
                      <span className="material-symbols-outlined text-[18px] text-outline-variant cursor-grab">drag_indicator
                      </span>
                      <div className="flex flex-col min-w-0">
                        <span className="font-label-md text-label-md text-on-surface truncate">Blue Zenith.osz
                        </span>
                        <span className="font-label-sm text-[10px] text-on-surface-variant">xi • 21.6 MB
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="px-2 py-0.5 rounded-full bg-surface-container-highest font-label-sm text-[10px] text-tertiary">Queued #1
                      </span>
                      <button className="w-7 h-7 rounded-full bg-surface-container-high hover:bg-error-container hover:text-error text-on-surface-variant flex items-center justify-center transition-all" title="Remove" type="button">
                        <span className="material-symbols-outlined text-[14px]">close
                        </span>
                      </button>
                    </div>
                  </div>
                  {/* Queue Item 3: Queued Item */}
                  <div className="flex items-center justify-between gap-space-sm p-space-sm rounded-DEFAULT bg-surface-container/70 hover:bg-surface-container transition-colors">
                    <div className="flex items-center gap-space-sm min-w-0">
                      <span className="material-symbols-outlined text-[18px] text-outline-variant cursor-grab">drag_indicator
                      </span>
                      <div className="flex flex-col min-w-0">
                        <span className="font-label-md text-label-md text-on-surface truncate">Calamity Fortune.osz
                        </span>
                        <span className="font-label-sm text-[10px] text-on-surface-variant">LeaF • 24.1 MB
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="px-2 py-0.5 rounded-full bg-surface-container-highest font-label-sm text-[10px] text-on-surface-variant">Queued #2
                      </span>
                      <button className="w-7 h-7 rounded-full bg-surface-container-high hover:bg-error-container hover:text-error text-on-surface-variant flex items-center justify-center transition-all" title="Remove" type="button">
                        <span className="material-symbols-outlined text-[14px]">close
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
                {/* Connection Summary Footnote */}
                <div className="flex items-center justify-between pt-space-md mt-space-md border-t border-surface-variant font-label-sm text-label-sm text-on-surface-variant">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-primary">
                    </span>
                    <span>Speed: 3.4 MB/s
                    </span>
                  </div>
                  <span>Active slots:{' '}
                    <strong className="text-on-surface font-semibold">1 / 2
                    </strong>
                  </span>
                </div>
              </div>
              {/* Panel Card 2: Download & Storage Settings */}
              <div className="flex flex-col gap-space-md rounded-DEFAULT bg-surface-container-low p-space-lg shadow-md">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-tertiary text-[20px]">folder_special
                  </span>
                  <h2 className="font-headline-sm text-headline-sm text-on-surface">Storage Settings
                  </h2>
                </div>
                {/* Destination Folder Line */}
                <div className="flex flex-col gap-1.5">
                  <span className="font-label-sm text-label-sm text-on-surface-variant">Download directory
                  </span>
                  <div className="flex items-center justify-between gap-space-sm p-space-sm rounded-DEFAULT bg-surface-container">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="material-symbols-outlined text-primary text-[18px] flex-shrink-0">folder
                      </span>
                      <span className="font-label-md text-label-md text-on-surface truncate font-mono">D:\osu downloads
                      </span>
                    </div>
                    <button className="px-3 py-1 rounded-full bg-surface-container-high hover:bg-surface-bright text-on-surface font-label-sm text-label-sm flex-shrink-0 transition-colors" type="button">{' '}Change folder{' '}
                    </button>
                  </div>
                </div>
                {/* Copy Finished Downloads Switch */}
                <div className="flex flex-col gap-2 pt-space-xs">
                  <div className="flex items-center justify-between gap-space-sm">
                    <span className="font-label-md text-label-md text-on-surface font-medium leading-snug">{' '}Copy finished downloads into osu! Songs folder{' '}
                    </span>
                    {/* Toggle control (OFF state) */}
                    <button aria-checked="false" className="relative w-11 h-6 rounded-full bg-surface-container-highest p-0.5 transition-colors focus:outline-none flex-shrink-0 group" role="switch" type="button">
                      <div className="w-5 h-5 rounded-full bg-on-surface shadow-sm transition-transform duration-200">
                      </div>
                    </button>
                  </div>
                  <p className="font-body-sm text-[11px] leading-relaxed text-on-surface-variant">{' '}When enabled, .osz files are automatically extracted and copied into your local osu!/Songs folder for instant in-game availability.{' '}
                  </p>
                </div>
              </div>
              {/* Panel Card 3: Mirror Speed & Redundancy */}
              <div className="flex flex-col gap-space-sm rounded-DEFAULT bg-surface-container-low p-space-lg shadow-md">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#7EE787] text-[20px]">speed
                    </span>
                    <h2 className="font-headline-sm text-headline-sm text-on-surface">Mirror Node Health
                    </h2>
                  </div>
                  <span className="font-label-sm text-[10px] uppercase tracking-wider text-primary font-bold">Auto Route
                  </span>
                </div>
                <div className="flex flex-col gap-2 pt-space-xs">
                  {/* Primary: BeatConnect */}
                  <div className="flex items-center justify-between p-space-sm rounded-DEFAULT bg-surface-container">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-[#7EE787]">
                      </span>
                      <div className="flex flex-col">
                        <span className="font-label-md text-label-md text-on-surface font-semibold">BeatConnect (Primary)
                        </span>
                        <span className="font-label-sm text-[10px] text-on-surface-variant">Global CDN cluster
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="font-label-sm text-label-sm text-[#7EE787] font-bold">42ms
                      </span>
                      <span className="block font-label-sm text-[9px] text-on-surface-variant uppercase">Fast
                      </span>
                    </div>
                  </div>
                  {/* Secondary: Nerinyan */}
                  <div className="flex items-center justify-between p-space-sm rounded-DEFAULT bg-surface-container">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-[#7EE787]">
                      </span>
                      <div className="flex flex-col">
                        <span className="font-label-md text-label-md text-on-surface font-semibold">Nerinyan (Fallback)
                        </span>
                        <span className="font-label-sm text-[10px] text-on-surface-variant">Secondary cache node
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="font-label-sm text-label-sm text-tertiary font-bold">78ms
                      </span>
                      <span className="block font-label-sm text-[9px] text-on-surface-variant uppercase">Active
                      </span>
                    </div>
                  </div>
                  {/* osu! Bancho Fallback */}
                  <div className="flex items-center justify-between p-space-sm rounded-DEFAULT bg-surface-container/60">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-outline-variant">
                      </span>
                      <div className="flex flex-col">
                        <span className="font-label-md text-label-md text-on-surface-variant">Direct osu! Bancho
                        </span>
                        <span className="font-label-sm text-[10px] text-on-surface-variant">Supporter account sync
                        </span>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-surface-container-highest font-label-sm text-[10px] text-secondary">Standby
                    </span>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </div>
    </AppShell>
  )
}

// ---------------------------------------------------------------------------
// Real variant (M6): mode-aware mirror search + downloads.
// ---------------------------------------------------------------------------

type MirrorTab = GameMode | 'all'

interface MirrorResult {
  candidate: RecCandidate
  mode: GameMode
}

/** Neutral starter profile used only to pick a representative
 *  difficulty per set when the visitor has no linked profile. */
function neutralProfile(mode: GameMode) {
  return computeSkillProfile(
    { id: 0, username: '', playmode: mode, statistics: {} },
    [],
    [],
    [],
    mode,
  )
}

const TAB_ORDER: { id: MirrorTab; label: string; dot?: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'osu', label: 'Standard', dot: 'bg-secondary' },
  { id: 'taiko', label: 'Taiko', dot: 'bg-[#FF5C39]' },
  { id: 'fruits', label: 'Catch', dot: 'bg-tertiary' },
  { id: 'mania', label: 'Mania', dot: 'bg-primary-fixed' },
]

function MirrorReal() {
  const globalMode = useModeStore((s) => s.mode)
  const setGlobalMode = useModeStore((s) => s.setMode)
  const { tier } = useAuth()
  const guestSession = useGuestStore((s) => s.session)
  const [tab, setTab] = useState<MirrorTab>(globalMode)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<MirrorResult[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [downloadedTick, setDownloadedTick] = useState(0)
  const runRef = useRef(0)
  const debounceRef = useRef<number | null>(null)

  const username = guestSession?.osuUsername ?? null
  const key = seenKey(tier, username ?? 'mirror')

  const runSearch = useCallback(
    async (q: string, activeTab: MirrorTab) => {
      const run = ++runRef.current
      setBusy(true)
      setError(null)
      try {
        // The proxy search is per-mode (§8), so "All" runs one search
        // per mode and merges, deduped by beatmapset id.
        const modes: GameMode[] = activeTab === 'all' ? [...GAME_MODES] : [activeTab]
        const merged = new Map<number, MirrorResult>()
        let totalSum = 0
        for (const m of modes) {
          const page = await proxyCall<SearchPage>('searchBeatmapsets', {
            mode: m,
            query: q.trim() || undefined,
            filters: { sort: 'plays_desc' },
          })
          if (typeof page.total === 'number') totalSum += page.total
          const profile = neutralProfile(m)
          for (const set of page.beatmapsets ?? []) {
            if (merged.has(set.id)) continue
            const candidate = setToCandidate(set, m, profile)
            if (!candidate) continue
            candidate.reason = `${set.status} · ${(set.play_count ?? 0).toLocaleString('en-US')} plays · ${(set.favourite_count ?? 0).toLocaleString('en-US')} favourites`
            merged.set(set.id, { candidate, mode: m })
          }
        }
        if (runRef.current !== run) return
        setResults([...merged.values()])
        setTotal(totalSum > 0 ? totalSum : null)
      } catch {
        if (runRef.current !== run) return
        setError('Mirror search failed just now — osu! or the proxy may be busy. Try again.')
        setResults([])
      } finally {
        if (runRef.current === run) setBusy(false)
      }
    },
    [],
  )

  // Follow the global mode when it changes elsewhere (top-bar pills).
  useEffect(() => {
    setTab(globalMode)
  }, [globalMode])

  // Initial + tab searches run immediately; typing is debounced.
  useEffect(() => {
    void runSearch(query, tab)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  const onQueryChange = (value: string) => {
    setQuery(value)
    if (debounceRef.current) window.clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(() => {
      void runSearch(value, tab)
    }, 500)
  }

  const pickTab = (next: MirrorTab) => {
    setTab(next)
    // One source of truth (§7): picking a concrete mode tab also sets
    // the global mode; "All" is a Mirror-local view and leaves it be.
    if (next !== 'all') setGlobalMode(next)
  }

  const downloaded = seenStore.load(key).downloaded
  const sessionDownloads = results.filter((r) => downloaded.includes(r.candidate.beatmapsetId))

  return (
    <div className="flex flex-col w-full gap-space-lg">
      <section className="flex flex-col gap-space-md">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-space-md">
          <div className="flex flex-col">
            <div className="flex items-center gap-space-xs text-on-surface-variant font-label-sm text-label-sm uppercase tracking-widest mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping"></span>
              <span>Fast Beatmap Pipeline</span>
              <span className="text-outline-variant">•</span>
              <span>Latency Optimized</span>
            </div>
            <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">
              Mirror — {tab === 'all' ? 'All modes' : MODE_LABELS[tab]}
            </h1>
          </div>
          <div className="flex items-center gap-1.5 p-1 rounded-full bg-surface-container-low shadow-inner">
            {TAB_ORDER.map((t) => {
              const active = tab === t.id
              return (
                <button
                  key={t.id}
                  className={active
                    ? 'flex items-center gap-1.5 px-space-md py-1.5 rounded-full font-label-md text-label-md bg-primary-container text-on-primary-container shadow-[0_0_16px_rgba(164,118,255,0.4)]'
                    : 'flex items-center gap-1.5 px-space-md py-1.5 rounded-full font-label-md text-label-md text-on-surface-variant hover:text-on-surface transition-colors'}
                  type="button"
                  onClick={() => pickTab(t.id)}
                >
                  {t.dot && <span className={`w-2 h-2 rounded-full ${t.dot}`}></span>}
                  <span>{t.label}</span>
                </button>
              )
            })}
          </div>
        </div>
        <p className="font-body-sm text-body-sm text-on-surface-variant -mt-1">
          Downloads are the full beatmapset file (.osz contains every difficulty). The mode changes what you discover and which difficulty is shown.
        </p>
        <div className="flex flex-col gap-space-sm pt-space-xs">
          <div className="relative flex items-center w-full">
            <span className="material-symbols-outlined absolute left-4 text-on-surface-variant text-[22px] pointer-events-none">search</span>
            <input
              className="w-full h-12 pl-12 pr-32 rounded-full bg-surface-container text-on-surface placeholder:text-on-surface-variant/60 font-body-md text-body-md focus:outline-none focus:ring-2 focus:ring-primary shadow-sm transition-all"
              placeholder="Search beatmaps, artists, or mappers"
              type="text"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
            />
            <div className="absolute right-1.5 flex items-center">
              <button
                className="px-space-lg h-9 rounded-full bg-primary text-on-primary font-label-md text-label-md flex items-center gap-1 shadow-md hover:bg-primary-container hover:text-on-primary-container active:scale-95 transition-all"
                type="button"
                onClick={() => void runSearch(query, tab)}
              >
                <span className="material-symbols-outlined text-[18px]">tune</span>
                <span>Search</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-space-xl">
        <section className="xl:col-span-8 flex flex-col gap-space-md min-w-0">
          <div className="flex items-center justify-between pb-1">
            <div className="flex items-center gap-space-sm">
              <span className="font-headline-sm text-headline-sm text-on-surface">Search results</span>
              <span className="px-2 py-0.5 rounded-full bg-surface-container-high font-label-sm text-label-sm text-on-surface-variant font-medium">
                {results.length} beatmapsets{total !== null ? ` · ~${total.toLocaleString('en-US')} on osu!` : ''}
              </span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-surface-container-low font-label-sm text-label-sm">
              <span className="w-2 h-2 rounded-full bg-[#7EE787] animate-pulse"></span>
              <span className="text-on-surface-variant">Mirror status:</span>
              <span className="text-on-surface font-semibold">Online</span>
            </div>
          </div>

          {error && (
            <div className="p-space-md rounded-lg bg-surface-container-low">
              <p className="font-body-sm text-body-sm text-error">{error}</p>
            </div>
          )}
          {busy && results.length === 0 && !error && (
            <p className="font-body-md text-body-md text-on-surface-variant">Searching osu!…</p>
          )}
          {!busy && !error && results.length === 0 && (
            <p className="font-body-md text-body-md text-on-surface-variant">
              No beatmapsets found for this search in {tab === 'all' ? 'any mode' : MODE_LABELS[tab]}. Try a different artist, mapper, or title.
            </p>
          )}
          <div className="flex flex-col gap-3">
            {results.map(({ candidate, mode: entryMode }) => (
              <BeatmapRow
                key={`${entryMode}-${candidate.beatmapsetId}`}
                candidate={candidate}
                mode={entryMode}
                seenKeyValue={key}
                downloaded={downloaded.includes(candidate.beatmapsetId)}
                onDownloaded={() => setDownloadedTick((n) => n + 1)}
              />
            ))}
          </div>
          <span className="hidden">{downloadedTick}</span>
        </section>

        <aside className="xl:col-span-4 flex flex-col gap-space-md">
          <div className="rounded-lg bg-surface-container-low p-space-md shadow-md">
            <h2 className="font-headline-sm text-headline-sm text-on-surface mb-space-sm">Downloaded from Mirror</h2>
            {sessionDownloads.length === 0 ? (
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Nothing downloaded yet this session. Downloads are recorded locally so
                recommendations won't serve the same maps again.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {sessionDownloads.map(({ candidate }) => (
                  <div key={candidate.beatmapsetId} className="flex items-center gap-2 font-label-sm text-label-sm">
                    <span className="material-symbols-outlined text-tertiary text-[16px]">check_circle</span>
                    <span className="text-on-surface truncate">{candidate.title}</span>
                    <span className="text-on-surface-variant">· {candidate.artist}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="rounded-lg bg-surface-container-low p-space-md shadow-md">
            <h2 className="font-headline-sm text-headline-sm text-on-surface mb-space-sm">Mirror sources</h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Hit the download button on a result and your browser
              downloads the .osz straight from a community mirror at full
              speed — RecOsuk hands the file to your browser's download
              manager and never leaves the page. The official osu! option
              opens the osu! page and needs your osu! login there.
            </p>
          </div>
        </aside>
      </div>
    </div>
  )
}

export default function Mirror() {
  const { tier, guestSession } = useAuth()
  if (!isProxyConfigured) return <MirrorDemo />
  return (
    <AppShell
      identity={{
        username: guestSession?.osuUsername ?? 'Guest',
        pp: 0,
        tierLabel: tier === 'account' ? 'account' : tier === 'guest' ? 'guest' : 'mirror browsing',
      }}
    >
      <MirrorReal />
    </AppShell>
  )
}
