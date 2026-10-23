// Converted from Stitch export: stitch-raw/03-generating.html
// M4: the checklist is no longer theatre — each step maps to a real
// stage of the generation pipeline (profile → plays → skill profile →
// first recommendations) via profileService.generateProfile, and the
// screen navigates only when the work is done. Failures show an honest
// error state with retry / continue-with-demo. In demo mode (no proxy
// or no link) the steps animate on a timer and land on the demo stats.
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { isGameMode, MODE_LABELS, type GameMode } from '../lib/mode'
import { isProxyConfigured } from '../lib/osu'
import {
  generateProfile,
  persistProfile,
  readPendingLink,
  seedPlayedSets,
  setWelcomeRecs,
  type GenerationStep,
} from '../lib/profileService'
import { defaultFiltersFor, generateRecommendations } from '../lib/recommend'
import { seenKey, seenStore } from '../lib/seenStore'
import { getGuestSession } from '../lib/guestStore'
import { useAuth } from '../lib/auth'
import { useModeStore } from '../lib/modeStore'

const STEP_LABELS = [
  'Fetching your top plays',
  'Reading your accuracy by star rating',
  'Building your skill profile',
  'Finding maps that train your gap',
] as const

const STEP_DETAIL: Record<number, string> = {
  2: 'Detecting accuracy drops past your comfort band...',
}

const PROGRESS = [8, 32, 58, 84, 100]

function resolveTarget(): { username: string; mode: GameMode } | null {
  const pending = readPendingLink()
  if (pending?.osuUsername) {
    const mode =
      (pending.selectedMode && isGameMode(pending.selectedMode) && pending.selectedMode) ||
      (pending.playmode && isGameMode(pending.playmode) && pending.playmode) ||
      'mania'
    return { username: pending.osuUsername, mode: mode as GameMode }
  }
  const guest = getGuestSession()
  if (guest) return { username: guest.osuUsername, mode: guest.selectedMode }
  return null
}

export default function Generating() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const setMode = useModeStore((s) => s.setMode)
  const [stage, setStage] = useState(0)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const ranRef = useRef(0)

  const target = resolveTarget()
  const demoRun = !isProxyConfigured || !target
  const username = target?.username ?? 'sora_playz'
  const mode: GameMode = target?.mode ?? 'mania'

  useEffect(() => {
    const run = ++ranRef.current
    setStage(0)
    setFailed(false)

    if (demoRun) {
      // Demo mode: animate the checklist, then show the demo stats.
      const timers = [0, 1, 2, 3].map((i) =>
        window.setTimeout(() => {
          if (ranRef.current === run) setStage(i + 1)
        }, 900 * (i + 1)),
      )
      const done = window.setTimeout(() => {
        if (ranRef.current === run) navigate('/onboarding/stats')
      }, 900 * 4 + 600)
      return () => {
        timers.forEach((t) => window.clearTimeout(t))
        window.clearTimeout(done)
      }
    }

    let cancelled = false
    const stepToStage: Record<GenerationStep, number> = {
      profile: 0,
      plays: 1,
      skill: 2,
      recs: 3,
    }
    ;(async () => {
      try {
        setMode(mode)
        const data = await generateProfile(username, mode, (step) => {
          if (!cancelled) setStage(stepToStage[step])
        })
        if (cancelled) return
        const tier = user ? 'account' : 'guest'
        const key = seenKey(tier, username)
        seedPlayedSets(key, data)
        await persistProfile(
          { username, osuUserId: data.user.id, tier },
          mode,
          data,
          { snapshot: Boolean(user) },
        )
        // Pre-generate the welcome set (§5.3) — best-effort; the
        // welcome page generates its own if this fails.
        try {
          const seen = seenStore.load(key)
          const recs = await generateRecommendations(data.skillProfile, mode, {
            count: 10,
            filters: defaultFiltersFor(data.skillProfile),
            seen,
          })
          setWelcomeRecs(username, mode, recs.items)
          seenStore.markMany(key, 'served', recs.items.map((c) => c.beatmapsetId))
        } catch {
          /* welcome page will generate on its own */
        }
        if (cancelled) return
        setStage(4)
        window.setTimeout(() => {
          if (!cancelled) navigate('/onboarding/stats')
        }, 650)
      } catch {
        if (!cancelled) setFailed(true)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt])

  const pct = PROGRESS[Math.min(stage, 4)]

  const rowState = (i: number): 'done' | 'active' | 'queued' => {
    if (failed) return i < stage ? 'done' : i === stage ? 'active' : 'queued'
    return i < stage ? 'done' : i === stage ? 'active' : 'queued'
  }

  return (
    <div className="osu-grid-bg text-slate-100 font-inter antialiased min-h-screen flex flex-col justify-between select-none relative overflow-x-hidden">
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 ambient-glow-mania z-0">
    </div>
    <header className="relative z-10 w-full px-8 py-7 flex items-center justify-between max-w-7xl mx-auto">
      <div className="flex items-center space-x-3" data-purpose="brand-logo">
        <div className="w-10 h-10 rounded-full bg-[#FF66AA] flex items-center justify-center shadow-[0_0_18px_rgba(255,102,170,0.65)]">
          <span className="font-outfit font-black text-white text-base tracking-tighter lowercase">osu!</span>
        </div>
        <div className="font-outfit font-bold text-2xl tracking-tight flex items-center text-white">
          <span>Rec</span>
          <span className="text-[#FF66AA]">Osuk</span>
        </div>
      </div>
      <div className="flex items-center space-x-2 px-4 py-1.5 rounded-full bg-[#201530] border border-[#3b2959] text-xs font-medium text-slate-300 shadow-sm" data-purpose="step-indicator">
        <span className="w-2 h-2 rounded-full bg-[#9D6BFF] shadow-[0_0_8px_#9D6BFF]"></span>
        <span>Step 3 of 6 • Profile analysis</span>
      </div>
    </header>
    <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 py-4 max-w-4xl mx-auto w-full text-center">
      <div className="mb-5 inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-[#1F1630]/90 border border-[#442F6B]/60 shadow-[0_4px_16px_rgba(0,0,0,0.4)] backdrop-blur-sm" data-purpose="player-profile-badge">
        <div className="relative w-6 h-6 rounded-full bg-gradient-to-br from-[#9D6BFF] to-[#FF66AA] p-[1.5px] flex items-center justify-center">
          <div className="w-full h-full rounded-full bg-[#1E132D] flex items-center justify-center text-[10px] font-bold text-purple-200">{username.slice(0, 2).toUpperCase()}</div>
          <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-[#7EE787] border-2 border-[#1E132D] rounded-full"></span>
        </div>
        <span className="font-semibold text-xs tracking-tight text-slate-200">{username}</span>
        <span className="text-xs text-[#7A7289] font-medium">• {MODE_LABELS[mode]}</span>
      </div>
      <div className="relative w-44 h-44 mb-6 flex items-center justify-center" data-purpose="osu-hit-circle-graphic">
        <div aria-hidden="true" className="absolute inset-2 rounded-full border border-[#9D6BFF]/20"></div>
        <div aria-hidden="true" className="absolute inset-0 rounded-full border-2 border-[#C9ADFF]/70 animate-approach-ring pointer-events-none"></div>
        <div aria-hidden="true" className="absolute w-full h-full flex items-center justify-center pointer-events-none">
          <div className="orbit-star">
            <div className="w-6 h-6 rounded-full bg-[#FFCC22] flex items-center justify-center shadow-[0_0_12px_#FFCC22] text-[#1E132D] font-black text-xs">★</div>
          </div>
        </div>
        <div className="relative w-32 h-32 rounded-full bg-gradient-to-br from-[#B388FF] via-[#9D6BFF] to-[#7A3EF5] border-4 border-white/95 flex flex-col items-center justify-center animate-circle-glow cursor-default shadow-2xl">
          <span className="font-outfit font-black text-white text-5xl leading-none drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">3</span>
          <span className="font-outfit font-extrabold text-[11px] uppercase tracking-wider text-white/90 drop-shadow-sm mt-0.5">RECOSUK</span>
        </div>
      </div>
      <h1 className="font-outfit font-extrabold text-4xl md:text-5xl tracking-tight text-white mb-2 leading-tight">Building your{' '}
        <span className="text-[#9D6BFF] drop-shadow-[0_0_20px_rgba(157,107,255,0.7)]">{MODE_LABELS[mode]}</span>{' '}profile{' '}
      </h1>
      <p className="text-slate-300 font-inter text-sm md:text-base max-w-xl mx-auto font-normal leading-relaxed mb-6">
        {demoRun ? (
          <>Analyzing <span className="font-semibold text-slate-100">12,430</span> plays across <span className="font-semibold text-slate-100">7K</span> beatmaps for <span className="text-[#FF66AA] font-semibold">sora_playz</span> (demo data)</>
        ) : (
          <>Analyzing the plays of <span className="text-[#FF66AA] font-semibold">{username}</span> in {MODE_LABELS[mode]} — live from osu!</>
        )}
      </p>
      <div className="w-full max-w-xl bg-[#221832]/85 backdrop-blur-md rounded-2xl border border-[#3E2B5C]/70 p-5 md:p-6 shadow-[0_16px_36px_rgba(0,0,0,0.45)] text-left" data-purpose="checklist-progress-panel">
        <div className="mb-5" data-purpose="meter">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="font-medium text-slate-300 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#9D6BFF] animate-ping"></span>Profile synthesis progress{' '}
            </span>
            <span className="font-mono font-bold text-sm text-[#FF66AA] tabular-nums">{failed ? '—' : `${pct}%`}</span>
          </div>
          <div className="w-full h-2 rounded-full bg-[#140D20] overflow-hidden p-[1px]">
            <div className="h-full rounded-full bg-gradient-to-r from-[#9D6BFF] via-[#BD7FFF] to-[#FF66AA] shadow-[0_0_12px_rgba(255,102,170,0.8)] transition-all duration-700 ease-out" style={{ width: `${pct}%` }}></div>
          </div>
        </div>
        <div className="space-y-2.5" data-purpose="checklist-items">
          {STEP_LABELS.map((label, i) => {
            const state = rowState(i)
            return (
              <div
                key={label}
                className={
                  state === 'active'
                    ? 'flex items-center justify-between p-2.5 rounded-xl bg-[#2A1C40] border border-[#9D6BFF]/70 shadow-[0_0_18px_rgba(157,107,255,0.22)]'
                    : state === 'done'
                      ? 'flex items-center justify-between p-2.5 rounded-xl bg-[#1B1327]/60 border border-[#35254D] transition-colors'
                      : 'flex items-center justify-between p-2.5 rounded-xl bg-[#181123]/40 border border-[#2D2040]/70 opacity-60'
                }
              >
                <div className="flex items-center space-x-3">
                  {state === 'done' ? (
                    <div className="w-6 h-6 rounded-full bg-[#7EE787]/15 border border-[#7EE787]/60 flex items-center justify-center text-[#7EE787] shadow-[0_0_8px_rgba(126,231,135,0.3)]">
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                        <path clipRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" fillRule="evenodd"></path>
                      </svg>
                    </div>
                  ) : state === 'active' ? (
                    <div className="w-6 h-6 rounded-full border-2 border-[#9D6BFF]/25 border-t-[#9D6BFF] animate-spin flex items-center justify-center"></div>
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-[#2A1D3A] border border-[#44335C] flex items-center justify-center">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#7A7289]"></span>
                    </div>
                  )}
                  <div>
                    <p className={`text-sm ${state === 'active' ? 'font-bold text-white' : state === 'done' ? 'font-semibold text-slate-200' : 'font-medium text-[#7A7289]'}`}>{label}</p>
                    {state === 'active' && STEP_DETAIL[i] && (
                      <p className="text-[11px] text-[#C9ADFF] font-medium">{STEP_DETAIL[i]}</p>
                    )}
                  </div>
                </div>
                <span
                  className={
                    state === 'done'
                      ? 'text-xs font-medium px-2.5 py-0.5 rounded-full bg-[#7EE787]/10 text-[#7EE787] border border-[#7EE787]/25'
                      : state === 'active'
                        ? 'text-xs font-medium px-2.5 py-0.5 rounded-full bg-[#9D6BFF]/25 text-[#E3D4FF] border border-[#9D6BFF]/50 animate-pulse'
                        : 'text-xs font-medium px-2.5 py-0.5 rounded-full bg-slate-800/40 text-[#7A7289] border border-slate-700/30'
                  }
                >
                  {state === 'done' ? 'Done' : state === 'active' ? 'Processing' : 'Queued'}
                </span>
              </div>
            )
          })}
        </div>
        <p className="mt-4 text-[11px] text-[#9D93AD] flex items-center gap-1.5 font-normal leading-tight" data-purpose="info-footnote">
          <svg className="w-3.5 h-3.5 text-[#9D6BFF] flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path clipRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" fillRule="evenodd"></path>
          </svg>This runs once per mode. Switching modes later builds that mode's profile on the spot.{' '}
        </p>
      </div>
      <div className="mt-7 flex flex-col items-center gap-3 w-full" data-purpose="actions">
        {failed ? (
          <div className="flex flex-col items-center gap-3 w-full max-w-md">
            <p className="text-sm text-[#ffb4ab] font-medium" role="alert">
              We couldn't reach osu! just now — the proxy or osu! itself may be down. Your link is saved; retry, or continue with the demo profile.
            </p>
            <div className="flex items-center justify-center gap-3 w-full">
              <button className="inline-flex items-center justify-center px-6 py-2.5 rounded-xl font-outfit font-bold text-sm text-white bg-gradient-to-r from-[#FF66AA] to-[#f44795] shadow-[0_0_24px_rgba(255,102,170,0.5)] transition duration-200 active:scale-[0.98] gap-2 cursor-pointer" type="button" onClick={(e) => { e.stopPropagation(); setAttempt((n) => n + 1) }}>
                <span>Retry</span>
              </button>
              <button className="inline-flex items-center justify-center px-6 py-2.5 rounded-xl font-outfit font-bold text-sm text-slate-200 bg-[#201530] border border-[#3E2B5C] transition duration-200 active:scale-[0.98] cursor-pointer" type="button" onClick={(e) => { e.stopPropagation(); navigate('/onboarding/stats') }}>
                <span>Continue with demo</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-3 w-full max-w-md">
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#201530] border border-[#3E2B5C] text-xs font-medium text-slate-300 cursor-default">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#9D6BFF] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#9D6BFF]"></span>
              </span>
              <span>{demoRun ? 'Playing the demo…' : 'Analyzing live data...'}</span>
            </div>
            <button className="inline-flex items-center justify-center px-6 py-2.5 rounded-xl font-outfit font-bold text-sm text-white bg-gradient-to-r from-[#FF66AA] to-[#f44795] hover:from-[#ff77b4] hover:to-[#ff529e] shadow-[0_0_24px_rgba(255,102,170,0.5)] transition duration-200 active:scale-[0.98] gap-2 cursor-pointer" type="button" onClick={(e) => { e.stopPropagation(); navigate('/welcome-recs') }}>
              <span>Skip to recommendations</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" strokeLinecap="round" strokeLinejoin="round"></path>
              </svg>
            </button>
          </div>
        )}
        <button className="text-xs text-[#8A8199] hover:text-slate-300 transition-colors py-1 cursor-pointer" type="button" onClick={(e) => { e.stopPropagation(); navigate('/onboarding/link') }}>Cancel and back to account selection{' '}</button>
      </div>
    </main>
    <footer className="relative z-10 w-full px-8 py-5 border-t border-[#291E3B]/70 bg-[#120B1A]/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto flex items-center justify-between text-xs">
        <div className="flex items-center space-x-3" data-purpose="current-player-status">
          <div className="w-8 h-8 rounded-full bg-[#2A1D3F] border border-[#44335F] flex items-center justify-center font-bold text-[11px] text-[#C9ADFF] shadow-inner">{username.slice(0, 2).toUpperCase()}</div>
          <div className="text-left">
            <div className="text-[#7A7289] text-[11px] font-medium leading-tight">Ready for player</div>
            <div className="text-slate-200 font-semibold tracking-tight">{username}</div>
          </div>
        </div>
        <nav aria-label="Onboarding Progress" className="flex items-center space-x-2" data-purpose="pagination-dots">
          <span className="w-2.5 h-2.5 rounded-full bg-[#FF66AA] opacity-75 cursor-default" title="Step 1 completed"></span>
          <span className="w-2.5 h-2.5 rounded-full bg-[#FF66AA] opacity-75 cursor-default" title="Step 2 completed"></span>
          <span className="w-8 h-2.5 rounded-full bg-gradient-to-r from-[#9D6BFF] to-[#FF66AA] shadow-[0_0_12px_#9D6BFF] cursor-default" title="Step 3: Current step"></span>
          <span className="w-2.5 h-2.5 rounded-full bg-[#2F2145] cursor-default" title="Step 4"></span>
          <span className="w-2.5 h-2.5 rounded-full bg-[#2F2145] cursor-default" title="Step 5"></span>
          <span className="w-2.5 h-2.5 rounded-full bg-[#2F2145] cursor-default" title="Step 6"></span>
        </nav>
        <div className="text-[#7A7289] font-medium flex items-center gap-1.5" data-purpose="auto-advance-indicator">
          <span className="w-1.5 h-1.5 rounded-full bg-[#7EE787] animate-pulse"></span>
          <span>Auto-advancing on completion...</span>
        </div>
      </div>
    </footer>
    </div>
  )
}
