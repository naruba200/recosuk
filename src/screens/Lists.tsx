// Converted from Stitch export: stitch-raw/10-lists.html
import AppShell from '../components/AppShell'
import ExampleBlock from '../components/ExampleBlock'
import { useAuth } from '../lib/auth'
export default function Lists() {
  const { user, tier, guestSession } = useAuth()
  const pageIdentity = {
    username: guestSession?.osuUsername ?? user?.email ?? 'Guest',
    pp: 0,
    tierLabel: tier === 'account' ? 'account' : tier === 'guest' ? 'guest' : 'free tier',
  }
  return (
    <AppShell identity={pageIdentity}>
      <ExampleBlock note="Example — real lists arrive in M5. Nothing here is saved yet.">
        <div className="flex flex-col w-full">
          {/* Interactive script to update the App Shell sidebar active link state */}
          {/* Ambient Stage Atmospheric Glows */}
          <div className="relative w-full">
            <div className="pointer-events-none absolute -top-16 left-1/4 w-[520px] h-[280px] bg-primary/10 rounded-full blur-[120px]">
            </div>
            <div className="pointer-events-none absolute top-40 right-10 w-[380px] h-[320px] bg-secondary/10 rounded-full blur-[140px]">
            </div>
            {/* Header Section */}
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-space-lg mb-space-xl">
              <div className="flex flex-col gap-space-xs max-w-2xl">
                <div className="flex items-center gap-space-sm mb-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse">
                  </span>
                  <span className="font-label-sm text-label-sm uppercase tracking-wider text-primary">Playlists & Collections Engine
                  </span>
                </div>
                <h1 className="font-headline-xl text-headline-xl text-on-surface tracking-tight">Your lists
                </h1>
                <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">{' '}Custom beatmap collections across all rhythm modes. Practice playlists automatically sync with your local client.{' '}
                </p>
              </div>
              {/* Action Suite: Prominent osu! pink "+ New list" */}
              <div className="flex items-center gap-space-md flex-shrink-0">
                <button className="group relative px-space-lg py-3 rounded-full bg-secondary-container text-on-secondary font-headline-sm text-label-md flex items-center gap-space-xs shadow-[0_0_24px_rgba(255,176,204,0.35)] hover:shadow-[0_0_32px_rgba(255,176,204,0.6)] hover:brightness-110 active:scale-95 transition-all" type="button">
                  <span className="material-symbols-outlined text-[20px] font-bold group-hover:rotate-90 transition-transform">add
                  </span>
                  <span>New list
                  </span>
                </button>
              </div>
            </div>
            {/* Filter & Live Synced Stats Ribbon */}
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-space-md p-space-md rounded-DEFAULT bg-surface-container-low mb-space-lg shadow-sm">
              <div className="relative flex-1 max-w-xl">
                <span className="material-symbols-outlined absolute left-space-md top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">search
                </span>
                <input className="w-full pl-11 pr-space-md py-2.5 rounded-full bg-surface-container text-on-surface placeholder:text-outline-variant font-body-md text-body-md focus:outline-none focus:bg-surface-container-high focus:shadow-[0_0_0_2px_rgba(164,118,255,0.4)] transition-all" placeholder="Search collections, tags, or beatmap titles..." type="text" />
              </div>
              {/* Quick Summary Pills */}
              <div className="flex flex-wrap items-center gap-space-sm text-on-surface-variant font-label-sm text-label-sm">
                <div className="flex items-center gap-space-xs px-space-md py-1.5 rounded-full bg-surface-container text-on-surface">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary">
                  </span>
                  <span>
                    <strong className="font-bold text-primary">3
                    </strong>{' '}active collections
                  </span>
                </div>
                <div className="flex items-center gap-space-xs px-space-md py-1.5 rounded-full bg-surface-container text-on-surface">
                  <span className="material-symbols-outlined text-tertiary text-[16px]">library_music
                  </span>
                  <span>
                    <strong className="font-bold text-tertiary">48
                    </strong>{' '}beatmaps total
                  </span>
                </div>
                <div className="flex items-center gap-space-xs px-space-md py-1.5 rounded-full bg-surface-container text-secondary">
                  <span className="material-symbols-outlined text-[16px]">sync_saved_locally
                  </span>
                  <span className="text-on-surface">Sync to osu! collections:{' '}
                    <span className="text-secondary font-bold">Enabled
                    </span>
                  </span>
                </div>
              </div>
            </div>
            {/* Primary Layout Grid: Lists Stream (Main 8 Cols) + Helper Inspector (Side 4 Cols) */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-space-lg items-start">
              {/* Main Lists Column */}
              <div className="xl:col-span-8 flex flex-col gap-space-md">
                {/* List Band 1: 5 star training */}
                <div className="group relative flex flex-col gap-space-md p-space-lg rounded-DEFAULT bg-surface-container transition-all hover:bg-surface-container-high hover:shadow-[0_8px_32px_rgba(157,107,255,0.15)]">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-md">
                    {/* Left Header Segment with Overlapping Cover Art Discs */}
                    <div className="flex items-center gap-space-md min-w-0">
                      {/* Overlapping Rhythm Game Covers Stack */}
                      <div className="relative flex items-center flex-shrink-0 w-24 h-14">
                        <div className="absolute left-0 w-12 h-12 rounded-full overflow-hidden shadow-md bg-surface-container-highest z-10 transition-transform group-hover:-translate-x-1">
                          <img className="w-full h-full object-cover" data-alt="Vibrant neon Camellia electronic rhythm game beatmap album art cover with complex geometric laser patterns in deep purple, magenta, and cyan hues" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDJmxtCBcyq23wovqHv6qqKjNJDjorZyNioZmzRcGpOHsBi8gL0c35pDGPcMsvk74jUkv70QjhtToAqKEfjxDJNOaVpmhMD_UmULdYuJkoImN5K_XAcJF_DZiEcNxRPncgcdyLNjeMmXZt03rxOdqlk12pte2uwWsx32RvvGRyFdRz5dOAmI1HHHfr-bnoHjzTooGzt7rjdRorgRE5cX3yFp7gd-3eyeNfnHSmInmTxMHJH6NPbVvSC" />
                        </div>
                        <div className="absolute left-4 w-12 h-12 rounded-full overflow-hidden shadow-md bg-surface-container-highest z-20 transition-transform group-hover:translate-y-0.5">
                          <img className="w-full h-full object-cover" data-alt="Xi hardcore orchestral rhythm game jacket cover art depicting abstract crystal monoliths in shattered void with electric violet glow" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAfTjBZmaWsodHal_L97pvJVf97H3RcQVGbYAKy7ZF4olOGjB1fhUhVvL7y18z_bx5MaA_2194BPQc0jkpItTWW7HUHSq9fUEhGFR-Pb9tWJzHR0SAiVPTisiytQzhwOxSO24sgnKWlbVEH6CWcwcmwFXyZzCj-QUL-77ifhCwWIsjUPRI6VcRUc3FCgdNbEeHCd-BpoS_0Av581KLp7tmm7uBqhS61G42MdrGIzStwee54DAsgvniJ" />
                        </div>
                        <div className="absolute left-8 w-12 h-12 rounded-full overflow-hidden shadow-md bg-surface-container-highest z-30 transition-transform group-hover:translate-x-1">
                          <img className="w-full h-full object-cover" data-alt="LeaF rhythm game visual track illustration with vivid kaleidoscopic butterfly wings and swirling high BPM sound waves" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCwxOVbn0wS0sNIcGHf1Q1AFHiJv5JhHPrXII0D8QdNYuHjLn-LKpNqc7wREWfPCDkcz1cbM7CQ8dx901sVLojklYwIzFmIeilC33eVp9bfokyfEVR11FBqxm9ey3AuxWufVz89i13ceqO6Gie4QOnlxinJ2HxUWU37mp7s3P3FF11ZMwJZeks58_xdPytL4gckZnaroqKztJJSfNgX21PNhok4Nkp9UsG8cnKTiaSU1xPvY5WWuuIk" />
                        </div>
                        <div className="absolute left-12 w-12 h-12 rounded-full overflow-hidden shadow-md bg-surface-container-highest z-40">
                          <img className="w-full h-full object-cover" data-alt="Sakuzyo epic classical electronic cover art with luminous piano keys flying through space in crimson and violet light" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDmfvi5BMBQtNwp9j-UWGlxGaGVOEpFM_LcfqTdUEPCTeC-ZXRswptYrHRKnvV-TkSZo0udHK26Mr956gNsv5LsD_kH3V6uOBIdy81sUeqdicxXPyr5WLKqlSBgHKic_0ltO87h69l_zFjmcz8jNYL3Z5Fpk3f_3b4L7LbHK0iGun57C-k0n3b7wJrW9-NZZvrTvYyMQZHBo4Hjb1g6Keyjc5FcXt7x8fZHCyhDEdxIgtA3MYzyeUKc" />
                        </div>
                      </div>
                      {/* Title & Tags */}
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-space-sm flex-wrap">
                          <h2 className="font-headline-sm text-headline-sm text-on-surface truncate">5 star training
                          </h2>
                          <span className="px-2 py-0.5 rounded-full bg-primary-container text-on-primary-container font-label-sm text-[10px] uppercase font-bold tracking-wider">Primary Focus
                          </span>
                          <span className="font-label-sm text-[11px] text-on-surface-variant flex items-center gap-1">
                            <span className="material-symbols-outlined text-[13px] text-tertiary">schedule
                            </span>{' '}Updated 2 hours ago{' '}
                          </span>
                        </div>
                        {/* Mode Badges & Beatmap Count */}
                        <div className="flex items-center gap-space-sm mt-1">
                          <span className="font-label-sm text-label-sm text-primary font-bold">24 beatmaps
                          </span>
                          <span className="text-outline-variant font-label-sm text-label-sm">·
                          </span>
                          <div className="flex items-center gap-1.5">
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container-highest text-primary font-label-sm text-[11px]">
                              <span className="w-2 h-2 rounded-full bg-[#9D6BFF]">
                              </span>{' '}Mania (18){' '}
                            </span>
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container-highest text-secondary font-label-sm text-[11px]">
                              <span className="w-2 h-2 rounded-full bg-[#FF66AA]">
                              </span>{' '}Standard (6){' '}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                    {/* Action Cluster */}
                    <div className="flex items-center gap-space-xs flex-wrap md:flex-nowrap justify-end flex-shrink-0">
                      <button className="px-space-md py-2 rounded-full bg-primary text-on-primary font-label-md text-label-md font-semibold flex items-center gap-1.5 hover:bg-primary-fixed hover:text-on-primary-fixed shadow-[0_0_16px_rgba(210,187,255,0.3)] transition-all active:scale-95" type="button">
                        <span className="material-symbols-outlined text-[18px]">play_circle
                        </span>
                        <span>Play in osu!
                        </span>
                      </button>
                      <button className="w-9 h-9 rounded-full bg-surface-container-highest text-on-surface hover:text-tertiary hover:bg-surface-bright flex items-center justify-center transition-colors" title="Download all (.osz)" type="button">
                        <span className="material-symbols-outlined text-[18px]">download
                        </span>
                      </button>
                      <button className="w-9 h-9 rounded-full bg-surface-container-highest text-on-surface hover:text-primary hover:bg-surface-bright flex items-center justify-center transition-colors" title="Edit list" type="button">
                        <span className="material-symbols-outlined text-[18px]">edit
                        </span>
                      </button>
                      <button className="w-9 h-9 rounded-full bg-surface-container-highest text-on-surface hover:text-on-surface hover:bg-surface-bright flex items-center justify-center transition-colors" title="List options" type="button">
                        <span className="material-symbols-outlined text-[18px]">more_vert
                        </span>
                      </button>
                    </div>
                  </div>
                  {/* Description / Notes Capsule */}
                  <div className="flex items-center gap-space-sm p-space-sm px-space-md rounded-DEFAULT bg-surface-container-low text-on-surface-variant font-body-sm text-body-sm">
                    <span className="material-symbols-outlined text-primary text-[18px] flex-shrink-0">insights
                    </span>
                    <span className="truncate">Calibrated to 5.0★ – 5.4★ collapse gap breakthrough. Heavy chordjack and jumpstream density.
                    </span>
                    <div className="ml-auto hidden sm:flex items-center gap-2 flex-shrink-0">
                      <span className="px-2 py-0.5 rounded-full bg-surface-container text-on-surface font-label-sm text-[10px] font-bold">5.0★ – 5.42★
                      </span>
                    </div>
                  </div>
                </div>
                {/* List Band 2: LN practice */}
                <div className="group relative flex flex-col gap-space-md p-space-lg rounded-DEFAULT bg-surface-container transition-all hover:bg-surface-container-high hover:shadow-[0_8px_32px_rgba(157,107,255,0.15)]">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-md">
                    {/* Left Header Segment with Overlapping Cover Art Discs */}
                    <div className="flex items-center gap-space-md min-w-0">
                      <div className="relative flex items-center flex-shrink-0 w-24 h-14">
                        <div className="absolute left-0 w-12 h-12 rounded-full overflow-hidden shadow-md bg-surface-container-highest z-10">
                          <img className="w-full h-full object-cover" data-alt="High tech rhythm game cyber deck artwork with neon cyan and dark purple matrix long notes cascading down a transparent stage" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAVvQml8DBtoyH2cZ1rEcURqqhmuQI_hzt6FAICWPkHzhTCzSJbybutZI_LIql-WbkpnMRY7Ow3OjvgMSglXWw9uJRoksf6gpxb6fVuEdAXnZouM90jk7cLYX0sWrZpHAj0MKqCdp7tH2meYq0xya_YYa-2IKdFb3vXrpQS9AJ2tucfzHq_Cf_qTePEf1Sn-qj8uoVlsscruCheVh9iqW13rgb0gwlXYbkfxb3nncMySMgUFLdB4qbu" />
                        </div>
                        <div className="absolute left-4 w-12 h-12 rounded-full overflow-hidden shadow-md bg-surface-container-highest z-20">
                          <img className="w-full h-full object-cover" data-alt="Futuristic anime synthwave cover art with glowing violet hair and futuristic headphones against deep space nebula" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCo4DHcwR2MFfooEfs88xuQKjI_kTy6DmeuNUm7Zmr4GxwE_0PNnXiSRR1c2RgN12MPT8ZoedLnd1dfda7dNjKTAPdIeCili2vJxxxOmmg5eKGsKeZSkL-vUuBMUZlpAUKvX2Cv8y0NQ6i7Z7rkuQB0St3pae05VdNtg5NsOGjrbjSLLSeaf3bTeUc5zUpZvaCvI9zYcXlMJHj8VUQhGpNtMdxtvMwoShvP3bH6g3qnlbsByH6sp8Z0" />
                        </div>
                        <div className="absolute left-8 w-12 h-12 rounded-full overflow-hidden shadow-md bg-surface-container-highest z-30">
                          <img className="w-full h-full object-cover" data-alt="Abstract dark ambient rhythm track visual with vertical neon laser pillars radiating in magenta and soft lavender" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBgcYjLHxTMvQk5TaNl8nn5Cv5TiZmx3rbiMCuRKt5LbK0XaAB30sKYkvLiojSVKKZNwESgWiWd2tFFDGuHepkYcAOcfWf63qPEJ4_2cY8ZNJFBDvH7b5PWKUdG8KBYc1lzcFmmjpP3798zpYjp4Gi0-xAtnuiaVjzSdHzLgzyGDpU4VBZiHH5SXNbgTyQiX0kAwj1TusnJ2jWf5cx0YbXGVbBQhAOikPravgqACg9Ahq35x9p3b7xL" />
                        </div>
                        <div className="absolute left-12 w-12 h-12 rounded-full overflow-hidden shadow-md bg-surface-container-highest z-40">
                          <img className="w-full h-full object-cover" data-alt="Speedcore rhythm game album artwork with fractured prism glass reflecting sharp geometric light bursts" src="https://lh3.googleusercontent.com/aida-public/AB6AXuD3Pjx15JGt9BLWfLEsbvVfdGN8D1bNfPhpCFaXf3Ufcmp9HP2P44Qe60XUSjNFjjcK8Mt77NRIm5FC40VFEmu1hbZNBITXSUd88N0ESiKo8btyfojwi0UVRu4yvJZ-k6VOmcvMVvmxuyWNhp_gV4QJHAp2CevS6csvox_uMv1HogPuW935u4ac2NSCdfQAE3FYGCbYBuRlG5EVsePhVF-qicrccQ6pQwTQpQVk76jWefgqRUIPJIk7" />
                        </div>
                      </div>
                      {/* Title & Tags */}
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-space-sm flex-wrap">
                          <h2 className="font-headline-sm text-headline-sm text-on-surface truncate">LN practice
                          </h2>
                          <span className="px-2 py-0.5 rounded-full bg-tertiary-container text-on-tertiary font-label-sm text-[10px] uppercase font-bold tracking-wider">Technique
                          </span>
                          <span className="font-label-sm text-[11px] text-on-surface-variant flex items-center gap-1">
                            <span className="material-symbols-outlined text-[13px] text-outline">schedule
                            </span>{' '}Updated yesterday{' '}
                          </span>
                        </div>
                        {/* Mode Badges & Beatmap Count */}
                        <div className="flex items-center gap-space-sm mt-1">
                          <span className="font-label-sm text-label-sm text-tertiary font-bold">16 beatmaps
                          </span>
                          <span className="text-outline-variant font-label-sm text-label-sm">·
                          </span>
                          <div className="flex items-center gap-1.5">
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container-highest text-primary font-label-sm text-[11px]">
                              <span className="w-2 h-2 rounded-full bg-[#9D6BFF]">
                              </span>{' '}Mania (16) · 100% 7K{' '}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                    {/* Action Cluster */}
                    <div className="flex items-center gap-space-xs flex-wrap md:flex-nowrap justify-end flex-shrink-0">
                      <button className="px-space-md py-2 rounded-full bg-primary text-on-primary font-label-md text-label-md font-semibold flex items-center gap-1.5 hover:bg-primary-fixed hover:text-on-primary-fixed shadow-[0_0_16px_rgba(210,187,255,0.3)] transition-all active:scale-95" type="button">
                        <span className="material-symbols-outlined text-[18px]">play_circle
                        </span>
                        <span>Play in osu!
                        </span>
                      </button>
                      <button className="w-9 h-9 rounded-full bg-surface-container-highest text-on-surface hover:text-tertiary hover:bg-surface-bright flex items-center justify-center transition-colors" title="Download all (.osz)" type="button">
                        <span className="material-symbols-outlined text-[18px]">download
                        </span>
                      </button>
                      <button className="w-9 h-9 rounded-full bg-surface-container-highest text-on-surface hover:text-primary hover:bg-surface-bright flex items-center justify-center transition-colors" title="Edit list" type="button">
                        <span className="material-symbols-outlined text-[18px]">edit
                        </span>
                      </button>
                      <button className="w-9 h-9 rounded-full bg-surface-container-highest text-on-surface hover:text-on-surface hover:bg-surface-bright flex items-center justify-center transition-colors" title="List options" type="button">
                        <span className="material-symbols-outlined text-[18px]">more_vert
                        </span>
                      </button>
                    </div>
                  </div>
                  {/* Description / Notes Capsule */}
                  <div className="flex items-center gap-space-sm p-space-sm px-space-md rounded-DEFAULT bg-surface-container-low text-on-surface-variant font-body-sm text-body-sm">
                    <span className="material-symbols-outlined text-tertiary text-[18px] flex-shrink-0">graphic_eq
                    </span>
                    <span className="truncate">Long note releases, inverse shields, and release timing stability drills at 165–185 BPM.
                    </span>
                    <div className="ml-auto hidden sm:flex items-center gap-2 flex-shrink-0">
                      <span className="px-2 py-0.5 rounded-full bg-surface-container text-on-surface font-label-sm text-[10px] font-bold">165 – 185 BPM
                      </span>
                    </div>
                  </div>
                </div>
                {/* List Band 3: Weekend grind */}
                <div className="group relative flex flex-col gap-space-md p-space-lg rounded-DEFAULT bg-surface-container transition-all hover:bg-surface-container-high hover:shadow-[0_8px_32px_rgba(157,107,255,0.15)]">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-md">
                    {/* Left Header Segment with Overlapping Cover Art Discs */}
                    <div className="flex items-center gap-space-md min-w-0">
                      <div className="relative flex items-center flex-shrink-0 w-24 h-14">
                        <div className="absolute left-0 w-12 h-12 rounded-full overflow-hidden shadow-md bg-surface-container-highest z-10">
                          <img className="w-full h-full object-cover" data-alt="High energy Japanese speedcore rhythm game jacket artwork with fiery orange and deep violet electric arcs" src="https://lh3.googleusercontent.com/aida-public/AB6AXuA5494rO7xTGyhHPCFxFzGeo1RRWVUYvuPk_S5-gDOzDXGp59WD2OeaLHTmpAuKB7rpY7gtlRPX8ucdJ4HmLhkZxMWtSbiroArc_UCYD8J1sKCg7dnMOh0ZtknMeKkaCb9fuiVhDLtO6N1OFBqzGDdAfLT8yX0GzmKUxHK3ohhqZtZf4xwAveXpalxIjuddImGrH3y0nRXs1nLeBsL7hwf1mpFsaKro91BmxvO2lBZZZaCWD3NeMbbZ" />
                        </div>
                        <div className="absolute left-4 w-12 h-12 rounded-full overflow-hidden shadow-md bg-surface-container-highest z-20">
                          <img className="w-full h-full object-cover" data-alt="Intense J-rock anime osu! beatmap banner art featuring dynamic guitarist silhouette engulfed in pink and purple neon fire" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAjkzInOfWWSi3iCfEkZ9Mo0LSjW_kM6DTIJCNHiIC4ccG89K-KpgTqMTn8iFZs0t6ZWYw6DwVmQts6aw7tF3CeivW3IvUMgA2etEfoSqNvEDOcuMkU6VAFmEKtUhEjqB6dcFTzJEabVhbOODqjkGOL4-jTyj-cZxu7ZFicsSM8gy9F5mH4fRvJ5MgGAG1wMzeMo1Q_uOC-duzsrcIjYAyoGjZrkNLJLufx-L835XDPzdUHYC0CYfoA" />
                        </div>
                        <div className="absolute left-8 w-12 h-12 rounded-full overflow-hidden shadow-md bg-surface-container-highest z-30">
                          <img className="w-full h-full object-cover" data-alt="Traditional taiko drum beatmap jacket art illuminated with modern glowing cyberpunk neon rings and floating embers" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDKWFJdEOOkPdx8dtkNANPWlwE-zVnvZYEUgpPFCsigjVjN-LQ-7ljt8CzKCNWdKbX-z172RxS-Eq3QwXrIN7__p8hxT5nOHC0e8S8AFNvJBL550Zk8ZtG6gxiHdO-99Byldixj1fLg2WGYSMjoD7Ni7XQdSSYEwGfFz7gPy6rRjKh3WGdelnQDmzjl0-LSBZBziSv1x4sSdds_Js0amJ2pAI1N5VvBX49XwfZkuJd38PidIoygi_f-" />
                        </div>
                        <div className="absolute left-12 w-12 h-12 rounded-full overflow-hidden shadow-md bg-surface-container-highest z-40">
                          <img className="w-full h-full object-cover" data-alt="Speedy rhythm gaming visualization with hyper-detailed digital sound velocity needles in bright red and violet" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDt0pTwbZ2DXKskMuL7u0HxRTDJ6dyUZRcJVI2cwCX2SXQ1QiPlEDud9SHX6ENdeqc1OrIdxGhtT3oSU4uc4998gI1Mcr7AnzEot4hiQJoxD2usfXI7pGuoKTolK18cnYLQ8pDop8NExLp7sej4x3UPTy35tjv8B0BeCRAE6MpmVVzJgMllsdXA16POinfIBfaCi234eAvBzjjcdpR5UrVKmRKXoPIReqw3jA7c3KIaZN_8kQZwqcD0" />
                        </div>
                      </div>
                      {/* Title & Tags */}
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-space-sm flex-wrap">
                          <h2 className="font-headline-sm text-headline-sm text-on-surface truncate">Weekend grind
                          </h2>
                          <span className="px-2 py-0.5 rounded-full bg-surface-container-highest text-secondary font-label-sm text-[10px] uppercase font-bold tracking-wider">Stamina & Speed
                          </span>
                          <span className="font-label-sm text-[11px] text-on-surface-variant flex items-center gap-1">
                            <span className="material-symbols-outlined text-[13px] text-outline">schedule
                            </span>{' '}Updated 4 days ago{' '}
                          </span>
                        </div>
                        {/* Mode Badges & Beatmap Count */}
                        <div className="flex items-center gap-space-sm mt-1">
                          <span className="font-label-sm text-label-sm text-secondary font-bold">38 beatmaps
                          </span>
                          <span className="text-outline-variant font-label-sm text-label-sm">·
                          </span>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container-highest text-primary font-label-sm text-[11px]">
                              <span className="w-2 h-2 rounded-full bg-[#9D6BFF]">
                              </span>{' '}Mania (22){' '}
                            </span>
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container-highest text-secondary font-label-sm text-[11px]">
                              <span className="w-2 h-2 rounded-full bg-[#FF66AA]">
                              </span>{' '}Std (12){' '}
                            </span>
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container-highest text-[#FF5C39] font-label-sm text-[11px]">
                              <span className="w-2 h-2 rounded-full bg-[#FF5C39]">
                              </span>{' '}Taiko (4){' '}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                    {/* Action Cluster */}
                    <div className="flex items-center gap-space-xs flex-wrap md:flex-nowrap justify-end flex-shrink-0">
                      <button className="px-space-md py-2 rounded-full bg-primary text-on-primary font-label-md text-label-md font-semibold flex items-center gap-1.5 hover:bg-primary-fixed hover:text-on-primary-fixed shadow-[0_0_16px_rgba(210,187,255,0.3)] transition-all active:scale-95" type="button">
                        <span className="material-symbols-outlined text-[18px]">play_circle
                        </span>
                        <span>Play in osu!
                        </span>
                      </button>
                      <button className="w-9 h-9 rounded-full bg-surface-container-highest text-on-surface hover:text-tertiary hover:bg-surface-bright flex items-center justify-center transition-colors" title="Download all (.osz)" type="button">
                        <span className="material-symbols-outlined text-[18px]">download
                        </span>
                      </button>
                      <button className="w-9 h-9 rounded-full bg-surface-container-highest text-on-surface hover:text-primary hover:bg-surface-bright flex items-center justify-center transition-colors" title="Edit list" type="button">
                        <span className="material-symbols-outlined text-[18px]">edit
                        </span>
                      </button>
                      <button className="w-9 h-9 rounded-full bg-surface-container-highest text-on-surface hover:text-on-surface hover:bg-surface-bright flex items-center justify-center transition-colors" title="List options" type="button">
                        <span className="material-symbols-outlined text-[18px]">more_vert
                        </span>
                      </button>
                    </div>
                  </div>
                  {/* Description / Notes Capsule */}
                  <div className="flex items-center gap-space-sm p-space-sm px-space-md rounded-DEFAULT bg-surface-container-low text-on-surface-variant font-body-sm text-body-sm">
                    <span className="material-symbols-outlined text-secondary text-[18px] flex-shrink-0">bolt
                    </span>
                    <span className="truncate">High tempo stream stamina builder, 190–220 BPM speed runs and tournament warmups.
                    </span>
                    <div className="ml-auto hidden sm:flex items-center gap-2 flex-shrink-0">
                      <span className="px-2 py-0.5 rounded-full bg-surface-container text-on-surface font-label-sm text-[10px] font-bold">190 – 220 BPM
                      </span>
                    </div>
                  </div>
                </div>
                {/* Locked Guest Panel (Design State Demonstration) */}
                <div className="relative overflow-hidden rounded-DEFAULT bg-surface-container-low p-space-lg shadow-sm">
                  {/* Translucent Subtle Diagonal Hatch Pattern Overlay */}
                  <div className="absolute inset-0 opacity-15 pointer-events-none bg-[radial-gradient(#4a4454_1px,transparent_1px)] [background-size:12px_12px]">
                  </div>
                  <div className="relative flex flex-col md:flex-row items-center justify-between gap-space-lg">
                    <div className="flex items-start gap-space-md">
                      <div className="w-12 h-12 rounded-full bg-surface-container-highest text-outline flex items-center justify-center flex-shrink-0 shadow-inner">
                        <span className="material-symbols-outlined text-[24px]">lock
                        </span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-space-xs">
                          <span className="font-headline-sm text-headline-sm text-on-surface">Cloud syncing & unlimited custom lists
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant font-label-sm text-[10px]">Guest Mode Limit
                          </span>
                        </div>
                        <p className="font-body-md text-body-md text-on-surface-variant">{' '}Guests can't create permanent lists. Create a free account and your linked osu! profile comes with you.{' '}
                        </p>
                        <div className="flex flex-wrap items-center gap-space-sm mt-space-xs font-label-sm text-[11px] text-tertiary">
                          <span className="flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-tertiary">
                            </span>{' '}Saved cloud playlists
                          </span>
                          <span>•
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary">
                            </span>{' '}Auto-export to collection.db
                          </span>
                          <span>•
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-secondary">
                            </span>{' '}Cross-device progress sync
                          </span>
                        </div>
                      </div>
                    </div>
                    {/* Create Account CTA Button in osu! pink */}
                    <button className="group px-space-lg py-3 rounded-full bg-secondary text-on-secondary font-headline-sm text-label-md flex items-center gap-space-xs flex-shrink-0 shadow-[0_0_20px_rgba(255,176,204,0.35)] hover:shadow-[0_0_28px_rgba(255,176,204,0.6)] hover:brightness-105 active:scale-95 transition-all" type="button">
                      <span>Create account
                      </span>
                      <span className="material-symbols-outlined text-[18px] group-hover:translate-x-1 transition-transform">arrow_forward
                      </span>
                    </button>
                  </div>
                </div>
              </div>
              {/* Right Helper & Diagnostics Sidebar Panel */}
              <div className="xl:col-span-4 flex flex-col gap-space-md">
                {/* Collection Sync Status Card */}
                <div className="flex flex-col gap-space-md p-space-lg rounded-DEFAULT bg-surface-container shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-space-sm">
                      <span className="material-symbols-outlined text-primary text-[22px]">chevron_forward
                      </span>
                      <span className="font-headline-sm text-headline-sm text-on-surface">Client sync
                      </span>
                    </div>
                    <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-surface-container-highest text-[#7EE787] font-label-sm text-[11px] font-bold">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#7EE787] animate-pulse">
                      </span>{' '}active{' '}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1 p-space-sm rounded-DEFAULT bg-surface-container-low font-label-sm text-label-sm">
                    <span className="text-on-surface-variant font-label-sm text-[10px] uppercase tracking-wider">Target Database file
                    </span>
                    <span className="font-mono text-on-surface text-[12px] truncate select-all">D:\osu\collection.db
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-space-xs">
                    <div className="flex flex-col">
                      <span className="font-label-md text-label-md text-on-surface">Auto-sync changes
                      </span>
                      <span className="font-body-sm text-body-sm text-on-surface-variant">Syncs upon list modification
                      </span>
                    </div>
                    {/* Custom Toggle */}
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input checked className="sr-only peer" type="checkbox" />
                      <div className="w-11 h-6 bg-surface-container-highest peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary">
                      </div>
                    </label>
                  </div>
                  <div className="flex gap-space-xs pt-space-xs">
                    <button className="flex-1 py-2 rounded-full bg-surface-container-highest text-on-surface hover:text-primary hover:bg-surface-bright font-label-md text-label-md transition-all flex items-center justify-center gap-1" type="button">
                      <span className="material-symbols-outlined text-[16px]">file_download
                      </span>
                      <span>Export .osdb
                      </span>
                    </button>
                    <button className="px-space-md py-2 rounded-full bg-surface-container-highest text-on-surface hover:text-secondary hover:bg-surface-bright font-label-md text-label-md transition-all flex items-center justify-center" title="Rescan local files" type="button">
                      <span className="material-symbols-outlined text-[16px]">refresh
                      </span>
                    </button>
                  </div>
                </div>
                {/* Mode Distribution Visualization */}
                <div className="flex flex-col gap-space-md p-space-lg rounded-DEFAULT bg-surface-container shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-headline-sm text-headline-sm text-on-surface">Mode distribution
                    </span>
                    <span className="font-label-sm text-label-sm text-on-surface-variant">All lists
                    </span>
                  </div>
                  {/* Multi-segmented Progress Bar */}
                  <div className="flex flex-col gap-2">
                    <div className="w-full h-3.5 rounded-full overflow-hidden flex bg-surface-container-highest">
                      <div className="bg-primary hover:brightness-110 transition-all" style={{ width: "65%" }} title="Mania: 65%">
                      </div>
                      <div className="bg-secondary hover:brightness-110 transition-all" style={{ width: "25%" }} title="Standard: 25%">
                      </div>
                      <div className="bg-[#FF5C39] hover:brightness-110 transition-all" style={{ width: "10%" }} title="Taiko: 10%">
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 pt-1 font-label-sm text-label-sm">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-primary">
                          </span>
                          <span className="text-on-surface-variant font-bold">Mania
                          </span>
                        </div>
                        <span className="font-headline-sm text-[16px] text-primary font-bold">65%
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-secondary">
                          </span>
                          <span className="text-on-surface-variant font-bold">Standard
                          </span>
                        </div>
                        <span className="font-headline-sm text-[16px] text-secondary font-bold">25%
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-[#FF5C39]">
                          </span>
                          <span className="text-on-surface-variant font-bold">Taiko
                          </span>
                        </div>
                        <span className="font-headline-sm text-[16px] text-[#FF5C39] font-bold">10%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                {/* Pro Tip Card */}
                <div className="relative overflow-hidden flex flex-col gap-space-xs p-space-md rounded-DEFAULT bg-surface-container-low shadow-sm">
                  <div className="flex items-center gap-space-sm text-primary">
                    <span className="material-symbols-outlined text-[20px]">lightbulb
                    </span>
                    <span className="font-label-md text-label-md uppercase tracking-wider font-bold">Pro tip
                    </span>
                  </div>
                  <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">{' '}In the{' '}
                    <span className="text-primary font-semibold">Recommendations
                    </span>{' '}and{' '}
                    <span className="text-tertiary font-semibold">Mirror
                    </span>{' '}pages, click the bookmark icon on any beatmap card or row to instantly route it into these practice collections.{' '}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </ExampleBlock>
    </AppShell>
  )
}
