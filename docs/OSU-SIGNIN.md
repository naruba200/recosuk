# RecOsuk — osu! sign-in (Phase A, batch 15)

The official osu! download endpoint needs a **user** OAuth token
("only lazer clients" — the guest client-credentials token RecOsuk
uses for public data cannot download). Phase A builds the sign-in,
the encrypted token storage, and a cheap **header-only probe** that
proves a user token is accepted for downloads. **Phase B (streaming
the .osz into the browser) is gated on the probe passing live** — if
osu! refuses third-party user tokens, Phase B must not be built.

## What the user sees

Settings → **osu! account connection** (SECTION 1: ACCOUNT):

- **Disconnected:** a **Sign in with osu!** button + the honest line
  "Needed for in-page official downloads; mirrors keep working
  without it."
- **Connected:** the osu! username, the token expiry, a **Disconnect**
  button, and a **Test official download** button showing the probe
  result verbatim (PASS/FAIL + status/headers for the full and
  no-video variants).
- **Expired:** a **Reconnect** button.
- **Guests:** the row is locked with the account prompt (same
  LockedButton pattern as M5). No guest token storage, no anonymous
  auth.

## Setup — 4 steps, in order

### 1. Run migration 002

Supabase Dashboard → **SQL Editor** → **New query** → paste the whole
of `supabase/migrations/002_osu_tokens.sql` → **Run**.

This creates `public.osu_user_tokens` (one row per RecOsuk account:
encrypted access/refresh tokens, expiry, osu! user id + username).
RLS is enabled with owner-only policies as defence in depth; the
Edge Function reads/writes it with the service-role client, which
bypasses RLS. The browser can never read this table's contents
through the app.

### 2. Set the encryption secret

Generate a 256-bit key and set it as an Edge Function secret:

```bash
openssl rand -base64 32
supabase secrets set OSU_TOKEN_ENCRYPTION_KEY=<output of the command above>
```

(Dashboard alternative: Edge Functions → Secrets → add
`OSU_TOKEN_ENCRYPTION_KEY` with the generated value.)

Tokens are encrypted with AES-GCM; a fresh random IV is prepended to
each value. If this secret is missing, the auth actions return an
explicit 500 naming it. **If you ever change this secret, every
stored connection stops decrypting** — users just sign in again
(the row is deleted and the UI prompts a re-sign-in); nothing else
breaks.

### 3. Register BOTH redirect URIs in the osu! OAuth app

osu.ppy.sh → your account → **Account Settings → OAuth** → edit the
`RecOsuk` application → add both callback URLs:

```
https://<your-vercel-domain>/auth/osu/callback
http://localhost:5173/auth/osu/callback
```

- The first is your deployed site's origin (whatever domain the app
  actually runs on). The app displays the exact URI for its current
  origin, copyable, in Settings → osu! account connection — copy it
  from there rather than typing it.
- The second is for local dev (`npm run dev`); adjust the port if
  your dev server uses another one.
- A redirect URI that isn't registered is the **#1 cause of sign-in
  failure**: osu! rejects the code exchange, and the error message
  says so.

### 4. Redeploy the function

From the repo root (same command as M1 setup):

```bash
supabase functions deploy osu-proxy --no-verify-jwt
```

One deploy sticks until the function source changes. The new actions
(`getOsuAuthorizeUrl`, `exchangeOsuCode`, `osuAuthStatus`,
`disconnectOsu`, `probeOsuDownload`) only exist after this deploy —
before it, the Connect button errors honestly instead of silently
doing nothing.

## Scopes — what is requested and why

`identify public`, nothing else:

- `identify` — who the signed-in user is (needed to confirm the
  token belongs to them and to show their name).
- `public` — public profile data (the same data the guest token
  already reads; here it identifies the account at exchange time).

No profile edits, no scores submission, no chat, no friends. The
token **cannot act as the user** beyond what these scopes allow, and
RecOsuk never uses it for anything but the download endpoint (Phase
B) and the one `/me` lookup at exchange time.

## What is stored, and where

| Item | Where | Who can read it |
|---|---|---|
| osu! access + refresh tokens, AES-GCM encrypted | `osu_user_tokens` table (Supabase Postgres) | Only the Edge Function, via the service-role key |
| osu! user id + username (from `/me` at exchange) | Same row | Same (returned to the browser as a name only) |
| Token expiry | Same row | Same (returned as an expiry timestamp) |
| The encryption key | `OSU_TOKEN_ENCRYPTION_KEY` Edge Function secret | Only the Edge Function runtime |
| The `state` value | The browser's `sessionStorage`, single-use | The callback page, once |

**Never stored:** the osu! password (RecOsuk never sees it — the
password is typed only on osu.ppy.sh), any token value in the
browser (localStorage / cookies / JS variables), or tokens in logs.

The token refreshes automatically inside the Edge Function when it
is expired (60s leeway). If the refresh token is rejected, the row
is deleted and the UI prompts a re-sign-in.

## Disconnect / revoke

- **Disconnect button** (Settings): deletes the stored row immediately.
  The download probe and any Phase B download stop working until the
  user signs in again.
- **Revoke the grant entirely:** osu.ppy.sh → Account Settings →
  OAuth → find `RecOsuk` → revoke. This kills the refresh token at
  osu!'s end; the next probe/refresh deletes the local row too.

## The probe — what PASS and FAIL mean

Settings → **Test official download** (connected users only) probes
`https://osu.ppy.sh/beatmapsets/1/download` (and the `?noVideo=1`
variant) with the stored user token, reading **only status +
headers** and cancelling the body — no bytes are downloaded, and no
bytes are ever streamed to the browser in Phase A.

- **PASS** = HTTP 200 + an archive content-type
  (`application/octet-stream` / `application/zip`) + an `attachment`
  content-disposition. osu! accepted the user token for downloads.
- **FAIL** = anything else, shown with the exact status/headers:
  `401`/`403` = osu! refused the token; `200` + `text/html` = a
  redirect to the login page (the token wasn't accepted); `404` =
  the probe beatmapset id is gone (re-probe with another id — a 404
  is not an auth failure).

**Phase-B gate: the probe must PASS live before in-page official
downloads are built.** If it FAILs with 401/403, osu! does not accept
third-party user tokens for this endpoint, and the tab-first official
download + mirrors remain the way official files are fetched.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| "osu! rejected the redirect URI" | URI not registered in the osu! OAuth app | Step 3 — copy the exact URI from Settings |
| "Security check failed" on the callback page | `state` mismatch (stale tab, storage blocked, page refreshed) | Try signing in again from Settings |
| "This sign-in code was already used" | Double-submit / refreshed callback page | Try signing in again (codes are single-use) |
| Status shows "connected (name unknown)" | The `/me` lookup failed at exchange time | Harmless — the connection works; the name just wasn't fetched |
| 500 naming `OSU_TOKEN_ENCRYPTION_KEY` | Secret not set | Step 2, then redeploy |
| 400 naming an unknown action | Old function deployed | Step 4 — redeploy |
| Probe FAILs 401/403 | osu! refuses the token | Phase B is off the table; mirrors + tab-first official stay |
