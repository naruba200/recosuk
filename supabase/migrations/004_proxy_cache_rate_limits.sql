-- RecOsuk batch AP — proxy cache + rate limits + snapshot throttle.
--
-- RUN ONCE in the Supabase dashboard: SQL editor → paste this whole
-- file → Run. Then redeploy the function:
--   supabase functions deploy osu-proxy --no-verify-jwt
--
-- What this adds:
--   1. proxy_cache — shared server cache for the osu! proxy (searches,
--      beatmapset summaries, .osu files, PP inputs). Read/written by
--      the Edge Function with its service-role key only; RLS enabled
--      with NO policies, so no browser client can read or write it.
--   2. proxy_rate_limits + check_proxy_rate_limit() — the atomic
--      rate limiter for the proxy (60/min per signed-in user,
--      10/min per guest IP). One statement, so it survives across
--      Edge Function instances (in-memory counters cannot).
--   3. A snapshot throttle on stat_snapshots: at most one snapshot
--      per user per mode per hour. The client pre-checks too, but
--      the trigger is the real enforcement.
--
-- SAFE TO RUN BEFORE THE FUNCTION REDEPLOY: the new function code
-- fails open (allows the request, logs a warning) when these tables
-- do not exist yet, and starts enforcing/caching once they land.
-- Re-running this file is safe (IF NOT EXISTS / OR REPLACE).

-- ---------------------------------------------------------------------------
-- 1. proxy_cache — the shared (L2) cache for the osu! proxy.
--    key: the same string as the in-memory cache key, e.g.
--      "GET /users/sora_playz/osu", "GET osu-file 1234567"
--    body: the upstream JSON body (or the { beatmapId, osuFile }
--      object for .osu files), stored as jsonb.
--    expires_at: absolute expiry; the function only reads rows
--      whose expires_at is in the future and deletes expired rows
--      opportunistically on writes (once a minute per instance).
--    Bodies over 1 MB are never stored (the function enforces this),
--    so this table cannot fill the 500 MB free-tier database with
--    single files.
-- ---------------------------------------------------------------------------
create table if not exists public.proxy_cache (
  key text primary key,
  body jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.proxy_cache enable row level security;
-- No policies: service-role only. (RLS is enabled so a leaked anon
-- key can never read or write cached proxy responses.)

create index if not exists proxy_cache_expires_at_idx
  on public.proxy_cache (expires_at);

-- ---------------------------------------------------------------------------
-- 2. proxy_rate_limits — one row per rate-limit bucket.
--    key: "user:<uuid>" (signed-in, 60/min) or "ip:<sha256>" (guest,
--      10/min). IPs are stored as SHA-256 hashes, never raw.
--    window_start: start of the current 60-second window.
--    count: calls made in this window.
-- ---------------------------------------------------------------------------
create table if not exists public.proxy_rate_limits (
  key text primary key,
  window_start timestamptz not null,
  count int not null default 0
);
alter table public.proxy_rate_limits enable row level security;
-- No policies: service-role only, same as proxy_cache.

-- check_proxy_rate_limit(p_key, p_limit): atomically counts one call
-- against the 60-second window for p_key and reports whether the
-- caller is still inside p_limit. A single INSERT ... ON CONFLICT
-- statement, so concurrent calls from different Edge Function
-- instances cannot both slip under the limit.
--   returns: (allowed boolean, retry_after_seconds numeric)
--     allowed = true  → the call counts, proceed.
--     allowed = false → retry_after_seconds is how many seconds
--       remain in the window (the function returns this as a 429
--       with a Retry-After header).
-- SECURITY INVOKER (runs as the caller — the service-role client —
-- not as the table owner), and public access is revoked: only the
-- function may call it.
create or replace function public.check_proxy_rate_limit(
  p_key text,
  p_limit int
)
returns table (allowed boolean, retry_after_seconds numeric)
language sql
security invoker
as $$
  -- One atomic upsert: concurrent calls for the same key serialize
  -- on the row lock, so the count is exact and the function always
  -- returns exactly one row. A stale window (older than 60s)
  -- restarts at count 1; a live window increments.
  with upserted as (
    insert into public.proxy_rate_limits (key, window_start, count)
    values (p_key, now(), 1)
    on conflict (key) do update
      set window_start = case
            when public.proxy_rate_limits.window_start > now() - interval '60 seconds'
              then public.proxy_rate_limits.window_start
            else now()
          end,
          count = case
            when public.proxy_rate_limits.window_start > now() - interval '60 seconds'
              then public.proxy_rate_limits.count + 1
            else 1
          end
    returning window_start, count
  )
  select
    count <= p_limit as allowed,
    case
      when count <= p_limit then 0
      else greatest(0, extract(epoch from (window_start + interval '60 seconds' - now())))
    end as retry_after_seconds
  from upserted
$$;

revoke all on function public.check_proxy_rate_limit(text, int) from public;
grant execute on function public.check_proxy_rate_limit(text, int) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Snapshot throttle: at most one stat snapshot per user per mode
--    per hour. The client (profileService.persistProfile) pre-checks
--    and skips the insert, but this trigger is the real enforcement —
--    it rejects anything that slips through, including a second
--    client writing directly. A rejected insert surfaces as a
--    database error the client already swallows (best-effort).
-- ---------------------------------------------------------------------------
create or replace function public.enforce_snapshot_throttle()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1
    from public.stat_snapshots
    where user_id = new.user_id
      and mode = new.mode
      and created_at > now() - interval '1 hour'
  ) then
    raise exception 'snapshot_throttle: at most one snapshot per user per mode per hour'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists stat_snapshots_throttle on public.stat_snapshots;
create trigger stat_snapshots_throttle
  before insert on public.stat_snapshots
  for each row
  execute function public.enforce_snapshot_throttle();
