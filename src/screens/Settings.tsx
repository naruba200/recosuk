// Converted from Stitch export: stitch-raw/13-settings.html
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppShell from '../components/AppShell'
import ExampleBlock from '../components/ExampleBlock'
import MenuSelect from '../components/MenuSelect'
import { useAuth } from '../lib/auth'
import { useGuestStore } from '../lib/guestStore'
import { useModeStore } from '../lib/modeStore'
import { useProfileData } from '../lib/profileService'
import { useDownloadSettings } from '../lib/downloadSettings'
import {
  isFileSystemAccessSupported,
  isTauriShell,
  pickSongsFolder,
  songsFolderStore,
} from '../lib/songsFolder'
import { THEMES, useThemeStore } from '../lib/themes'
import { MODE_LABELS } from '../lib/mode'
export default function Settings() {
  const { user, tier, guestSession, signOut } = useAuth()
  const mode = useModeStore((s) => s.mode)
  const { status, data, identity } = useProfileData(mode)
  const noVideo = useDownloadSettings((s) => s.noVideo)
  const setNoVideo = useDownloadSettings((s) => s.setNoVideo)
  const autoCopy = useDownloadSettings((s) => s.autoCopy)
  const setAutoCopy = useDownloadSettings((s) => s.setAutoCopy)
  const songsFolderName = useDownloadSettings((s) => s.songsFolderName)
  const setSongsFolderName = useDownloadSettings((s) => s.setSongsFolderName)
  const [folderBusy, setFolderBusy] = useState(false)
  const [folderNote, setFolderNote] = useState<string | null>(null)
  // Mirror Route Priority (batch 12): display-only selection, exactly
  // as the native select it replaces was — no functional wiring
  // exists (the native order is fixed in downloadManager.ts), so
  // picking here changes nothing but the shown label. The custom
  // dropdown exists only so the popup is readable on dark themes.
  const [routePriority, setRoutePriority] = useState('balanced')
  const fsaSupported = isFileSystemAccessSupported()
  // Defensive shell detection only: adjusts the Desktop-app group
  // copy below. It never disables or removes any control — the
  // web folder flow stays visible and working either way.
  const inTauri = isTauriShell()
  const theme = useThemeStore((s) => s.theme)
  const setTheme = useThemeStore((s) => s.setTheme)

  const chooseFolder = async () => {
    setFolderBusy(true)
    setFolderNote(null)
    const handle = await pickSongsFolder()
    setFolderBusy(false)
    if (handle) {
      setSongsFolderName(handle.name)
      setFolderNote(`Songs folder set to “${handle.name}”. New downloads copy there when auto-copy is on.`)
    } else if (fsaSupported) {
      setFolderNote('No folder chosen — pick one to enable the copy, or leave auto-copy off.')
    }
  }

  const forgetFolder = async () => {
    await songsFolderStore.forgetHandle()
    setSongsFolderName(null)
    setFolderNote('Songs folder forgotten. Auto-copy will ask again on the next download.')
  }
  const navigate = useNavigate()
  const linkedName = data?.user.username ?? identity?.username ?? guestSession?.osuUsername ?? null
  const settingsIdentity = {
    username: linkedName ?? user?.email ?? 'Guest',
    pp: data?.skillProfile.pp ?? 0,
    countryCode: data?.user.country_code,
    avatarUrl: data ? `https://a.ppy.sh/${data.user.id}` : undefined,
    tierLabel: tier === 'account' ? 'account' : tier === 'guest' ? 'guest' : 'free tier',
  }
  const handleLogout = async () => {
    await signOut()
    navigate('/auth?mode=signin')
  }
  const handleUnlink = () => {
    // Clears the local link (guest session + pending link); the
    // account row keeps its fields until the next link overwrites
    // them, so this re-opens the link flow rather than deleting data.
    useGuestStore.getState().clearGuest()
    try { window.localStorage?.removeItem('recosuk-pending-link') } catch { /* ignore */ }
    navigate('/onboarding/link')
  }
  return (
    <AppShell identity={settingsIdentity}>
        <div className="flex flex-col w-full max-w-5xl mx-auto space-y-10 pb-16">
          {/* SESSION BANNER — live state, not the baked guest copy. */}
          <div className="relative overflow-hidden rounded-DEFAULT bg-surface-container-high p-space-md shadow-lg shadow-surface-container-lowest/50 flex flex-col sm:flex-row sm:items-center justify-between gap-space-md">
            <div className="absolute -right-12 -top-12 w-48 h-48 bg-secondary/10 rounded-full blur-3xl pointer-events-none">
            </div>
            <div className="flex items-center gap-space-md z-10">
              <div className="w-10 h-10 rounded-full bg-secondary-container/40 flex items-center justify-center flex-shrink-0 text-secondary shadow-[0_0_16px_rgb(var(--c-secondary)_/_0.25)]">
                <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>person_alert
                </span>
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="font-headline-sm text-headline-sm text-on-surface">
                    {tier === 'account'
                      ? 'Signed in'
                      : tier === 'guest'
                        ? 'Guest session active'
                        : 'No account linked'}
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-secondary/20 text-secondary font-label-sm text-[10px] uppercase font-bold tracking-wider">
                    {tier === 'account' ? 'Account' : tier === 'guest' ? 'Unverified' : 'Demo'}
                  </span>
                </div>
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
                  {tier === 'account' ? (
                    <>Signed in as <strong className="text-on-surface font-semibold">{user?.email}</strong>{linkedName ? <> · linked to <strong className="text-on-surface font-semibold">{linkedName}</strong></> : null}. Your snapshots and lists sync to your account.</>
                  ) : tier === 'guest' ? (
                    <>You&apos;re browsing as a guest linked to <strong className="text-on-surface font-semibold">{guestSession?.osuUsername}</strong>. Create an account to permanently sync recommendations and lists.</>
                  ) : (
                    <>Nothing is linked yet — sign in or link an osu! username to see your own data instead of the demo.</>
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-space-sm z-10 flex-shrink-0">
              {tier === 'account' ? (
                <button className="inline-flex items-center gap-1.5 px-space-md py-2 rounded-full bg-surface-container-highest hover:bg-surface-bright text-on-surface transition-all font-label-md text-label-md font-bold active:scale-95" type="button" onClick={handleLogout}>
                  <span>Log out</span>
                  <span className="material-symbols-outlined text-[16px]">logout</span>
                </button>
              ) : (
                <button className="inline-flex items-center gap-1.5 px-space-md py-2 rounded-full bg-secondary hover:bg-secondary-fixed text-on-secondary transition-all font-label-md text-label-md font-bold shadow-[0_0_18px_rgb(var(--c-secondary)_/_0.4)] active:scale-95" type="button" onClick={() => navigate('/auth')}>
                  <span>{tier === 'guest' ? 'Create account' : 'Sign in'}</span>
                  <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                </button>
              )}
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
                  <span className="w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_rgb(var(--c-primary)_/_0.7)]">
                  </span>
                  <span className="font-headline-sm text-headline-sm text-on-surface uppercase tracking-wider text-[14px]">Account
                  </span>
                </div>
                <span className="font-label-sm text-label-sm text-on-surface-variant">Profile & Bancho credentials
                </span>
              </div>
              {/* Rows Container */}
              <div className="flex flex-col divide-y divide-surface-container-highest/60">
                {/* Row: Email — live: the signed-in account's email, or the honest guest state. */}
                <div className="py-space-md flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm group hover:bg-surface-container-low/40 px-2 rounded-DEFAULT transition-colors">
                  <div className="flex flex-col">
                    <span className="font-label-md text-label-md text-on-surface">Registered Email
                    </span>
                    <span className="font-body-sm text-body-sm text-on-surface-variant">
                      {user?.email ?? (tier === 'guest' ? 'No email registered (browsing as guest)' : 'No account signed in')}
                    </span>
                  </div>
                  {!user && (
                    <div className="flex items-center gap-space-sm">
                      <button className="px-space-md py-1.5 rounded-full bg-surface-container-high hover:bg-surface-container-highest text-primary hover:text-on-surface transition-all font-label-md text-label-md flex items-center gap-1.5" type="button" onClick={() => navigate('/auth')}>
                        <span className="material-symbols-outlined text-[16px]">add
                        </span>
                        <span>{tier === 'guest' ? 'Add permanent email' : 'Sign in'}</span>
                      </button>
                    </div>
                  )}
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
                    {linkedName ? (
                      <>
                        {/* Account badge — live identity */}
                        <div className="flex items-center gap-space-sm px-3 py-1.5 rounded-full bg-surface-container-high shadow-inner">
                          <div className="relative w-6 h-6 rounded-full bg-surface-container-highest flex items-center justify-center flex-shrink-0">
                            {data ? (
                              <img className="w-6 h-6 rounded-full object-cover" alt="" src={`https://a.ppy.sh/${data.user.id}`} />
                            ) : (
                              <span className="material-symbols-outlined text-[15px] text-primary">face</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-label-md text-label-md text-on-surface font-bold">{linkedName}
                            </span>
                            {data?.user.country_code && (
                              <span className="px-1.5 py-0.2 rounded bg-surface-container-lowest text-[10px] font-bold text-secondary">{data.user.country_code}
                              </span>
                            )}
                            {data && (
                              <span className="font-label-sm text-label-sm text-primary">{data.skillProfile.pp.toLocaleString()} pp
                              </span>
                            )}
                          </div>
                          <span className="inline-flex items-center gap-1 font-label-sm text-[10px] text-hitgreen pl-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-hitgreen animate-pulse">
                            </span>
                            <span>{status === 'loading' ? 'Loading…' : 'Synced'}
                            </span>
                          </span>
                        </div>
                        {/* Actions */}
                        <button className="px-3 py-1.5 rounded-full hover:bg-error-container/30 text-error hover:text-on-error-container font-label-md text-label-md transition-colors" type="button" onClick={handleUnlink}>{' '}Unlink{' '}
                        </button>
                      </>
                    ) : (
                      <span className="font-body-sm text-body-sm text-on-surface-variant">No osu! account linked yet</span>
                    )}
                    <button className="px-3 py-1.5 rounded-full bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface font-label-md text-label-md transition-colors" type="button" onClick={() => navigate('/onboarding/link')}>{linkedName ? 'Use a different account' : 'Link an osu! account'}
                    </button>
                  </div>
                </div>
                {/* Row: Account Tier / Status — live tier */}
                <div className="py-space-md flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm group hover:bg-surface-container-low/40 px-2 rounded-DEFAULT transition-colors">
                  <div className="flex flex-col">
                    <span className="font-label-md text-label-md text-on-surface">Account Tier & Persistence
                    </span>
                    <span className="font-body-sm text-body-sm text-on-surface-variant">
                      {tier === 'account'
                        ? 'Account data (snapshots, lists, ratings) syncs to Supabase'
                        : tier === 'guest'
                          ? 'Local browser storage keeps this session until cache is cleared'
                          : 'Browsing the demo — link an account to keep anything'}
                    </span>
                  </div>
                  <div className="flex items-center gap-space-sm">
                    <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-surface-container-low text-on-surface-variant font-label-sm text-label-sm">
                      <span className="w-2 h-2 rounded-full bg-secondary-fixed-dim">
                      </span>
                      <span>
                        {tier === 'account'
                          ? `Account Tier • ${MODE_LABELS[mode]} mode`
                          : tier === 'guest'
                            ? 'Guest Tier • Session Data Temporary'
                            : 'No session • Demo data'}
                      </span>
                    </div>
                  </div>
                </div>
                {/* Row: Log out — present whenever there is a session to end. */}
                {(user || guestSession) && (
                  <div className="py-space-md flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm group hover:bg-surface-container-low/40 px-2 rounded-DEFAULT transition-colors">
                    <div className="flex flex-col">
                      <span className="font-label-md text-label-md text-on-surface">Log out</span>
                      <span className="font-body-sm text-body-sm text-on-surface-variant">Signs out of the account and clears the linked guest session</span>
                    </div>
                    <div className="flex items-center gap-space-sm">
                      <button className="inline-flex items-center gap-1.5 px-space-md py-1.5 rounded-full bg-surface-container-high hover:bg-error hover:text-on-error text-on-surface transition-all font-label-md text-label-md font-bold" type="button" onClick={handleLogout}>
                        <span className="material-symbols-outlined text-[16px]">logout</span>
                        <span>Log out</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
            {/* SECTION 2: DOWNLOAD OPTIONS — live preferences (QA
                batch 2). Kept separate from the ExampleBlock sample
                settings below: these switches change behaviour. */}
            <div className="flex flex-col">
              <div className="flex items-center justify-between pb-3 bg-gradient-to-r from-transparent via-outline-variant/10 to-transparent">
                <div className="flex items-center gap-2.5">
                  <span className="w-2 h-2 rounded-full bg-secondary shadow-[0_0_8px_rgb(var(--c-recpink)_/_0.7)]">
                  </span>
                  <span className="font-headline-sm text-headline-sm text-on-surface uppercase tracking-wider text-[14px]">Download options
                  </span>
                </div>
                <span className="font-label-sm text-label-sm text-on-surface-variant">Applies to every download button
                </span>
              </div>
              {/* Group 1 — Browser downloads: settings that affect
                  downloads in this browser. Grouping/labels only;
                  the toggle below is unchanged. */}
              <div className="flex flex-col gap-space-lg">
              <div className="flex flex-col">
                <h3 className="font-headline-sm text-headline-sm text-on-surface text-[14px]">Browser downloads</h3>
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">Settings that affect downloads in this browser.</p>
              <div className="flex flex-col divide-y divide-surface-container-highest/60">
                {/* Row: Download without video */}
                <div className="py-space-md flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm group hover:bg-surface-container-low/40 px-2 rounded-DEFAULT transition-colors">
                  <div className="flex flex-col max-w-xl">
                    <span className="font-label-md text-label-md text-on-surface">Download without video</span>
                    <span className="font-body-sm text-body-sm text-on-surface-variant">
                      Downloads the smaller no-video .osz where the mirror supports it. Today that means catboy.best (its no-video file) and the official osu! option (which uses <span className="font-mono">?noVideo=1</span>); Beatconnect, Nerinyan and Sayobot don&apos;t publish a verified no-video form yet, so they still serve the full file.
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-label-sm text-label-sm text-on-surface-variant">{noVideo ? 'On' : 'Off'}</span>
                    <button
                      role="switch"
                      aria-checked={noVideo}
                      aria-label="Download without video"
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none ${noVideo ? 'bg-primary' : 'bg-surface-container-highest'}`}
                      type="button"
                      onClick={() => setNoVideo(!noVideo)}
                    >
                      <span className={`${noVideo ? 'translate-x-6' : 'translate-x-1'} pointer-events-none inline-block h-4 w-4 transform rounded-full bg-on-surface shadow transition duration-200 ease-in-out my-1`} />
                    </button>
                  </div>
                </div>
              </div>
              </div>
              {/* Group 2 — Desktop app: getting downloads into osu!
                  itself. This group stays visible and fully working
                  on the web exactly as before (Chromium folder
                  permission flow); the native desktop app will do
                  the same copy with no permission dance. */}
              <div className="flex flex-col">
                <h3 className="font-headline-sm text-headline-sm text-on-surface text-[14px]">Desktop app</h3>
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
                  {inTauri
                    ? 'You are running in the desktop shell. The folder controls below work the same as in the browser.'
                    : 'Getting downloads into osu! itself. Works in this browser today via a folder permission — the native desktop app will do it without the permission dance.'}
                </p>
              <div className="flex flex-col divide-y divide-surface-container-highest/60">
                {/* Row: Auto-copy into osu! Songs folder (item 8) */}
                <div className="py-space-md flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm group hover:bg-surface-container-low/40 px-2 rounded-DEFAULT transition-colors">
                  <div className="flex flex-col max-w-xl">
                    <span className="font-label-md text-label-md text-on-surface">Auto-copy downloads into osu! Songs folder</span>
                    <span className="font-body-sm text-body-sm text-on-surface-variant">
                      Off by default. When on, every download is ALSO written straight into your osu! Songs folder, so the map is in-game on osu!&apos;s next launch (or press F5 in song select). Your normal browser download still happens as a backup, and a failed copy never blocks it. The desktop app (coming later) will do this natively with no browser permission dance.
                    </span>
                    {!fsaSupported && (
                      <span className="font-body-sm text-body-sm text-tertiary mt-1">
                        Your browser can&apos;t pick folders — this needs Chrome or Edge on desktop. Downloads still work normally.
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-label-sm text-label-sm text-on-surface-variant">{autoCopy ? 'On' : 'Off'}</span>
                    <button
                      role="switch"
                      aria-checked={autoCopy}
                      aria-label="Auto-copy downloads into osu! Songs folder"
                      disabled={!fsaSupported}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${autoCopy ? 'bg-primary' : 'bg-surface-container-highest'}`}
                      type="button"
                      onClick={() => setAutoCopy(!autoCopy)}
                    >
                      <span className={`${autoCopy ? 'translate-x-6' : 'translate-x-1'} pointer-events-none inline-block h-4 w-4 transform rounded-full bg-on-surface shadow transition duration-200 ease-in-out my-1`} />
                    </button>
                  </div>
                </div>
                {/* Row: Songs folder picker */}
                <div className="py-space-md flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm group hover:bg-surface-container-low/40 px-2 rounded-DEFAULT transition-colors">
                  <div className="flex flex-col max-w-xl">
                    <span className="font-label-md text-label-md text-on-surface">osu! Songs folder</span>
                    <span className="font-body-sm text-body-sm text-on-surface-variant">
                      {fsaSupported
                        ? (songsFolderName
                          ? `Chosen folder: ${songsFolderName}. RecOsuk only ever writes inside this folder.`
                          : 'No folder chosen yet. You can pick one here, or you will be asked on your first download with auto-copy on.')
                        : 'Folder picking is not supported in this browser.'}
                    </span>
                    {folderNote && (
                      <span className="font-body-sm text-body-sm text-tertiary mt-1">{folderNote}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-space-sm flex-shrink-0">
                    {songsFolderName && (
                      <button
                        className="px-space-md py-1.5 rounded-full bg-surface-container-high hover:bg-error-container/30 text-error font-label-md text-label-md transition-colors"
                        type="button"
                        onClick={() => void forgetFolder()}
                      >
                        Forget folder
                      </button>
                    )}
                    <button
                      className="px-space-md py-1.5 rounded-full bg-surface-container-high hover:bg-primary hover:text-on-primary text-on-surface transition-all font-label-md text-label-md disabled:opacity-60"
                      type="button"
                      disabled={!fsaSupported || folderBusy}
                      onClick={() => void chooseFolder()}
                    >
                      {folderBusy ? 'Choosing…' : songsFolderName ? 'Change folder' : 'Choose osu! Songs folder'}
                    </button>
                  </div>
                </div>
              </div>
              </div>
              </div>
            </div>
            {/* SECTION 3: DOWNLOADS & CLIENT SYNC */}
            <div className="flex flex-col">
              <div className="flex items-center justify-between pb-3 bg-gradient-to-r from-transparent via-outline-variant/10 to-transparent">
                <div className="flex items-center gap-2.5">
                  <span className="w-2 h-2 rounded-full bg-tertiary shadow-[0_0_8px_rgb(var(--c-tertiary)_/_0.7)]">
                  </span>
                  <span className="font-headline-sm text-headline-sm text-on-surface uppercase tracking-wider text-[14px]">Downloads & Client Sync
                  </span>
                </div>
                <span className="font-label-sm text-label-sm text-on-surface-variant">Mirror prioritization and local game paths
                </span>
              </div>
              {/* Sample settings: folder path, slots and mirror priority
                  are illustration, not wired-up preferences. */}
              <ExampleBlock note="Example settings — these download options don't change behaviour yet.">
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
                    <MenuSelect
                      options={[
                        { value: 'balanced', label: 'Priority: beatconnect first' },
                        { value: 'nerinyan', label: 'Priority: nerinyan first' },
                        { value: 'sayobot', label: 'Priority: sayobot first' },
                        { value: 'direct', label: 'Direct Bancho only (Supporter)' },
                      ]}
                      value={routePriority}
                      onChange={setRoutePriority}
                      ariaLabel="Mirror route priority"
                      buttonClassName="relative flex items-center h-9 pl-3 pr-8 rounded-full bg-surface-container-high text-on-surface font-label-md text-label-md hover:bg-surface-container-highest transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    />
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
              </ExampleBlock>
            </div>
            {/* SECTION 3: APP & CLIENT PREFERENCES */}
            <div className="flex flex-col">
              <div className="flex items-center justify-between pb-3 bg-gradient-to-r from-transparent via-outline-variant/10 to-transparent">
                <div className="flex items-center gap-2.5">
                  <span className="w-2 h-2 rounded-full bg-primary-container shadow-[0_0_8px_rgb(var(--c-primary-container)_/_0.7)]">
                  </span>
                  <span className="font-headline-sm text-headline-sm text-on-surface uppercase tracking-wider text-[14px]">App & Engine
                  </span>
                </div>
                <span className="font-label-sm text-label-sm text-on-surface-variant">Interface tuning and portable archives
                </span>
              </div>
              <div className="flex flex-col divide-y divide-surface-container-highest/60">
                {/* Row: Theme — real picker (batch 11). Applies
                    immediately to every token-coloured surface and
                    persists in localStorage; Dark Stage is the
                    default when nothing is stored. */}
                <div className="py-space-md flex flex-col gap-space-sm group hover:bg-surface-container-low/40 px-2 rounded-DEFAULT transition-colors">
                  <div className="flex flex-col">
                    <span className="font-label-md text-label-md text-on-surface">Interface Theme
                    </span>
                    <span className="font-body-sm text-body-sm text-on-surface-variant">Pick a colour theme. It applies across the app and is remembered on this device.
                    </span>
                  </div>
                  <div className="grid gap-space-sm sm:grid-cols-2" role="radiogroup" aria-label="Interface theme">
                    {THEMES.map((t) => {
                      const selected = t.id === theme
                      return (
                        <button
                          key={t.id}
                          role="radio"
                          aria-checked={selected}
                          aria-label={`${t.label} theme`}
                          className={`flex items-start gap-3 rounded-DEFAULT border px-3 py-2.5 text-left transition-all ${selected ? 'border-primary bg-primary/10' : 'border-outline-variant/40 bg-surface-container hover:bg-surface-container-high'}`}
                          type="button"
                          onClick={() => setTheme(t.id)}
                        >
                          <span className="flex flex-shrink-0 -space-x-1.5 pt-0.5" aria-hidden="true">
                            {t.swatches.map((hex) => (
                              <span
                                key={hex}
                                className="w-5 h-5 rounded-full border-2 border-surface-container"
                                style={{ backgroundColor: hex }}
                              />
                            ))}
                          </span>
                          <span className="flex flex-col min-w-0">
                            <span className="font-label-md text-label-md text-on-surface font-bold flex items-center gap-1.5">
                              {t.label}
                              {selected && (
                                <span className="material-symbols-outlined text-[16px] text-primary">check_circle</span>
                              )}
                            </span>
                            <span className="font-body-sm text-body-sm text-on-surface-variant">{t.description}</span>
                          </span>
                        </button>
                      )
                    })}
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
                {/* Row: Get the desktop app */}
                <div className="py-space-md flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm group hover:bg-surface-container-low/40 px-2 rounded-DEFAULT transition-colors">
                  <div className="flex flex-col">
                    <span className="font-label-md text-label-md text-on-surface">Get the desktop app
                    </span>
                    <span className="font-body-sm text-body-sm text-on-surface-variant">The Windows desktop app is coming later (native Songs-folder copy, no permission dance). See the download page — no binary yet.
                    </span>
                  </div>
                  <div>
                    <button
                      className="inline-flex items-center gap-2 px-space-md py-1.5 rounded-full bg-surface-container-high hover:bg-surface-container-highest text-on-surface transition-all font-label-md text-label-md"
                      type="button"
                      onClick={() => navigate('/download')}
                    >
                      <span className="material-symbols-outlined text-[16px] text-tertiary">download
                      </span>
                      <span>View download page
                      </span>
                    </button>
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
                {/* Row: Cache & Local Database — sample values, not a real measurement. */}
                <ExampleBlock note="Example — the cache size shown here is a placeholder, not a real measurement.">
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
                </ExampleBlock>
              </div>
            </div>
            {/* SECTION 4: DANGER ZONE */}
            <div className="flex flex-col pt-4">
              <div className="flex items-center justify-between pb-3 bg-gradient-to-r from-transparent via-error/15 to-transparent">
                <div className="flex items-center gap-2.5">
                  <span className="w-2 h-2 rounded-full bg-error shadow-[0_0_8px_rgb(var(--c-error)_/_0.7)]">
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
    </AppShell>
  )
}
