# RecOsuk

RecOsuk is a training companion for osu! players — in all four modes (osu!, Taiko, Catch, and Mania). It reads your public osu! profile and top plays, builds a skill profile that shows where your accuracy falls apart, and recommends beatmaps that train exactly that gap. Every recommendation explains itself, can be previewed and downloaded in-app via beatmap mirrors, and — with an account — your ratings feed back so the recommendations learn.

## Status

M0 shell: the full UI (designed in Google Stitch) converted to React + Vite + TypeScript + Tailwind, with client-side routing and a click-through onboarding flow. Backend (Supabase auth + osu! API proxy), the recommendation engine, and downloads are the next milestones.

## Screens

- Onboarding: welcome → link osu! account (or continue as guest) → generating → stats, explained → welcome recommendations → dashboard
- Dashboard and a full Stats tracker (accuracy by star-rating band, progress, top plays)
- Recommendations in two modes: **Generated** (pick a count, fixed list — the default) and **Unlimited beatmaps** (an endless feed, ordered as it loads)
- Mirror: mode-aware beatmap search and download queue
- Lists, Tried & Rated history, Settings, Sign in / Create account

Guests who link an osu! account without creating a RecOsuk account get their profile, stats, and recommendations — saving, lists, and ratings are account-only.

## Run it

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
```

## Design

Dark Stage theme: background `#150F1F`, panels `#221832`, osu! pink `#FF66AA`, with a per-mode accent (Taiko `#FF5C39`, Catch `#4CC3FF`, Mania `#9D6BFF`) and gold reserved for star ratings. Outfit for headings and numbers, Inter for body. The original Stitch HTML exports are kept in `stitch-raw/` as the design source the React screens in `src/screens/` were converted from.
