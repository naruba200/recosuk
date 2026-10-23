import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Session, SupabaseClient, User } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from './supabase'
import { getGuestSession, useGuestStore, type GuestSession } from './guestStore'
import type { AuthTier } from './capabilities'

/**
 * Auth state for the whole app (PLAN-v2 §6).
 *
 * tier = 'account' when a Supabase user is signed in;
 *        'guest'   when only a guest osu! link exists (local store);
 *        'none'    otherwise.
 *
 * When Supabase is not configured the app is in demo mode: there is never
 * a user, and signUp/signIn resolve with { error: 'not-configured' }
 * instead of throwing.
 */
export const NOT_CONFIGURED = 'not-configured' as const

export interface AuthResult {
  /** null on success; 'not-configured' in demo mode; otherwise a message. */
  error: typeof NOT_CONFIGURED | string | null
}

interface AuthContextValue {
  user: User | null
  session: Session | null
  loading: boolean
  tier: AuthTier
  /** The linked guest session, if one exists (drives conversion + UI). */
  guestSession: GuestSession | null
  configured: boolean
  signUp: (email: string, password: string) => Promise<AuthResult>
  signIn: (email: string, password: string) => Promise<AuthResult>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

/**
 * Guest → account conversion (PLAN-v2 §6): when someone who linked as a
 * guest signs in, carry their osu! identity into their profiles row so
 * nothing they generated is lost. Best-effort — failures are swallowed
 * (the row is also created by the handle_new_user trigger; this upsert
 * just fills in the osu! fields).
 */
export async function convertGuestToProfile(
  client: SupabaseClient,
  userId: string,
  guest: GuestSession,
): Promise<void> {
  await client.from('profiles').upsert(
    {
      id: userId,
      osu_username: guest.osuUsername,
      osu_user_id: guest.osuUserId,
      selected_mode: guest.selectedMode,
    },
    { onConflict: 'id' },
  )
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState<boolean>(isSupabaseConfigured)
  const guestSession = useGuestStore((s) => s.session)
  const convertedForRef = useRef<string | null>(null)

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      setUser(data.session?.user ?? null)
      setLoading(false)
    })
    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession)
        setUser(nextSession?.user ?? null)
        setLoading(false)
      },
    )
    return () => {
      active = false
      subscription.subscription.unsubscribe()
    }
  }, [])

  // Guest → account conversion, once per signed-in user.
  useEffect(() => {
    if (!supabase || !user) return
    const guest = getGuestSession()
    if (!guest) return
    if (convertedForRef.current === user.id) return
    convertedForRef.current = user.id
    convertGuestToProfile(supabase, user.id, guest).catch(() => {
      // Best-effort: the profiles row exists via trigger either way.
    })
  }, [user])

  const signUp = useCallback(
    async (email: string, password: string): Promise<AuthResult> => {
      if (!supabase) return { error: NOT_CONFIGURED }
      const { error } = await supabase.auth.signUp({ email, password })
      return { error: error ? error.message : null }
    },
    [],
  )

  const signIn = useCallback(
    async (email: string, password: string): Promise<AuthResult> => {
      if (!supabase) return { error: NOT_CONFIGURED }
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      return { error: error ? error.message : null }
    },
    [],
  )

  const signOut = useCallback(async (): Promise<void> => {
    if (!supabase) return
    await supabase.auth.signOut()
  }, [])

  const tier: AuthTier = user ? 'account' : guestSession ? 'guest' : 'none'

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      loading,
      tier,
      guestSession,
      configured: isSupabaseConfigured,
      signUp,
      signIn,
      signOut,
    }),
    [user, session, loading, tier, guestSession, signUp, signIn, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
