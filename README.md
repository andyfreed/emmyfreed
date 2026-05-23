# Emmy is Awesome ✨

Emmy's personal website — a playful portfolio for her pictures, about-me, and slime-maker game link.

## Built with
Plain HTML + CSS + a sprinkle of JavaScript. No build step, no dependencies, no framework.

## Run locally
Just open `index.html` in a browser. That's it.

## Deploy to Vercel
1. Push this repo to GitHub (already set up at `andyfreed/emmyfreed`).
2. On [vercel.com](https://vercel.com), click **Add New → Project** and import the repo.
3. Vercel auto-detects it as a static site — just click **Deploy**.
4. Point your custom domain at the Vercel deployment via the project settings.

## Structure
- `index.html` — the whole site (one page, scroll sections + sticky nav)
- `styles.css` — all the styling
- `app.js` — Supabase login + friend profiles (Players section); also loads the editable text
- `chat.html` + `chat.js` — realtime friends chat at `/chat` (Supabase Realtime)
- `content/site.json` — fallback copy of the editable text (live text lives in Supabase `site_content`)
- `admin/index.html` — Emmy's browser editor at `/admin` (self-contained, logs in with Supabase)
- `slimemaker/` — prebuilt static output of the Slime Maker game (see below)
- No build, no bundler, no package.json needed for the main site

## Slime Maker (`/slimemaker`)

The Slime Maker game at `emmyfreed.com/slimemaker` is served as plain static
files from this repo's `slimemaker/` directory. The **source of truth** is a
separate repo: <https://github.com/andyfreed/slime-maker> (Vite + React + Three.js).

### Updating the Slime Maker

A local checkout of the slime-maker source lives alongside this site at
`slime-maker-src/` (gitignored — it's a separate repo, not part of this one).
From the emmyfreed repo root:

```bash
# 1. Pull latest source (or edit + commit + push from inside slime-maker-src).
cd slime-maker-src
git pull

# 2. Build with the /slimemaker/ base path so asset URLs resolve correctly
#    when served from a subdirectory.
npx vite build --base=/slimemaker/

# 3. Replace the committed build in this repo with the fresh output.
cd ..
rm -rf slimemaker
cp -R slime-maker-src/dist slimemaker

# 4. Commit and push this repo. Vercel redeploys emmyfreed.com/slimemaker/.
git add slimemaker
git commit -m "Update slime-maker build"
git push
```

If `slime-maker-src/` doesn't exist locally, clone it first:
`git clone https://github.com/andyfreed/slime-maker.git slime-maker-src && (cd slime-maker-src && npm install)`

Do **not** convert the main Emmy site to React/Vite, and do **not** link to
`slime-maker.vercel.app` or any Vercel dashboard URL — everything is served
from `emmyfreed.com` via the committed `slimemaker/` folder.

## Editor — Emmy can edit from a browser (`/admin`)

The editable page text lives in Supabase (table `site_content`, one JSON
row) and can be changed without code at `emmyfreed.com/admin`. It's a
small custom page (`admin/index.html`) built to be friendly on phones:
big text boxes and one Save button. Emmy logs in with her **slime-game
name + 4-digit code** (same login as everything else), edits, taps Save —
the change writes straight to Supabase and shows on the site immediately
(no rebuild). `app.js` reads `site_content` on page load and swaps the
text, falling back to `content/site.json` if Supabase is ever unreachable.

Only an **admin** can save: the editor checks `profiles.is_admin` and
shows a friendly "not the editor" message to anyone else. Emmy's account
has `is_admin = true`; everyone else is `false`.

### Currently editable fields
- Home: welcome line, hello paragraph, primary button, secondary button
- About Me: heading
- Footer: bottom line

Everything else (SVGs, layout, CSS, photos, favorites, slime maker) is
still edited by AI or directly in code. To expose more fields:
1. Add a `data-cms="section.key"` attribute to the element in `index.html`.
2. Add the matching key to `content/site.json` (the fallback) and to the
   Supabase `site_content.data` JSON.
3. Add an entry to the `FIELDS` array in `admin/index.html`.

### Making someone an admin
In Supabase (SQL editor or the MCP tools), set the flag on their profile:
```sql
update public.profiles set is_admin = true where username = 'emmy';
```

### Emmy's workflow
1. Open `emmyfreed.com/admin`, log in with her name + 4-digit code.
2. Change the words in the boxes, tap **Save my changes**.
3. Refresh the site — the change is already live.

### AI/code workflow (unchanged)
AI edits any file in this repo directly. Note: the *live* page text now
comes from Supabase `site_content`, so to change text via code either
update that row (e.g. with the Supabase MCP tools) or edit it in `/admin`.
`content/site.json` is only the offline fallback.

## Chat (`/chat`)

A realtime friends chat, linked from the homepage nav. Logged-in friends
(same name + code login) can post; messages appear instantly via Supabase
Realtime. Features: emoji picker + reactions, who's-online, typing
indicators, edit/delete your own messages, optimistic send.

- Tables: `messages`, `message_reactions` (both in the `supabase_realtime`
  publication). Code: `chat.html` + `chat.js`.
- **Moderation:** Emmy (admin) can delete anyone's message (soft-delete →
  shows "message deleted"). Everyone else can only edit/delete their own.
- Only logged-in friends can read or post (RLS); the public can't see chat.

## TODO
- Swap placeholder SVG portraits in `My Pictures` for real photos (or just upload them via `/admin`).
