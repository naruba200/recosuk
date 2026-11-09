import AppShell from '../components/AppShell'
import LoadingState from '../components/LoadingState'
import { useAuth } from '../lib/auth'
import { MODE_LABELS } from '../lib/mode'
import { useModeStore } from '../lib/modeStore'
import { useProfileData } from '../lib/profileService'
import { DashboardDemoContent, DashboardReal, DEMO_IDENTITY } from './Dashboard'
import { StatsDemoContent, StatsReal } from './Stats'

/**
 * Profile (§AN): Dashboard + Stats merged on one page — the
 * Dashboard sections on top, the Stats sections below. Same
 * real data, same loading states, no redesign; the demo state
 * shows both demos' sample content under one shell.
 */
export default function Profile() {
  const mode = useModeStore((s) => s.mode)
  const { tier } = useAuth()
  const { status, data, identity, refresh } = useProfileData(mode)

  if (status === 'loading') {
    return (
      <AppShell
        identity={{
          username: identity?.username ?? 'Loading…',
          pp: null,
          tierLabel: tier === 'account' ? 'account' : tier === 'guest' ? 'guest' : 'free tier',
        }}
      >
        <LoadingState label={`Loading your ${MODE_LABELS[mode]} profile from osu!…`} />
      </AppShell>
    )
  }

  if (status === 'demo' || status === 'error' || !data) {
    return (
      <AppShell identity={DEMO_IDENTITY}>
        <div className="flex flex-col w-full gap-space-xl">
          <DashboardDemoContent />
          <StatsDemoContent />
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell
      identity={{
        username: data.user.username,
        pp: data.skillProfile.pp,
        countryCode: data.user.country_code,
        avatarUrl: `https://a.ppy.sh/${data.user.id}`,
        tierLabel: tier === 'account' ? 'account' : 'guest',
      }}
    >
      <div className="flex flex-col w-full gap-space-xl">
        <DashboardReal data={data} onRefresh={refresh} />
        <StatsReal data={data} />
      </div>
    </AppShell>
  )
}
