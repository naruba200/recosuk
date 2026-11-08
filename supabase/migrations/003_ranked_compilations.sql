-- RecOsuk — ranked compilation cache (§AN)
-- Paste this whole file into the Supabase SQL Editor and Run it once.
-- Run it exactly once: a second run fails on the already-existing
-- table, which is expected — not an error to fix.
--
-- WHY THIS TABLE EXISTS: the Collections ranked section used to
-- live-compile one top-50 list per window from osu! search on
-- every visit. The §AN card view needs 4 lists (month view) or 12
-- (year view) per visit — live-compiling all of those on every
-- page load is too slow. Compiled lists are stored here instead:
-- the page reads a card's row first and only compiles live when
-- the row is missing or stale (week 1h, month 6h, year 24h),
-- then stores the fresh result for the next visit.
--
-- SHARED CACHE, NOT USER DATA: rows are keyed by mode +
-- granularity + period, not by user — every visitor reads the
-- same rows. Any SIGNED-IN user may refresh a stale row (that is
-- the point: the first account user to open a stale card
-- recompiles it for everyone). Guests can read but cannot write
-- (they have no auth user); a guest opening a stale/missing card
-- still gets the live-compiled list, it just is not stored.
-- No service-role / Edge Function involvement: the app's anon
-- client does the reads and the authed upserts directly.

-- ---------------------------------------------------------------------------
-- ranked_compilations — one row per mode + granularity + period
-- ---------------------------------------------------------------------------
create table public.ranked_compilations (
  mode text not null check (mode in ('osu', 'taiko', 'fruits', 'mania')),
  granularity text not null check (granularity in ('week', 'month', 'year')),
  -- 'current' for the rolling week, 'YYYY-MM-wN' for a month week,
  -- 'YYYY-MM' for a year month.
  period text not null,
  -- The compiled top-50 entries (RankedEntry[]: candidate + rank +
  -- rankedDate), exactly as the client renders them.
  entries jsonb not null default '[]'::jsonb,
  -- True when the scan hit the 20-page cap before reaching the
  -- interval start: the list may be incomplete (shown as partial).
  partial boolean not null default false,
  -- Search sets examined (diagnostics only).
  scanned int not null default 0,
  -- Inclusive interval start, ISO string (window membership proof).
  window_start timestamptz,
  compiled_at timestamptz not null default now(),
  primary key (mode, granularity, period)
);

create index ranked_compilations_compiled_idx
  on public.ranked_compilations (compiled_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.ranked_compilations enable row level security;

-- Anyone (anon + authenticated) may read the cache.
create policy "ranked_compilations: select for all" on public.ranked_compilations
  for select using (true);

-- Only signed-in users may insert/refresh rows (upserts need the
-- update policy too). Guests have no auth user, so their writes
-- are refused by RLS and the app falls back to a live compile.
create policy "ranked_compilations: insert for signed-in users" on public.ranked_compilations
  for insert with check (auth.uid() is not null);
create policy "ranked_compilations: update for signed-in users" on public.ranked_compilations
  for update using (auth.uid() is not null) with check (auth.uid() is not null);

-- No delete policy for clients: stale rows are overwritten by
-- upsert, never deleted from the app.
