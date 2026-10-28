import { Link } from 'react-router-dom'

/**
 * "Get the app" landing page (QA batch 2, item 9). PUBLIC route —
 * deliberately outside RequireSession and the route guard: a fresh
 * visitor with no session must reach it.
 *
 * HONESTY NOTE, load-bearing: the Tauri desktop app does not exist
 * yet (milestone M7, Windows-first per the plan). The desktop button
 * is visibly disabled and labelled "Coming soon". There is NO binary
 * link, NO version number, and NO file size anywhere on this page —
 * inventing any of those would be a fake download.
 *
 * Own minimal layout (no AppShell sidebar): this is a landing page,
 * not an app screen. The logo links home to `/`.
 */
export default function Download() {
  return (
    <div className="bg-background font-body-md text-body-md text-on-surface antialiased min-h-screen selection:bg-primary-container selection:text-on-primary-container">
      <header className="w-full px-6 sm:px-12 py-6 flex items-center justify-between">
        <Link
          to="/"
          title="Go to RecOsuk"
          aria-label="RecOsuk — go to the app"
          className="flex items-center gap-3 hover:opacity-90 transition-opacity cursor-pointer"
        >
          <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center shadow-[0_0_12px_rgba(255,176,204,0.35)]">
            <span className="text-on-secondary font-headline-md text-headline-md leading-none">o!</span>
          </div>
          <div className="flex flex-col">
            <span className="font-headline-md text-headline-md tracking-tight text-on-surface leading-none">
              RecOsuk
            </span>
            <span className="font-label-sm text-label-sm text-on-surface-variant">rhythm companion</span>
          </div>
        </Link>
        <Link
          to="/"
          className="px-4 py-2 rounded-full bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-label-md text-label-md transition-all"
        >
          Open the web app
        </Link>
      </header>

      <main className="w-full max-w-3xl mx-auto px-6 pb-16 flex flex-col gap-space-xl">
        {/* Hero */}
        <section className="flex flex-col items-center text-center gap-space-sm pt-space-md">
          <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">
            RecOsuk
          </h1>
          <p className="font-label-md text-label-md text-secondary uppercase tracking-widest">
            rhythm companion
          </p>
          <p className="font-body-md text-body-md text-on-surface-variant max-w-xl">
            Personalised osu! beatmap recommendations, calibrated to your skill in all four modes —
            plus a stat tracker that explains what your numbers mean, and fast mirror downloads.
          </p>
        </section>

        {/* Web version card */}
        <section className="flex flex-col gap-space-md rounded-DEFAULT bg-surface-container-low p-space-lg shadow-md">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[22px]">language</span>
            <h2 className="font-headline-sm text-headline-sm text-on-surface">Web version</h2>
            <span className="px-2 py-0.5 rounded-full bg-[#7EE787]/15 text-[#7EE787] font-label-sm text-[10px] font-bold uppercase">
              Available now
            </span>
          </div>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Use RecOsuk in your browser — the web version is fully usable today: link your osu! account
            (or browse as a guest), get recommendations, track your stats, and download beatmaps.
            Nothing to install.
          </p>
          <div>
            <Link
              to="/"
              className="inline-flex items-center gap-2 px-space-lg py-3 rounded-full bg-primary text-on-primary font-headline-sm text-headline-sm shadow-md hover:bg-primary-container hover:text-on-primary-container active:scale-95 transition-all"
            >
              <span className="material-symbols-outlined text-[18px]">open_in_browser</span>
              <span>Use RecOsuk in your browser</span>
            </Link>
          </div>
        </section>

        {/* Desktop card — honest placeholder */}
        <section className="flex flex-col gap-space-md rounded-DEFAULT bg-surface-container-low p-space-lg shadow-md">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-tertiary text-[22px]">desktop_windows</span>
            <h2 className="font-headline-sm text-headline-sm text-on-surface">Desktop app — Windows</h2>
            <span className="px-2 py-0.5 rounded-full bg-surface-container-highest text-on-surface-variant font-label-sm text-[10px] font-bold uppercase">
              Coming soon
            </span>
          </div>
          <p className="font-body-md text-body-md text-on-surface-variant">
            The Windows desktop app is planned (milestone M7, Windows first). There is no download
            yet — this page will link it the day it exists. When it lands, it will add:
          </p>
          <ul className="flex flex-col gap-2 font-body-md text-body-md text-on-surface-variant list-none">
            <li className="flex items-start gap-2">
              <span className="material-symbols-outlined text-primary text-[18px] mt-0.5">check</span>
              <span>Native Songs-folder auto-copy with no browser permission dance — downloads land in osu! directly.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="material-symbols-outlined text-primary text-[18px] mt-0.5">check</span>
              <span>Desktop-only niceties: a real staging folder, faster bulk pack downloads, and an updater.</span>
            </li>
          </ul>
          <div>
            <button
              className="inline-flex items-center gap-2 px-space-lg py-3 rounded-full bg-surface-container-highest text-on-surface-variant font-headline-sm text-headline-sm cursor-not-allowed opacity-60"
              type="button"
              disabled
              title="The desktop app is not released yet"
            >
              <span className="material-symbols-outlined text-[18px]">download</span>
              <span>Download for Windows — coming soon</span>
            </button>
          </div>
          <p className="font-label-sm text-label-sm text-on-surface-variant">
            Until then, the web version above does everything — including the opt-in Songs-folder
            copy in Settings (Chrome/Edge on desktop).
          </p>
        </section>

        {/* macOS / Linux */}
        <section className="flex flex-col gap-1 rounded-DEFAULT bg-surface-container-low p-space-md shadow-sm">
          <h2 className="font-headline-sm text-headline-sm text-on-surface">macOS &amp; Linux</h2>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Planned after the Windows release. The web version works in any modern browser today.
          </p>
        </section>

        {/* What you get */}
        <section className="flex flex-col gap-space-md">
          <h2 className="font-headline-sm text-headline-sm text-on-surface">What you get</h2>
          <ul className="flex flex-col gap-2 font-body-md text-body-md text-on-surface-variant list-none">
            <li className="flex items-start gap-2">
              <span className="material-symbols-outlined text-primary text-[18px] mt-0.5">check</span>
              <span>Recommendations for all four osu! modes — Standard, Taiko, Catch and Mania — tuned to your comfort band and collapse point.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="material-symbols-outlined text-primary text-[18px] mt-0.5">check</span>
              <span>A stat tracker that explains every number, with progress snapshots over time.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="material-symbols-outlined text-primary text-[18px] mt-0.5">check</span>
              <span>Mirror downloads at full browser speed, plus weekly, monthly and yearly beatmap packs.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="material-symbols-outlined text-primary text-[18px] mt-0.5">check</span>
              <span>Guest mode: link your osu! username and use everything — saving, lists and ratings need a free account.</span>
            </li>
          </ul>
        </section>

        {/* System notes */}
        <section className="flex flex-col gap-1">
          <h2 className="font-headline-sm text-headline-sm text-on-surface">System notes</h2>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Desktop (when it lands): Windows 10/11. An osu! install is only needed for the
            Songs-folder auto-copy — everything else works with just a browser and an osu! account.
          </p>
        </section>
      </main>
    </div>
  )
}
