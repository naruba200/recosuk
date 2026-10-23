// Converted from Stitch export: stitch-raw/12-auth.html
import { useState, type FormEvent, type MouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { NOT_CONFIGURED, useAuth } from '../lib/auth'

type Notice = { kind: 'error' | 'note'; text: string } | null

const TAB_ACTIVE =
  'py-2.5 px-4 rounded-full font-label-md text-label-md bg-secondary-container text-on-secondary-container shadow-sm flex items-center justify-center gap-2 transition-all cursor-pointer font-bold'
const TAB_INACTIVE =
  'py-2.5 px-4 rounded-full font-label-md text-label-md text-on-surface-variant hover:text-on-surface transition-all flex items-center justify-center gap-2 cursor-pointer'

const DEMO_NOTICE =
  "Demo mode — Supabase isn't connected yet, so accounts can't be created or signed in. Connect it with docs/M1-SETUP.md, then try again."

export default function Auth() {
  const navigate = useNavigate()
  const { signUp, signIn, configured } = useAuth()
  const [activeTab, setActiveTab] = useState<'signup' | 'signin'>('signup')
  const [signupEmail, setSignupEmail] = useState('sora.plays.osu@gmail.com')
  const [signupPassword, setSignupPassword] = useState('masterKey2024!')
  const [osuUsername, setOsuUsername] = useState('sora_playz')
  const [signinEmail, setSigninEmail] = useState('sora.plays.osu@gmail.com')
  const [signinPassword, setSigninPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)

  // Clicks on wired controls must not be double-handled by the
  // label-based NavigationBridge in App.tsx.
  const stop = (e: MouseEvent) => e.stopPropagation()

  const oauthNotice = (e: MouseEvent) => {
    stop(e)
    setNotice({
      kind: 'note',
      text: 'osu! / GitHub sign-in arrives in a later milestone — email sign-in is the M1 path.',
    })
  }

  async function handleSignUp(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    if (!configured) {
      setNotice({ kind: 'error', text: DEMO_NOTICE })
      return
    }
    setBusy(true)
    const { error } = await signUp(signupEmail.trim(), signupPassword)
    setBusy(false)
    if (error) {
      setNotice({
        kind: 'error',
        text: error === NOT_CONFIGURED ? DEMO_NOTICE : error,
      })
      return
    }
    // Carry the optional osu! username into the link step (guest
    // profiles carry over the same way via the guest store).
    if (osuUsername.trim()) {
      try {
        window.localStorage.setItem(
          'recosuk-pending-link',
          JSON.stringify({ osuUsername: osuUsername.trim() }),
        )
      } catch {
        /* storage unavailable — the link step just starts blank */
      }
    }
    navigate('/onboarding/link')
  }

  async function handleSignIn(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    if (!configured) {
      setNotice({ kind: 'error', text: DEMO_NOTICE })
      return
    }
    setBusy(true)
    const { error } = await signIn(signinEmail.trim(), signinPassword)
    setBusy(false)
    if (error) {
      setNotice({
        kind: 'error',
        text: error === NOT_CONFIGURED ? DEMO_NOTICE : error,
      })
      return
    }
    navigate('/onboarding/link')
  }

  return (
    <div className="bg-grid-osu flex flex-col justify-between min-h-screen relative selection:bg-[#FF66AA] selection:text-white">
    {/* Ambient Glow Blobs */}
    <div className="fixed top-[-100px] left-1/2 -translate-x-1/2 w-[720px] h-[450px] bg-[#FF66AA]/12 rounded-full blur-[140px] pointer-events-none -z-10">
    </div>
    <div className="fixed bottom-[-80px] right-[-40px] w-[500px] h-[500px] bg-[#9D6BFF]/10 rounded-full blur-[120px] pointer-events-none -z-10">
    </div>
    <div className="fixed top-[30%] left-[-100px] w-[450px] h-[450px] bg-[#4CC3FF]/08 rounded-full blur-[120px] pointer-events-none -z-10">
    </div>
    {/* Minimal Header / Brand Indicator */}
    <header className="w-full px-12 py-8 flex items-center justify-between z-10">
      <div className="flex items-center gap-3">
        {/* Mini hit circle logo */}
        <div className="w-9 h-9 rounded-full bg-[#FF66AA] flex items-center justify-center shadow-lg shadow-[#FF66AA]/30 text-white font-outfit font-black text-base border-2 border-white/30">{' '}osu!{' '}
        </div>
        <span className="font-outfit font-black text-xl tracking-tight text-[#F5F1FA]">Rec
          <span className="text-[#FF66AA]">Osuk
          </span>
        </span>
      </div>
      {/* Step Badge */}
      <div className="flex items-center gap-2 bg-[#221832] border border-[#FF66AA]/20 rounded-full px-4 py-1.5 shadow-sm">
        <span className="w-2 h-2 rounded-full bg-[#FF66AA] animate-ping">
        </span>
        <span className="text-xs font-semibold text-[#A59AB5]">Step 1 of 6 • Introduction
        </span>
      </div>
    </header>
    {/* Central Stage */}
    <main className="w-full max-w-4xl mx-auto px-6 py-4 flex flex-col items-center text-center z-10 my-auto">
      <div className="flex flex-col w-full">
        <div className="relative w-full max-w-lg mx-auto flex flex-col items-center justify-center py-6 px-2">
          {/* Ambient rhythmic aura glow */}
          <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-80 h-80 bg-primary-container/10 rounded-full blur-[100px] pointer-events-none">
          </div>
          <div className="absolute top-1/3 -right-20 w-64 h-64 bg-secondary/10 rounded-full blur-[90px] pointer-events-none">
          </div>
          {/* Centered Brand Identity */}
          <div className="flex flex-col items-center text-center mb-8 relative z-10">
            <div className="flex items-center gap-3 mb-2.5">
              <div className="relative flex items-center justify-center">
                <div className="w-12 h-12 rounded-full bg-secondary-container flex items-center justify-center shadow-lg shadow-secondary-container/40">
                  <span className="font-headline-md text-headline-md text-on-secondary font-black tracking-tighter">osu!
                  </span>
                </div>
                <span className="absolute -inset-1 rounded-full border border-secondary/30 animate-pulse pointer-events-none">
                </span>
              </div>
              <div className="flex flex-col items-start leading-none text-left">
                <span className="font-headline-lg text-headline-lg tracking-tight text-on-surface">Rec
                  <span className="text-secondary">Osuk
                  </span>
                </span>
                <span className="font-label-sm text-label-sm text-outline tracking-widest uppercase mt-0.5">rhythm companion
                </span>
              </div>
            </div>
            <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface-container-high text-on-surface-variant font-label-sm text-label-sm shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-ping">
              </span>
              <span className="tracking-wider font-semibold">ACCOUNT GATEWAY · OAUTH & BANCHO SYNC
              </span>
            </div>
          </div>
          {/* Main Card Container */}
          <div className="w-full bg-surface-container-low/95 rounded-lg p-6 sm:p-8 shadow-2xl relative z-10 backdrop-blur-xl">
            {/* Top Mode Switcher Tabs */}
            <div className="grid grid-cols-2 p-1.5 bg-surface-container-lowest rounded-full mb-8" id="auth-tab-bar">
              <button className={activeTab === 'signin' ? TAB_ACTIVE : TAB_INACTIVE} id="tab-signin" type="button" onClick={(e) => { stop(e); setActiveTab('signin') }}>
                <span className="material-symbols-outlined text-sm">login
                </span>{' '}Sign in{' '}
              </button>
              <button className={activeTab === 'signup' ? TAB_ACTIVE : TAB_INACTIVE} id="tab-signup" type="button" onClick={(e) => { stop(e); setActiveTab('signup') }}>
                <span className="material-symbols-outlined text-sm">person_add
                </span>{' '}Create account{' '}
              </button>
            </div>
            {notice && (
              <p
                className={`mb-4 text-left font-body-sm text-body-sm ${notice.kind === 'error' ? 'text-error' : 'text-tertiary'}`}
                role="alert"
              >
                {notice.text}
              </p>
            )}
            {/* Auth Form Stage */}
            <div className={activeTab === 'signup' ? 'flex flex-col' : 'hidden flex-col'} id="signup-panel">
              <div className="mb-6 text-left">
                <h2 className="font-headline-sm text-headline-sm text-on-surface tracking-tight mb-1">Create your RecOsuk account
                </h2>
                <p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">{' '}Keep your calibrated beatmap drills, pp recommendations, and custom collections synced across devices.{' '}
                </p>
              </div>
              <form className="flex flex-col gap-4 text-left" onSubmit={handleSignUp}>
                {/* Email Input — neutral state; real errors surface in
                    the notice area above the form (M4 cleanup: the
                    Stitch export baked a fake "already registered"
                    error into this field regardless of input). */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between items-baseline">
                    <label className="font-label-md text-label-md text-on-surface font-semibold" htmlFor="email-field">Email address
                    </label>
                  </div>
                  <div className="relative flex items-center">
                    <input className="w-full bg-surface-container px-4 py-3 pl-11 rounded-full text-on-surface font-body-md text-body-md focus:outline-none transition-all placeholder:text-outline" id="email-field" placeholder="you@domain.com" type="email" value={signupEmail} onChange={(e) => setSignupEmail(e.target.value)} />
                    <span className="material-symbols-outlined absolute left-3.5 text-outline text-lg">mail
                    </span>
                  </div>
                </div>
                {/* Password Input */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between items-baseline">
                    <label className="font-label-md text-label-md text-on-surface font-semibold" htmlFor="password-field">Password
                    </label>
                    <span className="font-label-sm text-label-sm text-outline">Minimum 8 characters
                    </span>
                  </div>
                  <div className="relative flex items-center">
                    <input className="w-full bg-surface-container px-4 py-3 pl-11 pr-11 rounded-full text-on-surface font-body-md text-body-md focus:bg-surface-container-high focus:outline-none transition-all placeholder:text-outline" id="password-field" placeholder="••••••••••••" type="password" value={signupPassword} onChange={(e) => setSignupPassword(e.target.value)} />
                    <span className="material-symbols-outlined absolute left-3.5 text-outline text-lg">lock
                    </span>
                    <button className="absolute right-3.5 text-outline hover:text-on-surface transition-colors cursor-pointer p-0.5 flex items-center" title="Toggle password visibility" type="button">
                      <span className="material-symbols-outlined text-lg" id="pw-visibility-icon">visibility
                      </span>
                    </button>
                  </div>
                  {/* Dynamic Strength Bar */}
                  <div className="flex items-center gap-1 px-1 mt-0.5">
                    <span className="h-1 flex-1 rounded-full bg-secondary">
                    </span>
                    <span className="h-1 flex-1 rounded-full bg-secondary">
                    </span>
                    <span className="h-1 flex-1 rounded-full bg-secondary">
                    </span>
                    <span className="h-1 flex-1 rounded-full bg-surface-container-highest">
                    </span>
                    <span className="font-label-sm text-label-sm text-secondary ml-1 font-semibold">Strong
                    </span>
                  </div>
                </div>
                {/* osu! Username Link Field */}
                <div className="flex flex-col gap-1.5 mt-1">
                  <div className="flex justify-between items-baseline">
                    <label className="font-label-md text-label-md text-on-surface font-semibold flex items-center gap-1.5" htmlFor="osu-username">{' '}osu! Username{' '}
                      <span className="text-[10px] px-1.5 py-0.2 bg-surface-container-high rounded text-on-surface-variant font-medium">Bancho ID
                      </span>
                    </label>
                    <div className="flex items-center gap-1 text-tertiary font-label-sm text-label-sm">
                      <span className="w-1.5 h-1.5 rounded-full bg-tertiary animate-pulse">
                      </span>
                      <span>Bancho Ready
                      </span>
                    </div>
                  </div>
                  <div className="relative flex items-center">
                    <input className="w-full bg-surface-container px-4 py-3 pl-11 pr-24 rounded-full text-on-surface font-body-md text-body-md focus:bg-surface-container-high focus:outline-none transition-all placeholder:text-outline" id="osu-username" placeholder="e.g. sora_playz" type="text" value={osuUsername} onChange={(e) => setOsuUsername(e.target.value)} />
                    <div className="absolute left-3 w-5 h-5 rounded-full bg-secondary-container flex items-center justify-center text-[9px] font-black text-on-secondary">{' '}o!{' '}
                    </div>
                    <div className="absolute right-3 flex items-center gap-1 bg-surface-container-high px-2 py-0.5 rounded-full">
                      <span className="material-symbols-outlined text-xs text-tertiary">check_circle
                      </span>
                      <span className="font-label-sm text-label-sm text-on-surface font-medium">5,284 pp
                      </span>
                    </div>
                  </div>
                  <span className="font-label-sm text-label-sm text-outline px-2">{' '}Optional now — you can link later, and guest profiles carry over automatically.{' '}
                  </span>
                </div>
                {/* Primary Submit Button */}
                <button className="mt-3 w-full py-3.5 px-6 rounded-full bg-secondary-container text-on-secondary hover:brightness-110 active:scale-[0.98] font-headline-sm text-headline-sm transition-all shadow-xl shadow-secondary-container/20 flex items-center justify-center gap-2 cursor-pointer font-bold" type="submit" onClick={stop}>
                  <span className="material-symbols-outlined text-lg">bolt
                  </span>{' '}Create account{' '}
                </button>
              </form>
              {/* Divider with Beatmap Grid Dot */}
              <div className="relative flex items-center justify-center my-5">
                <div className="w-full h-px bg-surface-container-highest">
                </div>
                <span className="absolute bg-surface-container-low px-3 font-label-sm text-label-sm text-outline uppercase tracking-wider">{' '}or continue with{' '}
                </span>
              </div>
              {/* Social OAuth Suite */}
              <div className="grid grid-cols-2 gap-3">
                {/* osu! Official OAuth */}
                <button className="w-full py-2.5 px-3 rounded-full bg-surface-container-high hover:bg-surface-bright text-on-surface font-label-md text-label-md flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm active:scale-95" type="button" onClick={oauthNotice}>
                  <div className="w-4 h-4 rounded-full bg-secondary-container flex items-center justify-center text-[8px] font-black text-on-secondary">{' '}o!{' '}
                  </div>{' '}osu! Bancho{' '}
                </button>
                {/* GitHub OAuth Button */}
                <button className="w-full py-2.5 px-3 rounded-full bg-surface-container-high hover:bg-surface-bright text-on-surface font-label-md text-label-md flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm active:scale-95" type="button" onClick={oauthNotice}>
                  <svg aria-hidden="true" className="w-4 h-4 fill-currentColor" viewBox="0 0 24 24">
                    <path clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" fillRule="evenodd">
                    </path>
                  </svg>{' '}GitHub{' '}
                </button>
              </div>
            </div>
            {/* Sign In Alternate State (Hidden initially via script toggle) */}
            <div className={activeTab === 'signin' ? 'flex flex-col text-left' : 'hidden flex-col text-left'} id="signin-panel">
              <div className="mb-6">
                <h2 className="font-headline-sm text-headline-sm text-on-surface tracking-tight mb-1">Welcome back, player
                </h2>
                <p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">{' '}Enter your credentials to access your skill telemetry, hit-error calibrations, and training routine.{' '}
                </p>
              </div>
              <form className="flex flex-col gap-4" onSubmit={handleSignIn}>
                <div className="flex flex-col gap-1.5">
                  <label className="font-label-md text-label-md text-on-surface font-semibold" htmlFor="signin-email">Email or osu! Username
                  </label>
                  <div className="relative flex items-center">
                    <input className="w-full bg-surface-container px-4 py-3 pl-11 rounded-full text-on-surface font-body-md text-body-md focus:bg-surface-container-high focus:outline-none transition-all placeholder:text-outline" id="signin-email" placeholder="sora_playz or player@osu.sh" type="text" value={signinEmail} onChange={(e) => setSigninEmail(e.target.value)} />
                    <span className="material-symbols-outlined absolute left-3.5 text-primary text-lg">account_circle
                    </span>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between items-baseline">
                    <label className="font-label-md text-label-md text-on-surface font-semibold" htmlFor="signin-pw">Password
                    </label>
                    <a className="font-label-sm text-label-sm text-primary hover:underline" href="#">Forgot?
                    </a>
                  </div>
                  <div className="relative flex items-center">
                    <input className="w-full bg-surface-container px-4 py-3 pl-11 rounded-full text-on-surface font-body-md text-body-md focus:bg-surface-container-high focus:outline-none transition-all placeholder:text-outline" id="signin-pw" placeholder="Your secret key" type="password" value={signinPassword} onChange={(e) => setSigninPassword(e.target.value)} />
                    <span className="material-symbols-outlined absolute left-3.5 text-outline text-lg">lock
                    </span>
                  </div>
                </div>
                <button className="mt-2 w-full py-3.5 px-6 rounded-full bg-primary-container text-on-primary hover:brightness-110 active:scale-[0.98] font-headline-sm text-headline-sm transition-all shadow-xl shadow-primary-container/20 flex items-center justify-center gap-2 cursor-pointer font-bold" type="submit" onClick={stop}>
                  <span className="material-symbols-outlined text-lg">login
                  </span>{' '}Sign in to stage{' '}
                </button>
              </form>
              <div className="relative flex items-center justify-center my-5">
                <div className="w-full h-px bg-surface-container-highest">
                </div>
                <span className="absolute bg-surface-container-low px-3 font-label-sm text-label-sm text-outline uppercase tracking-wider">{' '}or instant login{' '}
                </span>
              </div>
              <button className="w-full py-2.5 px-4 rounded-full bg-surface-container-high hover:bg-surface-bright text-on-surface font-label-md text-label-md flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm" type="button" onClick={oauthNotice}>
                <div className="w-4 h-4 rounded-full bg-secondary-container flex items-center justify-center text-[8px] font-black text-on-secondary">{' '}o!{' '}
                </div>{' '}One-Click Bancho Login{' '}
              </button>
            </div>
            {/* Quiet Guest Panel Underneath */}
            <div className="mt-6 p-4 rounded-xl bg-surface-container-lowest/80 text-left flex flex-col gap-2.5">
              <div className="flex items-start gap-2.5">
                <span className="material-symbols-outlined text-tertiary text-base mt-0.5">visibility
                </span>
                <p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">{' '}Just want to look? Link your osu! username as a guest instead — you'll get your profile, stats, and recommendations. Saving, lists, and ratings need an account.{' '}
                </p>
              </div>
              <div className="flex justify-end pt-1">
                <a className="inline-flex items-center gap-1.5 font-label-md text-label-md text-secondary hover:text-secondary-fixed hover:underline font-bold transition-colors cursor-pointer group" href="#guest-stage" onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate('/onboarding/link') }}>
                  <span>Continue as guest
                  </span>
                  <span className="material-symbols-outlined text-sm group-hover:translate-x-1 transition-transform">arrow_forward
                  </span>
                </a>
              </div>
            </div>
          </div>
          {/* Micro-telemetry Status Footer in Stage */}
          <div className="mt-6 flex items-center justify-center gap-4 text-outline font-label-sm text-label-sm">
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-tertiary">
              </span>{' '}API v2 Online{' '}
            </span>
            <span>•
            </span>
            <span>Latency: 14ms (Tokyo-01)
            </span>
            <span>•
            </span>
            <span>v2.4.9
            </span>
          </div>
        </div>
      </div>
    </main>
    {/* Bottom Navigation / Progress Dots */}
    <footer className="w-full px-12 py-8 flex items-center justify-between z-10 border-t border-white/5 bg-[#150F1F]/60 backdrop-blur-md">
      {/* Player hint preview */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-[#9D6BFF]/20 border border-[#9D6BFF]/50 flex items-center justify-center text-xs font-bold text-[#9D6BFF]">{' '}VN{' '}
        </div>
        <div className="text-left">
          <span className="text-xs text-[#A59AB5] block">Ready for player
          </span>
          <span className="text-xs font-bold text-[#F5F1FA]">sora_playz (5,284 pp)
          </span>
        </div>
      </div>
      {/* Progress Dots (Step 1 of 6) */}
      <div className="flex items-center gap-3">
        {/* Step 1: Active */}
        <div className="w-7 h-2.5 rounded-full bg-[#FF66AA] shadow-sm shadow-[#FF66AA]/50 transition-all">
        </div>
        {/* Steps 2 to 6 */}
        <div className="w-2.5 h-2.5 rounded-full bg-[#35284D] hover:bg-[#4a396b] transition-colors cursor-pointer" title="Step 2: Connect Profile">
        </div>
        <div className="w-2.5 h-2.5 rounded-full bg-[#35284D] hover:bg-[#4a396b] transition-colors cursor-pointer" title="Step 3: Select Game Modes">
        </div>
        <div className="w-2.5 h-2.5 rounded-full bg-[#35284D] hover:bg-[#4a396b] transition-colors cursor-pointer" title="Step 4: Skill Analysis">
        </div>
        <div className="w-2.5 h-2.5 rounded-full bg-[#35284D] hover:bg-[#4a396b] transition-colors cursor-pointer" title="Step 5: Training Goals">
        </div>
        <div className="w-2.5 h-2.5 rounded-full bg-[#35284D] hover:bg-[#4a396b] transition-colors cursor-pointer" title="Step 6: First Beatmap Pack">
        </div>
      </div>
      {/* Keyboard Shortcut or Quick Hint */}
      <div className="text-xs text-[#726585] hidden md:flex items-center gap-1.5 font-medium">{' '}Press{' '}
        <kbd className="px-2 py-0.5 rounded bg-[#221832] border border-[#35284D] text-[#A59AB5] font-mono text-[11px]">Enter
        </kbd>{' '}to continue{' '}
      </div>
    </footer>
    </div>
  )
}
