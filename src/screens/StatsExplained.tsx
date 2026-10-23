// Converted from Stitch export: stitch-raw/04-stats-explained.html
export default function StatsExplained() {
  return (
    <div className="osu-grid-bg text-slate-100 font-inter antialiased min-h-screen flex flex-col justify-between select-none relative overflow-x-hidden">
    {/* Ambient backdrop lighting */}
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 ambient-glow-mania z-0">
    </div>
    {/* BEGIN: TopBar */}
    <header className="relative z-10 w-full px-8 py-7 flex items-center justify-between max-w-7xl mx-auto">
      {/* Brand Logo: osu! RecOsuk */}
      <div className="flex items-center space-x-3" data-purpose="brand-logo">
        <div className="w-10 h-10 rounded-full bg-[#FF66AA] flex items-center justify-center shadow-[0_0_18px_rgba(255,102,170,0.65)]">
          <span className="font-outfit font-black text-white text-base tracking-tighter lowercase">osu!
          </span>
        </div>
        <div className="font-outfit font-bold text-2xl tracking-tight flex items-center text-white">
          <span>Rec
          </span>
          <span className="text-[#FF66AA]">Osuk
          </span>
        </div>
      </div>
      {/* Onboarding Step Badge */}
      <div className="flex items-center space-x-2 px-4 py-1.5 rounded-full bg-[#201530] border border-[#3b2959] text-xs font-medium text-slate-300 shadow-sm" data-purpose="step-indicator">
        <span className="w-2 h-2 rounded-full bg-[#9D6BFF] shadow-[0_0_8px_#9D6BFF]">
        </span>
        <span>Step 3 of 6 • Profile analysis
        </span>
      </div>
    </header>
    {/* END: TopBar */}
    {/* BEGIN: MainContent */}
    <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 py-4 max-w-4xl mx-auto w-full text-center">
      <div className="flex flex-col w-full max-w-5xl mx-auto py-2 px-2 md:px-6">
        {/* Top Context Header Area (No duplication of shell h1, focused on profile breakdown stage) */}
        <section className="flex flex-col items-center text-center relative mb-8">
          {/* Central Hit-Circle Node with Approach Ring Motif */}
          <div className="relative flex items-center justify-center w-28 h-28 mb-5">
            {/* Outer glowing animated approach ring */}
            <div className="absolute inset-0 rounded-full border-2 border-primary animate-ping opacity-25 pointer-events-none">
            </div>
            <div className="absolute -inset-2 rounded-full border border-primary-container opacity-40 animate-pulse pointer-events-none">
            </div>
            {/* Core Hit Circle */}
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary-container to-surface-container-high flex flex-col items-center justify-center shadow-xl shadow-primary-container/20 relative z-10 transition-transform duration-300 hover:scale-105 cursor-pointer" title="Combo 4 • Step 4">
              <span className="font-headline-xl text-headline-lg text-on-surface leading-none select-none">4
              </span>
              <span className="font-label-sm text-label-sm text-tertiary-fixed tracking-tight opacity-90">combo
              </span>
            </div>
            {/* Orbiting Star Marker */}
            <div className="absolute top-0 right-1 w-6 h-6 rounded-full bg-surface-container-highest shadow-md flex items-center justify-center">
              <span className="material-symbols-outlined text-secondary text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>star
              </span>
            </div>
          </div>
          {/* Centered Stage Titles */}
          <div className="space-y-2 max-w-2xl">
            <h1 className="font-headline-xl text-headline-lg md:text-headline-xl text-on-surface font-extrabold tracking-tight">{' '}Here's what your{' '}
              <span className="text-primary-container">Mania
              </span>{' '}profile says{' '}
            </h1>
            <p className="font-body-lg text-body-lg text-on-surface-variant">{' '}We analyzed 12,430 plays to pinpoint exactly where to focus your training.{' '}
            </p>
          </div>
          {/* Dynamic Session Badge Pill */}
          <div className="mt-4 inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-surface-container-low shadow-sm">
            <span className="w-2 h-2 rounded-full bg-primary-container">
            </span>
            <span className="font-label-md text-label-md text-on-surface-variant">{' '}SP sora_playz [VN] • Mania 7K • 5,284 pp analyzed{' '}
            </span>
          </div>
        </section>
        {/* 2x2 Bento Explanation Grid */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-10 w-full" data-purpose="stat-explanation-grid">
          {/* Block 1: Comfort Band */}
          <div className="group relative rounded-lg bg-surface-container p-6 shadow-md hover:shadow-xl hover:bg-surface-container-high transition-all duration-300 flex flex-col justify-between">
            {/* Subtle top mode highlight strip */}
            <div className="absolute top-0 left-6 right-6 h-1 rounded-full bg-gradient-to-r from-primary to-transparent opacity-80">
            </div>
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 rounded-full bg-surface-container-highest flex items-center justify-center text-primary">
                  <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>bedtime
                  </span>
                </div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container-lowest text-primary font-label-sm text-label-sm shadow-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary">
                  </span>{' '}97.8% avg accuracy • In the zone{' '}
                </span>
              </div>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="font-metric-display text-metric-display text-on-surface font-black tabular-nums tracking-tight">{' '}4.2–4.7{' '}
                </span>
                <span className="font-headline-sm text-headline-sm text-secondary font-bold">★
                </span>
              </div>
              <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold mb-2">{' '}Your comfort band{' '}
              </h2>
              <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">{' '}You average 97.8% accuracy here across your top plays, so these maps are no longer training anything.{' '}
              </p>
            </div>
            {/* Mini Sparkline Meter Indicator */}
            <div className="mt-5 pt-4 bg-surface-container-low/60 rounded-DEFAULT p-3">
              <div className="flex justify-between items-center text-label-sm font-label-sm text-on-surface-variant mb-1.5">
                <span>Accuracy stability
                </span>
                <span className="text-primary font-semibold">97.8% steady
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-surface-container-highest overflow-hidden">
                <div className="h-full rounded-full bg-primary" style={{ width: "97.8%" }}>
                </div>
              </div>
            </div>
          </div>
          {/* Block 2: Performance Drop / Target Gap */}
          <div className="group relative rounded-lg bg-surface-container p-6 shadow-md hover:shadow-xl hover:bg-surface-container-high transition-all duration-300 flex flex-col justify-between">
            {/* Urgent Accent Line */}
            <div className="absolute top-0 left-6 right-6 h-1 rounded-full bg-gradient-to-r from-secondary to-transparent opacity-90">
            </div>
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 rounded-full bg-secondary-container/40 flex items-center justify-center text-secondary">
                  <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>trending_down
                  </span>
                </div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container-lowest text-secondary font-label-sm text-label-sm shadow-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-secondary">
                  </span>{' '}-6.6% accuracy drop • Target gap{' '}
                </span>
              </div>
              <div className="flex items-baseline gap-2 mb-1">
                <span className="font-metric-display text-metric-display text-on-surface font-black tabular-nums tracking-tight">{' '}91.2%{' '}
                </span>
                <span className="font-headline-sm text-headline-sm text-secondary-fixed-dim font-bold">above 5.0★
                </span>
              </div>
              <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold mb-2">{' '}Where it falls apart{' '}
              </h2>
              <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">{' '}Your accuracy drops 6.6 points once maps pass 5.0 stars. This gap is what your recommendations target.{' '}
              </p>
            </div>
            {/* Mini Visual Delta Bar */}
            <div className="mt-5 pt-4 bg-surface-container-low/60 rounded-DEFAULT p-3">
              <div className="flex justify-between items-center text-label-sm font-label-sm text-on-surface-variant mb-1.5">
                <span>Gap threshold: 5.0★+
                </span>
                <span className="text-secondary font-semibold">Critical training zone
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-surface-container-highest overflow-hidden flex">
                <div className="h-full bg-primary" style={{ width: "82%" }}>
                </div>
                <div className="h-full bg-secondary" style={{ width: "18%" }}>
                </div>
              </div>
            </div>
          </div>
          {/* Block 3: Tempo / Sweet Spot */}
          <div className="group relative rounded-lg bg-surface-container p-6 shadow-md hover:shadow-xl hover:bg-surface-container-high transition-all duration-300 flex flex-col justify-between">
            <div className="absolute top-0 left-6 right-6 h-1 rounded-full bg-gradient-to-r from-tertiary to-transparent opacity-80">
            </div>
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 rounded-full bg-surface-container-highest flex items-center justify-center text-tertiary">
                  <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>speed
                  </span>
                </div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container-lowest text-tertiary font-label-sm text-label-sm shadow-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-tertiary">
                  </span>{' '}Peak rhythm density • Sweet spot{' '}
                </span>
              </div>
              <div className="flex items-baseline gap-2 mb-1">
                <span className="font-metric-display text-metric-display text-on-surface font-black tabular-nums tracking-tight">{' '}170–190{' '}
                </span>
                <span className="font-headline-sm text-headline-sm text-tertiary font-bold">BPM
                </span>
              </div>
              <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold mb-2">{' '}Your best tempo{' '}
              </h2>
              <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">{' '}Your highest-accuracy plays cluster in this range. Faster bursts degrade key release precision.{' '}
              </p>
            </div>
            {/* BPM Spectrum Indicator */}
            <div className="mt-5 pt-4 bg-surface-container-low/60 rounded-DEFAULT p-3">
              <div className="flex justify-between items-center text-label-sm font-label-sm text-on-surface-variant mb-1.5">
                <span>Clustered density
                </span>
                <span className="text-tertiary font-semibold">182 BPM mean
                </span>
              </div>
              <div className="flex items-center gap-1.5 h-2">
                <span className="h-1 flex-1 rounded-full bg-surface-container-highest">
                </span>
                <span className="h-2 flex-[2] rounded-full bg-tertiary">
                </span>
                <span className="h-1 flex-1 rounded-full bg-surface-container-highest">
                </span>
              </div>
            </div>
          </div>
          {/* Block 4: Key Preference */}
          <div className="group relative rounded-lg bg-surface-container p-6 shadow-md hover:shadow-xl hover:bg-surface-container-high transition-all duration-300 flex flex-col justify-between">
            <div className="absolute top-0 left-6 right-6 h-1 rounded-full bg-gradient-to-r from-primary-container to-transparent opacity-80">
            </div>
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 rounded-full bg-surface-container-highest flex items-center justify-center text-primary-container">
                  <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>keyboard
                  </span>
                </div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container-lowest text-primary font-label-sm text-label-sm shadow-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary-container">
                  </span>{' '}82% play distribution • Key preference{' '}
                </span>
              </div>
              <div className="flex items-baseline gap-2 mb-1">
                <span className="font-metric-display text-metric-display text-on-surface font-black tabular-nums tracking-tight">{' '}7K{' '}
                </span>
                <span className="font-headline-sm text-headline-sm text-primary font-bold">Mania layout
                </span>
              </div>
              <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold mb-2">{' '}Your main key count{' '}
              </h2>
              <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">{' '}82% of your top plays are 7-key maps. We will prioritize 7K practice maps with minor 4K warmups.{' '}
              </p>
            </div>
            {/* 7K Keyboard Layout Visualizer */}
            <div className="mt-5 pt-4 bg-surface-container-low/60 rounded-DEFAULT p-3">
              <div className="flex justify-between items-center text-label-sm font-label-sm text-on-surface-variant mb-1.5">
                <span>Track layout
                </span>
                <span className="text-primary-container font-semibold">S - D - F - Space - J - K - L
                </span>
              </div>
              <div className="grid grid-cols-7 gap-1 h-2">
                <div className="rounded-full bg-primary-container h-full">
                </div>
                <div className="rounded-full bg-primary-container h-full">
                </div>
                <div className="rounded-full bg-primary-container h-full">
                </div>
                <div className="rounded-full bg-secondary h-full">
                </div>
                <div className="rounded-full bg-primary-container h-full">
                </div>
                <div className="rounded-full bg-primary-container h-full">
                </div>
                <div className="rounded-full bg-primary-container h-full">
                </div>
              </div>
            </div>
          </div>
        </section>
        {/* Bottom Interactive CTA Panel */}
        <section className="flex flex-col items-center justify-center gap-3 mt-2 mb-6">
          {/* Primary CTA: Brand Pink Capsule with Glow & Movement Feedback */}
          <button className="group relative px-9 py-4 rounded-full bg-secondary text-on-secondary font-headline-sm text-headline-sm font-bold shadow-xl shadow-secondary/30 hover:shadow-secondary/50 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 flex items-center gap-3 cursor-pointer" id="see-recommendations-btn" type="button">
            <span>See my first recommendations
            </span>
            <span className="material-symbols-outlined transition-transform duration-200 group-hover:translate-x-1" style={{ fontVariationSettings: "'FILL' 1" }}>{' '}arrow_forward{' '}
            </span>
          </button>
          {/* Secondary Quiet Back/Review Action */}
          <div className="flex items-center gap-4 mt-1">
            <button className="font-label-md text-label-md text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer py-1 px-2 rounded-full hover:bg-surface-container" type="button">{' '}Review raw play data{' '}
            </button>
            <span className="text-outline-variant font-label-sm">•
            </span>
            <button className="font-label-md text-label-md text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer py-1 px-2 rounded-full hover:bg-surface-container" type="button">{' '}Back to profile analysis{' '}
            </button>
          </div>
          {/* Keyboard Access Hint */}
          <div className="flex items-center gap-1.5 text-on-surface-variant text-label-sm font-label-sm opacity-70 mt-1">
            <kbd className="px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface font-label-sm shadow-sm">Enter
            </kbd>
            <span>to continue to Step 5
            </span>
          </div>
        </section>
      </div>
    </main>
    {/* END: MainContent */}
    {/* BEGIN: BottomStatusBar */}
    <footer className="relative z-10 w-full px-8 py-5 border-t border-[#291E3B]/70 bg-[#120B1A]/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto flex items-center justify-between text-xs">
        {/* Left: Player Status Badge */}
        <div className="flex items-center space-x-3" data-purpose="current-player-status">
          <div className="w-8 h-8 rounded-full bg-[#2A1D3F] border border-[#44335F] flex items-center justify-center font-bold text-[11px] text-[#C9ADFF] shadow-inner">{' '}VN{' '}
          </div>
          <div className="text-left">
            <div className="text-[#7A7289] text-[11px] font-medium leading-tight">Ready for player
            </div>
            <div className="text-slate-200 font-semibold tracking-tight">sora_playz{' '}
              <span className="text-slate-400 font-normal">(5,284 pp)
              </span>
            </div>
          </div>
        </div>
        {/* Center: 6-Step Progress Indicator Dots (Step 3 active) */}
        <nav aria-label="Onboarding Progress" className="flex items-center space-x-2" data-purpose="pagination-dots">
          {/* Step 1: Completed */}
          <span className="w-2.5 h-2.5 rounded-full bg-[#FF66AA] opacity-75 cursor-default" title="Step 1 completed">
          </span>
          {/* Step 2: Completed */}
          <span className="w-2.5 h-2.5 rounded-full bg-[#FF66AA] opacity-75 cursor-default" title="Step 2 completed">
          </span>
          {/* Step 3: Current Active (Glowing Mania Purple Pill) */}
          <span className="w-8 h-2.5 rounded-full bg-gradient-to-r from-[#9D6BFF] to-[#FF66AA] shadow-[0_0_12px_#9D6BFF] cursor-default" title="Step 3: Current step">
          </span>
          {/* Step 4: Queued */}
          <span className="w-2.5 h-2.5 rounded-full bg-[#2F2145] cursor-default" title="Step 4">
          </span>
          {/* Step 5: Queued */}
          <span className="w-2.5 h-2.5 rounded-full bg-[#2F2145] cursor-default" title="Step 5">
          </span>
          {/* Step 6: Queued */}
          <span className="w-2.5 h-2.5 rounded-full bg-[#2F2145] cursor-default" title="Step 6">
          </span>
        </nav>
        {/* Right: Advance Hint */}
        <div className="text-[#7A7289] font-medium flex items-center gap-1.5" data-purpose="auto-advance-indicator">
          <span className="w-1.5 h-1.5 rounded-full bg-[#7EE787] animate-pulse">
          </span>
          <span>Auto-advancing on completion...
          </span>
        </div>
      </div>
    </footer>
    {/* END: BottomStatusBar */}
    </div>
  )
}
