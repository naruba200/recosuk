import AppShell from '../components/AppShell'
import LoadingState from '../components/LoadingState'
import { useAuth } from '../lib/auth'
import { MODE_LABELS } from '../lib/mode'
import { useModeStore } from '../lib/modeStore'
import { useProfileData } from '../lib/profileService'
import LoadErrorPanel from '../components/LoadErrorPanel'
import { DashboardReal } from './Dashboard'
import { StatsReal } from './Stats'

/**
 * Profile (§AN): Dashboard + Stats merged on one page — the
 * Dashboard sections on top, the Stats sections below. Same
 * real data, same loading states, no redesign; a failed load
 * shows an honest error panel with Retry, never sample data.
 */
export default function Profile() {
  const mode = useModeStore((s) => s.mode)
  const { tier } = useAuth()
  const { status, data, error, identity, refresh } = useProfileData(mode)

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

  if (status === 'error' || !data) {
    return (
      <AppShell
        identity={{
          username: identity?.username ?? 'No linked profile',
          pp: null,
          tierLabel: tier === 'account' ? 'account' : tier === 'guest' ? 'guest' : 'free tier',
        }}
      >
        <div className="flex flex-col w-full gap-space-xl">
          <LoadErrorPanel
            message={error}
            onRetry={refresh}
            noProfile={!identity?.username}
          />
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
