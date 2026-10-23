# RecOsuk M1 — one-time setup

The M1 code is finished, but RecOsuk talks to **your own** Supabase project
and **your own** osu! OAuth app, and only you can create those (they're tied
to your accounts). This is a one-time, ~10-minute job. Until you do it, the
app runs in **demo mode**: every screen works with the sora_playz sample
data, but no account can be created and no osu! username is really checked.

You need: a GitHub/Google/email account for Supabase, and your osu! account.

---

## 1. Create the Supabase project

1. Go to [supabase.com](https://supabase.com) → **Start your project** → sign in.
2. **New project**: pick your organisation, name it `recosuk`, set a database
   password (save it in your password manager — you won't need it day-to-day),
   region: **Singapore** (closest to Vietnam), plan: Free.
3. Wait ~2 minutes while it provisions.

## 2. Create the database tables

1. In your project: left sidebar → **SQL Editor** → **New query**.
2. Open `supabase/migrations/001_init.sql` from this repo, copy the **whole
   file**, paste it into the editor.
3. Click **Run**. You should get "Success. No rows returned."
   (This creates profiles, stat_snapshots, lists, list_items, map_feedback,
   beatmap_cache, download_history, all Row Level Security policies, and the
   trigger that gives each new user a profile row.)

## 3. Create the osu! OAuth app

1. Go to [osu.ppy.sh/home/account/edit#oauth](https://osu.ppy.sh/home/account/edit#oauth)
   (sign in to osu! first).
2. **New OAuth Application**: name it `RecOsuk`. No callback URL is needed —
   RecOsuk uses the *client credentials* grant, which only reads public
   data, so leave the callback field blank / remove it if the form insists
   on a placeholder you can delete afterwards.
3. Save, then note the **Client ID** (a number) and **Client Secret**
   (a long string). Treat the secret like a password — it only ever goes
   into Supabase (step 4), never into this repo or any `.env` in the app.

## 4. Give the secrets to the Edge Function

Pick **one** of the two ways:

**Dashboard way (no CLI):**
Project → **Edge Functions** → **Secrets** (or Settings → Edge Functions):
add two secrets —
- `OSU_CLIENT_ID` = your client ID from step 3
- `OSU_CLIENT_SECRET` = your client secret from step 3

(Supabase's own `SUPABASE_URL` / `SUPABASE_ANON_KEY` / service-role secrets
already exist in every function automatically — don't touch those.)

## 5. Deploy the osu-proxy function

This one step needs the Supabase CLI
([install it](https://supabase.com/docs/guides/cli/getting-started) —
on Windows: `scoop install supabase` or download the `.exe` from the docs).

From the repo root:

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase functions deploy osu-proxy --no-verify-jwt
```

- `<your-project-ref>` is the string in your project URL:
  `https://supabase.com/dashboard/project/<project-ref>` — and also in the
  API URL you copy in step 6 (`https://<project-ref>.supabase.co`).
- If you used the dashboard way in step 4, you're done with secrets.
  CLI alternative: `supabase secrets set OSU_CLIENT_ID=... OSU_CLIENT_SECRET=...`
- **Why `--no-verify-jwt`?** The guest tier has no Supabase account, so it
  has no user JWT to verify — but it still needs the proxy to read public
  osu! profiles. The function only ever returns public data, requests are
  throttled inside it, and the secret never leaves it, so this is safe.
  (Requests still carry the anon key as a header.)

## 6. Connect the app

1. In Supabase: **Settings → API** — copy the **Project URL** and the
   **anon public** key.
2. In the repo: copy `.env.example` to `.env` and fill in:

   ```
   VITE_SUPABASE_URL=https://<project-ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon public key>
   ```

   `.env` is git-ignored. **Never** paste the service-role key or the osu!
   secret here — the frontend only ever gets the URL + anon key.
3. Restart `npm run dev` (env vars are read at startup).

## 7. Verify it works

1. `npm run dev`, open the app.
2. **Account path:** Create account (any email + password) → you should land
   on the link screen with no "Demo mode" note → enter your real osu!
   username → **Link my osu! account** → it should go to the Generating
   screen. Try a nonsense username too: you should get a red
   "No osu! player named …" error and stay on the page.
   (If Supabase asks for email confirmation, confirm via the email link
   first — or turn off "Confirm email" under Authentication → Providers →
   Email while developing.)
3. **Guest path:** in a private/incognito window (no account), go to the
   link screen → enter your osu! username → **Continue as guest** → same
   Generating flow, with saving/lists/ratings locked.
4. **Data check:** in Supabase → **Table Editor** → `profiles` — your
   account's row should show your osu! username and user id (written by the
   guest→account conversion + link flow), and **Edge Functions →
   osu-proxy → Logs** should show 200s, with no secrets anywhere.

---

## What does NOT work until this setup is done

- Creating a RecOsuk account / signing in (the Auth screen shows a
  "Demo mode — Supabase isn't connected yet" notice instead).
- Real osu! username validation on the link screen (any name is accepted
  and the demo profile is used).
- Everything in later milestones that builds on these (real skill
  profiles, saved lists, snapshots) — they arrive in M2+.

What always works, setup or not: all screens, navigation, the guest
session shape, the capability locks, and the demo data.
