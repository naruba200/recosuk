// Converted from Stitch export: stitch-raw/02-link-osu.html
export default function LinkOsu() {
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
        {/* Interactive Stage Wrapper */}
        <div className="relative w-full flex flex-col items-center">
          {/* Top Hit Circle & Combo Badge */}
          <div className="relative flex items-center justify-center mb-6">
            {/* Pulsing Outer Approach Ring */}
            <div className="absolute w-28 h-28 rounded-full bg-secondary-container/20 pulse-ring-slow pointer-events-none">
            </div>
            <div className="absolute w-24 h-24 rounded-full bg-primary/20 approach-ring pointer-events-none">
            </div>
            {/* Core osu! Hit Circle (Combo 6) */}
            <div className="relative w-20 h-20 rounded-full bg-secondary-container hit-circle-glow flex flex-col items-center justify-center cursor-default select-none transition-transform hover:scale-105">
              <span className="font-headline-xl text-headline-xl text-on-surface leading-none tabular-nums font-black drop-shadow">6
              </span>
              <div className="absolute -bottom-2 px-2.5 py-0.5 rounded-full bg-surface-container-highest shadow-md flex items-center gap-1">
                <svg className="w-3 h-3 text-secondary" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z">
                  </path>
                </svg>
                <span className="font-label-sm text-label-sm text-secondary font-bold tracking-wider">RecOsuk
                </span>
              </div>
            </div>
          </div>
          {/* Main Headline & Subcopy */}
          <div className="max-w-xl text-center mb-8">
            <h1 className="font-headline-xl text-headline-xl text-on-surface font-extrabold tracking-tight mb-2">{' '}Link your osu! account{' '}
            </h1>
            <p className="font-body-md text-body-md text-on-surface-variant max-w-md mx-auto">{' '}We only read your public profile and top plays. Nothing is posted to your account.{' '}
            </p>
          </div>
          {/* Main Link Profile Form Card */}
          <div className="w-full max-w-2xl bg-surface-container/90 backdrop-blur-xl rounded-lg p-6 sm:p-8 shadow-xl relative overflow-hidden mb-6">
            {/* Glow Accents inside container */}
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-secondary-container/15 rounded-full blur-3xl pointer-events-none">
            </div>
            <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-primary/10 rounded-full blur-3xl pointer-events-none">
            </div>
            <form className="relative z-10 flex flex-col gap-6 text-left" id="osu-link-form">
              {/* Input Group: osu! Username */}
              <div className="flex flex-col gap-2">
                <label className="font-label-md text-label-md text-on-surface flex items-center justify-between" htmlFor="osu-username">
                  <span>osu! username
                  </span>
                  <span className="font-label-sm text-label-sm text-on-surface-variant">Public stats lookup
                  </span>
                </label>
                <div className="relative flex items-center">
                  {/* Left Avatar Preview Target */}
                  <div className="absolute left-3 w-8 h-8 rounded-full overflow-hidden bg-surface-container-highest flex items-center justify-center shadow-inner">
                    <img className="w-full h-full object-cover" data-alt="A stylized digital anime gaming avatar with headphones, vibrant magenta and deep purple backlight, neon glow in rhythm game aesthetic, detailed portrait photography style" src="https://lh3.googleusercontent.com/aida-public/AB6AXuA7eHobcIQQBAEjAgjrDPLn3jt5xtARIK0V0_qZS4tY4ZRpR-fhVPF7rqcLIl251Hfd2kXu3DP5X5X8b6lroiFx_eFF0-3s04_oUT1807VICF2BaUT2Au0wv_7ligvtQFvjSD1GkuKZ3RSvQ0zyO_nGb3K3qW6LOpaQ83AXPeVR32Zvh-WODbbKRHcVbBfRQC21kcxwZGaIxMJG5BJvMkIdC9KTfGb9PA3KV0d7mx9HpfQX3fYU7PJn" />
                  </div>
                  {/* Input Field */}
                  <input className="w-full bg-surface-container-low text-on-surface pl-14 pr-24 py-3.5 rounded-full font-body-md text-body-md focus:outline-none focus:bg-surface-container-highest transition-colors placeholder:text-outline-variant" id="osu-username" placeholder="e.g. WhiteCat, sora_playz" type="text" value="sora_playz" />
                  {/* Verified Status Badge */}
                  <div className="absolute right-3.5 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-container-high text-secondary font-label-sm text-label-sm">
                    <span className="material-symbols-outlined text-[15px]" style={{ fontVariationSettings: "'FILL' 1" }}>verified
                    </span>
                    <span>5,284 pp
                    </span>
                  </div>
                </div>
              </div>
              {/* Mode Select Area */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="font-label-md text-label-md text-on-surface">Start with this mode
                  </span>
                  {/* Auto-detect Toggle Button */}
                  <button className="flex items-center gap-2 px-3 py-1 rounded-full bg-surface-container-highest transition-all group" id="autodetect-toggle" type="button">
                    <span className="w-3.5 h-3.5 rounded-full bg-secondary flex items-center justify-center transition-transform scale-100" id="autodetect-indicator">
                      <span className="material-symbols-outlined text-[11px] text-on-secondary font-bold">check
                      </span>
                    </span>
                    <span className="font-label-sm text-label-sm text-on-surface group-hover:text-primary transition-colors">Auto-detect my main mode
                    </span>
                  </button>
                </div>
                {/* 4 Mode Nodes Container */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {/* Standard Mode */}
                  <button className="mode-node flex items-center gap-3 p-2.5 rounded-full bg-surface-container-high hover:bg-surface-container-highest transition-all text-left shadow-sm group" data-mode="standard" type="button">
                    <div className="w-10 h-10 rounded-full bg-secondary-container flex items-center justify-center text-on-surface font-headline-sm text-headline-sm shadow-md transition-transform group-hover:scale-105">
                      <span className="material-symbols-outlined text-lg">adjust
                      </span>
                    </div>
                    <div className="flex flex-col min-w-0 pr-2">
                      <span className="font-label-md text-label-md text-on-surface truncate">Standard
                      </span>
                      <span className="font-label-sm text-label-sm text-on-surface-variant">Default
                      </span>
                    </div>
                  </button>
                  {/* Taiko Mode */}
                  <button className="mode-node flex items-center gap-3 p-2.5 rounded-full bg-surface-container-low hover:bg-surface-container-highest transition-all text-left group" data-mode="taiko" type="button">
                    <div className="w-10 h-10 rounded-full bg-surface-container-highest flex items-center justify-center text-on-surface-variant group-hover:text-on-surface transition-transform group-hover:scale-105">
                      <span className="material-symbols-outlined text-lg">circle
                      </span>
                    </div>
                    <div className="flex flex-col min-w-0 pr-2">
                      <span className="font-label-md text-label-md text-on-surface truncate">Taiko
                      </span>
                      <span className="font-label-sm text-label-sm text-on-surface-variant">Drum hits
                      </span>
                    </div>
                  </button>
                  {/* Catch Mode */}
                  <button className="mode-node flex items-center gap-3 p-2.5 rounded-full bg-surface-container-low hover:bg-surface-container-highest transition-all text-left group" data-mode="catch" type="button">
                    <div className="w-10 h-10 rounded-full bg-surface-container-highest flex items-center justify-center text-tertiary transition-transform group-hover:scale-105">
                      <span className="material-symbols-outlined text-lg">sports_esports
                      </span>
                    </div>
                    <div className="flex flex-col min-w-0 pr-2">
                      <span className="font-label-md text-label-md text-on-surface truncate">Catch
                      </span>
                      <span className="font-label-sm text-label-sm text-on-surface-variant">Fruit drops
                      </span>
                    </div>
                  </button>
                  {/* Mania Mode */}
                  <button className="mode-node flex items-center gap-3 p-2.5 rounded-full bg-surface-container-low hover:bg-surface-container-highest transition-all text-left group" data-mode="mania" type="button">
                    <div className="w-10 h-10 rounded-full bg-surface-container-highest flex items-center justify-center text-primary-fixed-dim transition-transform group-hover:scale-105">
                      <span className="material-symbols-outlined text-lg">grid_view
                      </span>
                    </div>
                    <div className="flex flex-col min-w-0 pr-2">
                      <span className="font-label-md text-label-md text-on-surface truncate">Mania
                      </span>
                      <span className="font-label-sm text-label-sm text-on-surface-variant">Keys layout
                      </span>
                    </div>
                  </button>
                </div>
              </div>
              {/* Primary Submit Button */}
              <button className="relative w-full py-4 px-6 rounded-full bg-secondary-container hover:bg-on-secondary-fixed-variant active:scale-[0.98] text-on-surface font-headline-sm text-headline-sm flex items-center justify-center gap-2.5 shadow-lg shadow-secondary-container/40 transition-all cursor-pointer group" id="link-btn" type="submit">
                <span>Link my osu! account
                </span>
                <span className="material-symbols-outlined text-xl transition-transform group-hover:translate-x-1">arrow_forward
                </span>
              </button>
            </form>
          </div>
          {/* Dual Action Split Card */}
          <div className="w-full max-w-2xl grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {/* Option A: Free RecOsuk Account */}
            <div className="bg-surface-container-low rounded-lg p-5 flex flex-col justify-between text-left shadow-md hover:bg-surface-container transition-colors relative overflow-hidden group">
              <div className="relative z-10">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full bg-primary animate-pulse">
                  </span>
                  <span className="font-label-md text-label-md text-on-surface font-bold">Personalized library
                  </span>
                </div>
                <p className="font-body-sm text-body-sm text-on-surface-variant mb-4">{' '}Create a free RecOsuk account — save maps, build lists, and rate beatmaps so recommendations learn from you.{' '}
                </p>
              </div>
              <button className="relative z-10 w-full py-2.5 px-4 rounded-full bg-primary-container/20 hover:bg-primary-container text-on-surface font-label-md text-label-md transition-all flex items-center justify-center gap-2 active:scale-95 shadow-sm" type="button">
                <span className="material-symbols-outlined text-[16px]">person_add
                </span>
                <span>Create account
                </span>
              </button>
            </div>
            {/* Option B: Guest Access */}
            <div className="bg-surface-container-low rounded-lg p-5 flex flex-col justify-between text-left shadow-md hover:bg-surface-container transition-colors relative overflow-hidden group">
              <div className="relative z-10">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full bg-outline">
                  </span>
                  <span className="font-label-md text-label-md text-on-surface font-bold">Instant play
                  </span>
                </div>
                <p className="font-body-sm text-body-sm text-on-surface-variant mb-4">{' '}Continue as guest — get your profile and recommendations now, but saving, lists, and ratings stay locked.{' '}
                </p>
              </div>
              <button className="relative z-10 w-full py-2.5 px-4 rounded-full bg-surface-container-highest hover:bg-surface-bright text-on-surface-variant hover:text-on-surface font-label-md text-label-md transition-all flex items-center justify-center gap-2 active:scale-95 shadow-sm" type="button">
                <span className="material-symbols-outlined text-[16px]">visibility
                </span>
                <span>Continue as guest
                </span>
              </button>
            </div>
          </div>
          {/* Quiet Bypass Link */}
          <div className="text-center pb-4">
            <button className="font-body-sm text-body-sm text-outline hover:text-on-surface underline underline-offset-4 decoration-outline-variant hover:decoration-on-surface transition-all active:opacity-70" type="button">{' '}Continue without linking{' '}
            </button>
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
