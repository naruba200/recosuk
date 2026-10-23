// Converted from Stitch export: stitch-raw/13-settings.html
export default function Settings() {
  return (
    <div className="bg-background font-body-md text-body-md text-on-surface antialiased selection:bg-primary-container selection:text-on-primary-container min-h-screen">
    <aside className="fixed left-0 top-0 h-full w-[232px] bg-surface-container-low z-50 flex flex-col justify-between py-space-md shadow-[0_1px_8px_rgba(0,0,0,0.4)]">
      <div className="flex flex-col gap-space-md px-space-md">
        <div className="flex items-center gap-space-sm px-space-xs pt-space-xs">
          <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center shadow-[0_0_12px_rgba(255,176,204,0.35)]">
            <span className="text-on-secondary font-headline-md text-headline-md leading-none">o!
            </span>
          </div>
          <div className="flex flex-col">
            <span className="font-headline-md text-headline-md tracking-tight text-on-surface leading-none">RecOsuk
            </span>
            <span className="font-label-sm text-label-sm text-on-surface-variant">rhythm companion
            </span>
          </div>
        </div>
        <div className="flex items-center gap-space-sm p-space-sm rounded-DEFAULT bg-surface-container-high">
          <div className="relative flex-shrink-0">
            <div className="w-10 h-10 rounded-full bg-surface-container-highest flex items-center justify-center">
              <span className="material-symbols-outlined text-primary text-[22px]">face
              </span>
            </div>
            <div className="absolute -bottom-1 -right-1 px-1 py-0.5 rounded-full bg-surface-container-lowest font-label-sm text-[9px] leading-none text-secondary font-bold uppercase">VN
            </div>
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <span className="font-label-md text-label-md text-on-surface truncate">sora_playz
            </span>
            <div className="flex items-center gap-1">
              <span className="font-label-sm text-label-sm text-primary font-bold">5,284
              </span>
              <span className="font-label-sm text-label-sm text-on-surface-variant">pp
              </span>
            </div>
          </div>
        </div>
        <nav className="flex flex-col gap-1" data-active-classes="bg-primary-container text-on-primary-container font-semibold rounded-DEFAULT">
          <a className="px-space-md py-2.5 rounded-DEFAULT text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-all font-label-md text-label-md" data-path="dashboard" href="#">Dashboard
          </a>
          <a className="px-space-md py-2.5 rounded-DEFAULT text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-all font-label-md text-label-md" data-path="stats" href="#">Stats
          </a>
          <a className="px-space-md py-2.5 rounded-DEFAULT text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-all font-label-md text-label-md" data-path="recommendations" href="#">Recommendations
          </a>
          <a className="px-space-md py-2.5 rounded-DEFAULT text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-all font-label-md text-label-md" data-path="mirror" href="#">Mirror
          </a>
          <a className="px-space-md py-2.5 rounded-DEFAULT text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-all font-label-md text-label-md" data-path="lists" href="#">Lists
          </a>
          <a className="px-space-md py-2.5 rounded-DEFAULT text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-all font-label-md text-label-md" data-path="history" href="#">History
          </a>
          <a aria-current="page" className="px-space-md py-2.5 transition-all shadow-[0_0_14px_rgba(164,118,255,0.35)] bg-primary-container text-on-primary-container font-semibold rounded-DEFAULT" data-path="settings" href="#">Settings
          </a>
        </nav>
      </div>
      <div className="px-space-md flex flex-col gap-space-xs">
        <div className="flex items-center justify-between p-space-sm rounded-DEFAULT bg-surface-container">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#7EE787] animate-pulse">
            </span>
            <span className="font-label-sm text-label-sm text-on-surface-variant">Bancho server
            </span>
          </div>
          <span className="font-label-sm text-label-sm text-on-surface">online
          </span>
        </div>
        <div className="flex items-center justify-between px-space-xs text-on-surface-variant font-label-sm text-label-sm">
          <span>RecOsuk v2.4
          </span>
          <a className="hover:text-primary transition-colors" data-path="changelog" href="#">notes
          </a>
        </div>
      </div>
    </aside>
    <div className="pl-[232px]">
      <header className="fixed top-0 left-[232px] right-0 h-16 bg-surface-container-lowest/80 backdrop-blur-xl z-40 flex items-center justify-between px-space-xl shadow-[0_1px_8px_rgba(0,0,0,0.3)]">
        <div className="flex items-center gap-space-sm">
          <span className="font-label-sm text-label-sm text-on-surface-variant">Stage context
          </span>
          <span className="text-outline-variant font-label-sm text-label-sm">/
          </span>
          <span className="font-label-md text-label-md text-primary font-medium">User configuration
          </span>
        </div>
        <div className="flex items-center gap-space-sm bg-surface-container-low px-space-sm py-1.5 rounded-full">
          <button className="w-8 h-8 rounded-full bg-surface-container-high text-on-surface-variant flex items-center justify-center hover:bg-secondary hover:text-on-secondary transition-all" title="osu!standard" type="button">
            <span className="font-headline-sm text-[13px] leading-none">std
            </span>
          </button>
          <button className="w-8 h-8 rounded-full bg-surface-container-high text-on-surface-variant flex items-center justify-center hover:bg-[#FF5C39] hover:text-on-primary transition-all" title="osu!taiko" type="button">
            <span className="font-headline-sm text-[13px] leading-none">tai
            </span>
          </button>
          <button className="w-8 h-8 rounded-full bg-surface-container-high text-on-surface-variant flex items-center justify-center hover:bg-tertiary-container hover:text-on-tertiary-container transition-all" title="osu!catch" type="button">
            <span className="font-headline-sm text-[13px] leading-none">ctb
            </span>
          </button>
          <button className="w-8 h-8 rounded-full bg-primary-container text-on-primary-container shadow-[0_0_14px_rgba(164,118,255,0.45)] flex items-center justify-center transition-all" title="osu!mania" type="button">
            <span className="font-headline-sm text-[13px] leading-none">mna
            </span>
          </button>
        </div>
        <div className="flex items-center gap-space-md">
          <div className="flex items-center gap-space-xs text-on-surface-variant font-label-sm text-label-sm">
            <span className="material-symbols-outlined text-[16px] text-tertiary">sync
            </span>
            <span>Bancho synced
            </span>
          </div>
          <div className="flex items-center gap-space-sm pl-space-sm py-1 pr-1.5 rounded-full bg-surface-container-high">
            <div className="flex flex-col text-right">
              <span className="font-label-sm text-label-sm text-on-surface leading-none">sora_playz
              </span>
              <span className="font-label-sm text-[10px] text-on-surface-variant leading-none mt-0.5">free tier
              </span>
            </div>
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
              <span className="material-symbols-outlined text-on-primary text-[18px]">person
              </span>
            </div>
          </div>
        </div>
      </header>
      <main className="w-full pt-16 bg-surface min-h-screen px-space-xl py-space-xl">
        <div className="flex flex-col w-full max-w-5xl mx-auto space-y-10 pb-16">
          {/* GUEST STATE ALERT BANNER */}
          <div className="relative overflow-hidden rounded-DEFAULT bg-surface-container-high p-space-md shadow-lg shadow-surface-container-lowest/50 flex flex-col sm:flex-row sm:items-center justify-between gap-space-md">
            <div className="absolute -right-12 -top-12 w-48 h-48 bg-secondary/10 rounded-full blur-3xl pointer-events-none">
            </div>
            <div className="flex items-center gap-space-md z-10">
              <div className="w-10 h-10 rounded-full bg-secondary-container/40 flex items-center justify-center flex-shrink-0 text-secondary shadow-[0_0_16px_rgba(255,176,204,0.25)]">
                <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>person_alert
                </span>
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="font-headline-sm text-headline-sm text-on-surface">Guest session active
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-secondary/20 text-secondary font-label-sm text-[10px] uppercase font-bold tracking-wider">Unverified
                  </span>
                </div>
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">{' '}You're browsing as a guest linked to{' '}
                  <strong className="text-on-surface font-semibold">sora_playz
                  </strong>. Create an account to permanently sync recommendations and lists.{' '}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-space-sm z-10 flex-shrink-0">
              <a className="inline-flex items-center gap-1.5 px-space-md py-2 rounded-full bg-secondary hover:bg-secondary-fixed text-on-secondary transition-all font-label-md text-label-md font-bold shadow-[0_0_18px_rgba(255,176,204,0.4)] active:scale-95" href="/auth">
                <span>Create account
                </span>
                <span className="material-symbols-outlined text-[16px]">arrow_forward
                </span>
              </a>
            </div>
          </div>
          {/* PAGE HEADER TITLE */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-3">
              <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">Settings
              </h1>
              <span className="px-2.5 py-0.5 rounded-full bg-surface-container-highest text-primary font-label-sm text-label-sm font-semibold">v2.4-stable
              </span>
            </div>
            <p className="font-body-md text-body-md text-on-surface-variant max-w-3xl">{' '}Manage your linked Bancho credentials, beatmap mirror routes, client sync, and exported drills.{' '}
            </p>
          </div>
          {/* SETTINGS GROUPS (FLAT ROWS PATTERN) */}
          <div className="flex flex-col space-y-12">
            {/* SECTION 1: ACCOUNT */}
            <div className="flex flex-col">
              <div className="flex items-center justify-between pb-3 bg-gradient-to-r from-transparent via-outline-variant/10 to-transparent">
                <div className="flex items-center gap-2.5">
                  <span className="w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_rgba(210,187,255,0.7)]">
                  </span>
                  <span className="font-headline-sm text-headline-sm text-on-surface uppercase tracking-wider text-[14px]">Account
                  </span>
                </div>
                <span className="font-label-sm text-label-sm text-on-surface-variant">Profile & Bancho credentials
                </span>
              </div>
              {/* Rows Container */}
              <div className="flex flex-col divide-y divide-surface-container-highest/60">
                {/* Row: Email */}
                <div className="py-space-md flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm group hover:bg-surface-container-low/40 px-2 rounded-DEFAULT transition-colors">
                  <div className="flex flex-col">
                    <span className="font-label-md text-label-md text-on-surface">Registered Email
                    </span>
                    <span className="font-body-sm text-body-sm text-on-surface-variant">No email registered (Browsing as guest)
                    </span>
                  </div>
                  <div className="flex items-center gap-space-sm">
                    <a className="px-space-md py-1.5 rounded-full bg-surface-container-high hover:bg-surface-container-highest text-primary hover:text-on-surface transition-all font-label-md text-label-md flex items-center gap-1.5" href="/auth">
                      <span className="material-symbols-outlined text-[16px]">add
                      </span>
                      <span>Add permanent email
                      </span>
                    </a>
                  </div>
                </div>
                {/* Row: Linked osu! Account */}
                <div className="py-space-md flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm group hover:bg-surface-container-low/40 px-2 rounded-DEFAULT transition-colors">
                  <div className="flex flex-col">
                    <span className="font-label-md text-label-md text-on-surface">Linked osu! Account
                    </span>
                    <span className="font-body-sm text-body-sm text-on-surface-variant">Active Bancho identity used for performance calibration
                    </span>
                  </div>
                  <div className="flex items-center flex-wrap gap-space-sm">
                    {/* Account badge */}
                    <div className="flex items-center gap-space-sm px-3 py-1.5 rounded-full bg-surface-container-high shadow-inner">
                      <div className="relative w-6 h-6 rounded-full bg-surface-container-highest flex items-center justify-center flex-shrink-0">
                        <span className="material-symbols-outlined text-[15px] text-primary">face
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-label-md text-label-md text-on-surface font-bold">sora_playz
                        </span>
                        <span className="px-1.5 py-0.2 rounded bg-surface-container-lowest text-[10px] font-bold text-secondary">VN
                        </span>
                        <span className="font-label-sm text-label-sm text-primary">5,284 pp
                        </span>
                      </div>
                      <span className="inline-flex items-center gap-1 font-label-sm text-[10px] text-[#7EE787] pl-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#7EE787] animate-pulse">
                        </span>
                        <span>Synced
                        </span>
                      </span>
                    </div>
                    {/* Actions */}
                    <button className="px-3 py-1.5 rounded-full hover:bg-error-container/30 text-error hover:text-on-error-container font-label-md text-label-md transition-colors" type="button">{' '}Unlink{' '}
                    </button>
                    <a className="px-3 py-1.5 rounded-full bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface font-label-md text-label-md transition-colors" href="/auth">{' '}Use a different account{' '}
                    </a>
                  </div>
                </div>
                {/* Row: Account Tier / Status */}
                <div className="py-space-md flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm group hover:bg-surface-container-low/40 px-2 rounded-DEFAULT transition-colors">
                  <div className="flex flex-col">
                    <span className="font-label-md text-label-md text-on-surface">Account Tier & Persistence
                    </span>
                    <span className="font-body-sm text-body-sm text-on-surface-variant">Local browser storage keeps this session until cache is cleared
                    </span>
                  </div>
                  <div className="flex items-center gap-space-sm">
                    <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-surface-container-low text-on-surface-variant font-label-sm text-label-sm">
                      <span className="w-2 h-2 rounded-full bg-secondary-fixed-dim">
                      </span>
                      <span>Guest Tier • Session Data Temporary
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            {/* SECTION 2: DOWNLOADS & CLIENT SYNC */}
            <div className="flex flex-col">
              <div className="flex items-center justify-between pb-3 bg-gradient-to-r from-transparent via-outline-variant/10 to-transparent">
                <div className="flex items-center gap-2.5">
                  <span className="w-2 h-2 rounded-full bg-tertiary shadow-[0_0_8px_rgba(128,208,255,0.7)]">
                  </span>
                  <span className="font-headline-sm text-headline-sm text-on-surface uppercase tracking-wider text-[14px]">Downloads & Client Sync
                  </span>
                </div>
                <span className="font-label-sm text-label-sm text-on-surface-variant">Mirror prioritization and local game paths
                </span>
              </div>
              <div className="flex flex-col divide-y divide-surface-container-highest/60">
                {/* Row: Download Folder Path */}
                <div className="py-space-md flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm group hover:bg-surface-container-low/40 px-2 rounded-DEFAULT transition-colors">
                  <div className="flex flex-col">
                    <span className="font-label-md text-label-md text-on-surface">Beatmap Download Destination
                    </span>
                    <span className="font-body-sm text-body-sm text-on-surface-variant">Default staging directory for unpacked and packed .osz files
                    </span>
                  </div>
                  <div className="flex items-center gap-space-sm">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-DEFAULT bg-surface-container font-mono text-[13px] text-primary-fixed-dim tracking-tight shadow-inner">
                      <span className="material-symbols-outlined text-[16px] text-outline">folder
                      </span>
                      <span id="folderPathDisplay">D:\osu downloads
                      </span>
                    </div>
                    <button className="px-space-md py-1.5 rounded-full bg-surface-container-high hover:bg-primary hover:text-on-primary text-on-surface transition-all font-label-md text-label-md" type="button">{' '}Change folder{' '}
                    </button>
                  </div>
                </div>
                {/* Row: Copy to osu! Songs folder */}
                <div className="py-space-md flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm group hover:bg-surface-container-low/40 px-2 rounded-DEFAULT transition-colors">
                  <div className="flex flex-col max-w-xl">
                    <span className="font-label-md text-label-md text-on-surface">Auto-copy into osu! Songs directory
                    </span>
                    <span className="font-body-sm text-body-sm text-on-surface-variant">Automatically extracts .osz beatmapsets into your game directory for immediate in-game access.
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-label-sm text-label-sm text-on-surface-variant" id="toggleStateLabel">Disabled
                    </span>
                    <button aria-pressed="false" className="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full bg-surface-container-highest transition-colors duration-200 ease-in-out focus:outline-none" id="songsToggle" type="button">
                      <span className="translate-x-1 pointer-events-none inline-block h-4 w-4 transform rounded-full bg-outline-variant shadow transition duration-200 ease-in-out my-1" id="toggleKnob">
                      </span>
                    </button>
                  </div>
                </div>
                {/* Row: Mirror choice route order */}
                <div className="py-space-md flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm group hover:bg-surface-container-low/40 px-2 rounded-DEFAULT transition-colors">
                  <div className="flex flex-col">
                    <span className="font-label-md text-label-md text-on-surface">Mirror Route Priority
                    </span>
                    <span className="font-body-sm text-body-sm text-on-surface-variant">Automatic failover sequence when mirrors encounter rate-limits
                    </span>
                  </div>
                  <div className="flex items-center gap-space-sm flex-wrap">
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-container text-on-surface font-label-md text-label-md">
                      <span className="w-5 h-5 rounded-full bg-tertiary/20 text-tertiary flex items-center justify-center text-[10px] font-bold">1
                      </span>
                      <span>beatconnect
                      </span>
                      <span className="text-outline-variant text-[11px]">{'>'}
                      </span>
                      <span className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[10px] font-bold">2
                      </span>
                      <span>nerinyan
                      </span>
                      <span className="text-outline-variant text-[11px]">{'>'}
                      </span>
                      <span className="w-5 h-5 rounded-full bg-surface-container-highest text-on-surface-variant flex items-center justify-center text-[10px] font-bold">3
                      </span>
                      <span>sayobot
                      </span>
                    </div>
                    <select className="px-3 py-1.5 rounded-full bg-surface-container-high text-on-surface font-label-md text-label-md hover:bg-surface-container-highest transition-colors cursor-pointer border-none focus:outline-none focus:ring-0">
                      <option selected value="balanced">Priority: beatconnect first
                      </option>
                      <option value="nerinyan">Priority: nerinyan first
                      </option>
                      <option value="sayobot">Priority: sayobot first
                      </option>
                      <option value="direct">Direct Bancho only (Supporter)
                      </option>
                    </select>
                  </div>
                </div>
                {/* Row: Concurrent downloads limit */}
                <div className="py-space-md flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm group hover:bg-surface-container-low/40 px-2 rounded-DEFAULT transition-colors">
                  <div className="flex flex-col">
                    <span className="font-label-md text-label-md text-on-surface">Concurrent Download Slots
                    </span>
                    <span className="font-body-sm text-body-sm text-on-surface-variant">Limits bandwidth pressure and avoids mirror IP throttling
                    </span>
                  </div>
                  <div className="flex items-center gap-space-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-headline-sm text-[16px] text-tertiary font-bold">2 parallel active slots
                      </span>
                      <span className="text-on-surface-variant text-body-sm">(Max recommended: 4)
                      </span>
                    </div>
                    <div className="flex items-center gap-1 ml-2">
                      <button className="w-8 h-8 rounded-full bg-surface-container-high hover:bg-surface-container-highest text-on-surface flex items-center justify-center transition-colors" type="button">
                        <span className="material-symbols-outlined text-[18px]">remove
                        </span>
                      </button>
                      <button className="w-8 h-8 rounded-full bg-surface-container-high hover:bg-surface-container-highest text-on-surface flex items-center justify-center transition-colors" type="button">
                        <span className="material-symbols-outlined text-[18px]">add
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            {/* SECTION 3: APP & CLIENT PREFERENCES */}
            <div className="flex flex-col">
              <div className="flex items-center justify-between pb-3 bg-gradient-to-r from-transparent via-outline-variant/10 to-transparent">
                <div className="flex items-center gap-2.5">
                  <span className="w-2 h-2 rounded-full bg-primary-container shadow-[0_0_8px_rgba(164,118,255,0.7)]">
                  </span>
                  <span className="font-headline-sm text-headline-sm text-on-surface uppercase tracking-wider text-[14px]">App & Engine
                  </span>
                </div>
                <span className="font-label-sm text-label-sm text-on-surface-variant">Interface tuning and portable archives
                </span>
              </div>
              <div className="flex flex-col divide-y divide-surface-container-highest/60">
                {/* Row: Theme */}
                <div className="py-space-md flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm group hover:bg-surface-container-low/40 px-2 rounded-DEFAULT transition-colors">
                  <div className="flex flex-col">
                    <span className="font-label-md text-label-md text-on-surface">Interface Theme
                    </span>
                    <span className="font-body-sm text-body-sm text-on-surface-variant">Locked to Dark Stage for rhythm game contrast & eye strain reduction
                    </span>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-container text-on-surface-variant font-label-md text-label-md">
                    <span className="material-symbols-outlined text-[16px] text-primary">lock
                    </span>
                    <span className="text-on-surface font-semibold">Dark Stage (OLED)
                    </span>
                  </div>
                </div>
                {/* Row: Replay Introduction */}
                <div className="py-space-md flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm group hover:bg-surface-container-low/40 px-2 rounded-DEFAULT transition-colors">
                  <div className="flex flex-col">
                    <span className="font-label-md text-label-md text-on-surface">Introduction & Calibration Tour
                    </span>
                    <span className="font-body-sm text-body-sm text-on-surface-variant">Revisit the 6-step onboarding tour and calibration preview
                    </span>
                  </div>
                  <div>
                    <a className="inline-flex items-center gap-2 px-space-md py-1.5 rounded-full bg-surface-container-high hover:bg-surface-container-highest text-on-surface transition-all font-label-md text-label-md" href="/onboarding">
                      <span className="material-symbols-outlined text-[16px] text-tertiary">replay
                      </span>
                      <span>Replay the introduction
                      </span>
                    </a>
                  </div>
                </div>
                {/* Row: Data Export */}
                <div className="py-space-md flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm group hover:bg-surface-container-low/40 px-2 rounded-DEFAULT transition-colors">
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className="font-label-md text-label-md text-on-surface">Export Calibrated Weights & Play Data
                      </span>
                      <span className="font-label-sm text-[10px] text-outline font-medium tracking-wide">(desktop only)
                      </span>
                    </div>
                    <span className="font-body-sm text-body-sm text-on-surface-variant">Download local snapshots of your calculated difficulty tolerances and mod indices
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-container hover:bg-surface-container-high text-on-surface font-label-md text-label-md transition-colors" type="button">
                      <span className="material-symbols-outlined text-[16px] text-primary">table_chart
                      </span>
                      <span>Export ratings as CSV
                      </span>
                    </button>
                    <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-container hover:bg-surface-container-high text-on-surface font-label-md text-label-md transition-colors" type="button">
                      <span className="material-symbols-outlined text-[16px] text-tertiary">data_object
                      </span>
                      <span>Export history as JSON
                      </span>
                    </button>
                  </div>
                </div>
                {/* Row: Cache & Local Database */}
                <div className="py-space-md flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm group hover:bg-surface-container-low/40 px-2 rounded-DEFAULT transition-colors">
                  <div className="flex flex-col">
                    <span className="font-label-md text-label-md text-on-surface">Local Audio & Cover Cache
                    </span>
                    <span className="font-body-sm text-body-sm text-on-surface-variant">Cached mp3 audio previews, background thumbnails, and offline mirror indices
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-label-sm text-label-sm text-outline">128 MB stored
                    </span>
                    <button className="px-space-md py-1.5 rounded-full bg-surface-container-high hover:bg-surface-container-highest text-on-surface hover:text-error transition-colors font-label-md text-label-md flex items-center gap-1.5" id="clearCacheBtn" type="button">
                      <span className="material-symbols-outlined text-[16px]">cleaning_services
                      </span>
                      <span>Clear beatmap preview cache (128 MB)
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
            {/* SECTION 4: DANGER ZONE */}
            <div className="flex flex-col pt-4">
              <div className="flex items-center justify-between pb-3 bg-gradient-to-r from-transparent via-error/15 to-transparent">
                <div className="flex items-center gap-2.5">
                  <span className="w-2 h-2 rounded-full bg-error shadow-[0_0_8px_rgba(255,180,171,0.7)]">
                  </span>
                  <span className="font-headline-sm text-headline-sm text-error uppercase tracking-wider text-[14px]">Danger Zone
                  </span>
                </div>
                <span className="font-label-sm text-label-sm text-error/80">Irreversible session & data operations
                </span>
              </div>
              <div className="flex flex-col divide-y divide-surface-container-highest/60">
                {/* Delete Account Row */}
                <div className="py-space-md flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm group hover:bg-error-container/10 px-2 rounded-DEFAULT transition-colors">
                  <div className="flex flex-col max-w-xl">
                    <span className="font-label-md text-label-md text-error font-bold">Delete account & wipe guest profile
                    </span>
                    <span className="font-body-sm text-body-sm text-on-surface-variant">{' '}Permanently wipe all calibrated recommendation weights, custom lists, and play history from RecOsuk servers.{' '}
                    </span>
                  </div>
                  <div>
                    <button className="px-space-md py-1.5 rounded-full bg-surface-container-high hover:bg-error hover:text-on-error text-error transition-all font-label-md text-label-md font-bold shadow-sm" type="button">{' '}Delete account{' '}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
    </div>
  )
}
