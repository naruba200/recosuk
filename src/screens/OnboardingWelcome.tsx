// Converted from Stitch export: stitch-raw/01-onboarding-welcome.html
export default function OnboardingWelcome() {
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
      {/* Hero osu! Hit Circle Centerpiece */}
      <div className="relative w-44 h-44 mb-10 flex items-center justify-center">
        {/* Outer Approach Ring */}
        <div className="absolute inset-[-18px] rounded-full border-2 border-[#FF66AA]/40 approach-ring pointer-events-none">
        </div>
        {/* Secondary Glow Aura Ring */}
        <div className="absolute inset-[-6px] rounded-full border border-[#9D6BFF]/30 pulse-ring-slow pointer-events-none">
        </div>
        {/* Main Hit Circle */}
        <div className="w-36 h-36 rounded-full bg-gradient-to-br from-[#FF66AA] to-[#D9387D] hit-circle-glow flex flex-col items-center justify-center border-4 border-white/90 shadow-2xl transition-transform hover:scale-105 duration-300 cursor-pointer group">
          {/* Number marker like osu! combo 1 */}
          <div className="font-outfit font-black text-4xl text-white drop-shadow-md tracking-tight flex items-baseline">{' '}1{' '}
          </div>
          <div className="font-outfit font-extrabold text-[13px] tracking-wider uppercase text-white/95 mt-[-2px]">{' '}RecOsuk{' '}
          </div>
        </div>
        {/* Small Combo Sparkle Orbit */}
        <div className="absolute -top-1 right-2 w-6 h-6 rounded-full bg-[#FFCC22] flex items-center justify-center text-xs font-black text-[#150F1F] shadow-lg border-2 border-white">{' '}★{' '}
        </div>
      </div>
      {/* Main Headline in Outfit ExtraBold */}
      <h1 className="font-outfit font-extrabold text-4xl sm:text-5xl text-[#F5F1FA] tracking-tight max-w-2xl leading-[1.15] mb-5">{' '}Train the maps your profile says you need{' '}
      </h1>
      {/* One Line Subtext */}
      <p className="text-lg text-[#A59AB5] max-w-2xl leading-relaxed mb-10 font-normal">{' '}RecOsuk reads your osu! top plays, finds where your accuracy falls apart, and recommends beatmaps that train exactly that — in all four modes.{' '}
      </p>
      {/* Four Mode Circles in a Row */}
      <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-8 mb-12">
        {/* Standard */}
        <div className="flex items-center gap-3 bg-[#221832] hover:bg-[#2c2040] transition-colors pl-2.5 pr-5 py-2 rounded-full border border-white/5 hover:border-[#FF66AA]/40 shadow-md group cursor-pointer">
          <div className="w-10 h-10 rounded-full bg-[#FF66AA] flex items-center justify-center font-outfit font-extrabold text-sm text-white shadow-md shadow-[#FF66AA]/30 group-hover:scale-110 transition-transform">{' '}STD{' '}
          </div>
          <div className="text-left">
            <div className="text-sm font-bold text-[#F5F1FA]">Standard
            </div>
            <div className="text-[11px] text-[#A59AB5]">Aim & speed
            </div>
          </div>
        </div>
        {/* Taiko */}
        <div className="flex items-center gap-3 bg-[#221832] hover:bg-[#2c2040] transition-colors pl-2.5 pr-5 py-2 rounded-full border border-white/5 hover:border-[#FF5C39]/40 shadow-md group cursor-pointer">
          <div className="w-10 h-10 rounded-full bg-[#FF5C39] flex items-center justify-center font-outfit font-extrabold text-sm text-white shadow-md shadow-[#FF5C39]/30 group-hover:scale-110 transition-transform">{' '}TKO{' '}
          </div>
          <div className="text-left">
            <div className="text-sm font-bold text-[#F5F1FA]">Taiko
            </div>
            <div className="text-[11px] text-[#A59AB5]">Rhythm & stamina
            </div>
          </div>
        </div>
        {/* Catch */}
        <div className="flex items-center gap-3 bg-[#221832] hover:bg-[#2c2040] transition-colors pl-2.5 pr-5 py-2 rounded-full border border-white/5 hover:border-[#4CC3FF]/40 shadow-md group cursor-pointer">
          <div className="w-10 h-10 rounded-full bg-[#4CC3FF] flex items-center justify-center font-outfit font-extrabold text-sm text-white shadow-md shadow-[#4CC3FF]/30 group-hover:scale-110 transition-transform">{' '}CTB{' '}
          </div>
          <div className="text-left">
            <div className="text-sm font-bold text-[#F5F1FA]">Catch
            </div>
            <div className="text-[11px] text-[#A59AB5]">Precision & dash
            </div>
          </div>
        </div>
        {/* Mania (Highlighted as Active / Featured) */}
        <div className="flex items-center gap-3 bg-[#221832] hover:bg-[#2c2040] transition-colors pl-2.5 pr-5 py-2 rounded-full border border-[#9D6BFF]/50 shadow-lg shadow-[#9D6BFF]/15 group cursor-pointer relative">
          <div className="absolute -top-2 -right-1 bg-[#9D6BFF] text-[10px] font-bold text-white px-2 py-0.5 rounded-full uppercase tracking-wider">{' '}Demo{' '}
          </div>
          <div className="w-10 h-10 rounded-full bg-[#9D6BFF] flex items-center justify-center font-outfit font-extrabold text-sm text-white shadow-md shadow-[#9D6BFF]/40 group-hover:scale-110 transition-transform">{' '}MNA{' '}
          </div>
          <div className="text-left">
            <div className="text-sm font-bold text-[#F5F1FA]">Mania
            </div>
            <div className="text-[11px] text-[#A59AB5]">Finger control & keys
            </div>
          </div>
        </div>
      </div>
      {/* Actions & Progress Control */}
      <div className="flex flex-col items-center gap-5 w-full max-w-xs">
        {/* Primary Pink Button: Next */}
        <button className="w-full py-4 px-8 bg-[#FF66AA] hover:bg-[#ff4f9d] active:scale-[0.98] text-white font-outfit font-extrabold text-lg rounded-full shadow-lg shadow-[#FF66AA]/35 hover:shadow-[#FF66AA]/50 transition-all flex items-center justify-center gap-2 group">
          <span>Next
          </span>
          <svg className="w-5 h-5 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3" />
          </svg>
        </button>
        {/* Quiet Text Button: Skip Introduction */}
        <button className="text-sm font-medium text-[#A59AB5] hover:text-[#F5F1FA] hover:underline underline-offset-4 transition-colors">{' '}Skip introduction{' '}
        </button>
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
