# Shared backend — brief for the slime-maker AI

**Paste this into the slime-maker repo's AI session so it doesn't break the
shared setup.** (Source of this note: the `andyfreed/emmyfreed` website repo.)

## What changed

Emmy's main website (`emmyfreed.com`, repo `andyfreed/emmyfreed`) now uses the
**same Supabase project as the slime maker** — project ref
`xikissitwexetetaurnm`. There is **one database** shared by both apps.

The slime maker is served from `emmyfreed.com/slimemaker`, so the website and
the game are on the **same domain**. Supabase stores its login session in
`localStorage`, keyed by project ref, so **the login session is shared
automatically**: a kid who logs in on the website is logged in to the game,
and vice versa. Don't customize Supabase's `storageKey` / auth storage in the
game, or you'll break that sharing.

## Auth conventions that MUST stay identical in both apps

The website replicates the game's exact login math so accounts line up. **If
you change any of these in the game, accounts will stop matching across the
website and game.** Keep them in sync:

```
username = raw.trim().toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'')
email    = username + '@slimemaker.game'
password = 'slime-kid-' + fourDigitCode + '-play'
```

(These come from `slime-maker` `src/App.tsx`: `normalizeUsername` and
`buildKidPassword`. The website copies them in `app.js` and `admin/index.html`.)

## New database objects the website added (the game can ignore them)

- **`profiles.is_admin`** — `boolean not null default false`. Lets the website
  editor at `/admin` decide who can edit the site text. The game doesn't need
  it, but **don't drop it**.
- **`public.site_content`** — table `(id text pk, data jsonb, updated_at timestamptz)`.
  Holds the website's editable text. Nothing in the game uses it.
- **`site-images` storage bucket** — public bucket for photos Emmy uploads via
  `/admin`. Only admins (`profiles.is_admin`) can write; anyone can read. The
  game doesn't use it.

## RLS change that DOES affect the game — read this

Previously `profiles` and `slimes` had `SELECT` policies open to **everyone**
(`to public using (true)`) — meaning logged-out/anonymous requests could read
them. They are now tightened to **logged-in users only**:

```sql
-- profiles + slimes SELECT are now: to authenticated using (true)
```

- **Why:** privacy. These are kids' usernames, coins, inventory, and slime
  collections; they should be visible to logged-in friends, not the whole
  internet.
- **Impact on the game:** the game reads `profiles`/`slimes` only **after** a
  kid logs in, so normal play is unaffected. ✅
- **⚠️ If the game ever reads `profiles` or `slimes` while logged OUT** (e.g. a
  public gallery/leaderboard shown before sign-in), those reads now return **0
  rows**. If you need that, don't re-open the tables to the whole internet —
  ask for a narrow, specific public-read policy instead.
- **Writes are unchanged:** insert/update/delete are still own-rows-only
  (`auth.uid() = id` / `auth.uid() = user_id`).

`site_content` policies: anyone can read it; only `is_admin` profiles can write.

## What the website now does with the shared data

- A **Players** section: when logged in, shows the kid's own stats and lets
  them browse every player's full profile + slime collection (reads all
  `profiles` and `slimes`).
- A **`/admin` editor**: an admin (`is_admin = true`) edits the site text,
  which writes to `site_content`.

## Coordinate going forward

Changes to the **auth scheme**, the **`profiles`/`slimes` schema**, or **RLS**
affect both apps. If you change any of those in the game, flag it so the
website (`app.js`, `admin/index.html` in `andyfreed/emmyfreed`) can be updated
to match. New columns/tables are fine; renames, drops, and policy changes need
coordination.
