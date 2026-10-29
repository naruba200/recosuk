-- RecOsuk batch 15, Phase A — osu! user-token storage.
--
-- Run this ONCE, after 001_init.sql, in the Supabase SQL Editor.
-- (Edge Functions run with --no-verify-jwt, so the table is only ever
-- touched by the service-role client inside osu-proxy; the browser
-- never sees a token value. RLS is enabled with owner-only policies
-- as defence in depth — the service role bypasses RLS.)
--
-- Tokens are stored ENCRYPTED (AES-GCM, key = the OSU_TOKEN_ENCRYPTION_KEY
-- Edge Function secret). Only the encrypted blobs live here; plaintext
-- tokens exist only in Edge Function memory during a request.

create table public.osu_user_tokens (
  user_id uuid primary key references auth.users (id) on delete cascade,
  access_token_enc text not null,
  refresh_token_enc text not null,
  expires_at timestamptz not null,
  osu_user_id bigint,
  osu_username text,
  obtained_at timestamptz not null default now()
);

alter table public.osu_user_tokens enable row level security;

-- Owner-only policies (authenticated role only, no anon access).
create policy "osu_user_tokens: select own" on public.osu_user_tokens
  for select to authenticated using (auth.uid() = user_id);

create policy "osu_user_tokens: insert own" on public.osu_user_tokens
  for insert to authenticated with check (auth.uid() = user_id);

create policy "osu_user_tokens: update own" on public.osu_user_tokens
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "osu_user_tokens: delete own" on public.osu_user_tokens
  for delete to authenticated using (auth.uid() = user_id);
