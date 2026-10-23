import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Supabase client — created only when the VITE_ env vars are present.
 * When they are absent the app runs in demo mode: `supabase` is null,
 * `isSupabaseConfigured` is false, and nothing may crash.
 * (Setup: see docs/M1-SETUP.md. The anon key is public-safe; the
 * service-role key and the osu! client secret never go in frontend env.)
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isSupabaseConfigured: boolean = Boolean(url && anonKey)

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url as string, anonKey as string)
  : null

export function getSupabaseConfig(): { url: string | null; anonKey: string | null } {
  return { url: url ?? null, anonKey: anonKey ?? null }
}
