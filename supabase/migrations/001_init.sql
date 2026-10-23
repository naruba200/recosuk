-- RecOsuk — initial schema (M1)
-- Paste this whole file into the Supabase SQL Editor and Run it once.
-- Safe to run on a fresh project. Creates tables, indexes, RLS policies,
-- and the trigger that gives every new auth user a profiles row.

-- ---------------------------------------------------------------------------
-- profiles — one row per RecOsuk account, holds the linked osu! identity
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  osu_username text,
  osu_user_id bigint,
  selected_mode text not null default 'osu'
    check (selected_mode in ('osu', 'taiko', 'fruits', 'mania')),
  skill_profiles jsonb not null default '{}'::jsonb,
  feed_sessions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- stat_snapshots — one row per profile refresh (account tier only)
-- ---------------------------------------------------------------------------
create table public.stat_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  mode text not null check (mode in ('osu', 'taiko', 'fruits', 'mania')),
  pp numeric,
  global_rank int,
  accuracy numeric,
  skill_profile jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- lists + list_items — user-curated beatmap collections
-- ---------------------------------------------------------------------------
create table public.lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  is_public boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.lists (id) on delete cascade,
  beatmapset_id int not null,
  beatmap_id int,
  mode text check (mode in ('osu', 'taiko', 'fruits', 'mania')),
  added_at timestamptz not null default now(),
  unique (list_id, beatmapset_id)
);

-- ---------------------------------------------------------------------------
-- map_feedback — tried/skipped status + 1–5 rating per user per beatmap
-- (drives the learning loop in M3+)
-- ---------------------------------------------------------------------------
create table public.map_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  beatmap_id int not null,
  beatmapset_id int,
  mode text check (mode in ('osu', 'taiko', 'fruits', 'mania')),
  status text not null check (status in ('tried', 'skipped')),
  rating int check (rating between 1 and 5),
  created_at timestamptz not null default now(),
  unique (user_id, beatmap_id)
);

-- ---------------------------------------------------------------------------
-- beatmap_cache — osu-proxy response cache for beatmap lookups.
-- Written by the service role (Edge Function) only; clients may read.
-- ---------------------------------------------------------------------------
create table public.beatmap_cache (
  beatmap_id bigint primary key,
  data jsonb not null,
  fetched_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- download_history — dedupe source for recommendations (account tier)
-- ---------------------------------------------------------------------------
create table public.download_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  beatmapset_id int not null,
  mirror_used text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index stat_snapshots_user_id_idx on public.stat_snapshots (user_id);
create index stat_snapshots_user_mode_created_idx
  on public.stat_snapshots (user_id, mode, created_at desc);
create index lists_user_id_idx on public.lists (user_id);
create index list_items_list_id_idx on public.list_items (list_id);
create index map_feedback_user_id_idx on public.map_feedback (user_id);
create index download_history_user_id_idx on public.download_history (user_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- Users can only touch their own rows. Guests have no auth user at all,
-- so there is simply no row they can write to — gating is structural.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.stat_snapshots enable row level security;
alter table public.lists enable row level security;
alter table public.list_items enable row level security;
alter table public.map_feedback enable row level security;
alter table public.beatmap_cache enable row level security;
alter table public.download_history enable row level security;

-- profiles: own row only
create policy "profiles: select own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles: insert own" on public.profiles
  for insert with check (auth.uid() = id);
create policy "profiles: update own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "profiles: delete own" on public.profiles
  for delete using (auth.uid() = id);

-- stat_snapshots: own rows only
create policy "stat_snapshots: select own" on public.stat_snapshots
  for select using (auth.uid() = user_id);
create policy "stat_snapshots: insert own" on public.stat_snapshots
  for insert with check (auth.uid() = user_id);
create policy "stat_snapshots: update own" on public.stat_snapshots
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "stat_snapshots: delete own" on public.stat_snapshots
  for delete using (auth.uid() = user_id);

-- lists: own rows, plus anyone may read a list marked public
create policy "lists: select own or public" on public.lists
  for select using (auth.uid() = user_id or is_public);
create policy "lists: insert own" on public.lists
  for insert with check (auth.uid() = user_id);
create policy "lists: update own" on public.lists
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "lists: delete own" on public.lists
  for delete using (auth.uid() = user_id);

-- list_items: follow the parent list (own lists fully; public lists readable)
create policy "list_items: select via list" on public.list_items
  for select using (
    exists (
      select 1 from public.lists l
      where l.id = list_id and (l.user_id = auth.uid() or l.is_public)
    )
  );
create policy "list_items: insert via own list" on public.list_items
  for insert with check (
    exists (
      select 1 from public.lists l
      where l.id = list_id and l.user_id = auth.uid()
    )
  );
create policy "list_items: update via own list" on public.list_items
  for update using (
    exists (
      select 1 from public.lists l
      where l.id = list_id and l.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.lists l
      where l.id = list_id and l.user_id = auth.uid()
    )
  );
create policy "list_items: delete via own list" on public.list_items
  for delete using (
    exists (
      select 1 from public.lists l
      where l.id = list_id and l.user_id = auth.uid()
    )
  );

-- map_feedback: own rows only
create policy "map_feedback: select own" on public.map_feedback
  for select using (auth.uid() = user_id);
create policy "map_feedback: insert own" on public.map_feedback
  for insert with check (auth.uid() = user_id);
create policy "map_feedback: update own" on public.map_feedback
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "map_feedback: delete own" on public.map_feedback
  for delete using (auth.uid() = user_id);

-- download_history: own rows only
create policy "download_history: select own" on public.download_history
  for select using (auth.uid() = user_id);
create policy "download_history: insert own" on public.download_history
  for insert with check (auth.uid() = user_id);
create policy "download_history: update own" on public.download_history
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "download_history: delete own" on public.download_history
  for delete using (auth.uid() = user_id);

-- beatmap_cache: readable by anyone (anon + authenticated);
-- NO insert/update/delete policies for clients — only the service role
-- (Edge Function) can write, and the service role bypasses RLS.
create policy "beatmap_cache: select for all" on public.beatmap_cache
  for select using (true);

-- ---------------------------------------------------------------------------
-- New-user trigger: every auth user gets an empty profiles row.
-- Standard Supabase pattern (security definer so it can write past RLS).
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep profiles.updated_at fresh on update.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();
