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
- `content/site.json` — editable text content (served to the page at runtime; managed via the editor below)
- `admin/index.html` — Emmy's custom browser editor at `/admin` (self-contained, no build)
- `api/auth.mjs` — GitHub sign-in for the editor (Vercel serverless function)
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

Some of the page text lives in `content/site.json` and can be edited
without code at `emmyfreed.com/admin`. It's a small custom page
(`admin/index.html`) built to be friendly on phones: big text boxes
and one Save button. Emmy signs in with GitHub, edits, taps Save — the
page commits the change straight to `content/site.json` via the GitHub
API, and Vercel auto-deploys. A tiny `fetch('/content/site.json')` in
`index.html` swaps the text on page load.

Sign-in is a popup-free, same-tab GitHub OAuth flow (`api/auth.mjs`),
which is what makes it work reliably on iPhones — Safari breaks the
popup-to-opener handoff that off-the-shelf CMS logins (like Decap) use.

### Currently editable fields
- Home: welcome line, hello paragraph, primary button, secondary button
- About Me: heading
- Footer: bottom line

Everything else (SVGs, layout, CSS, photos, favorites, slime maker) is
still edited by AI or directly in code. To expose more fields:
1. Add a `data-cms="section.key"` attribute to the element in `index.html`.
2. Add the matching key to `content/site.json`.
3. Add an entry to the `FIELDS` array in `admin/index.html`.

### One-time GitHub setup (you, not Emmy)

The editor signs in with GitHub to commit on Emmy's behalf, via a Vercel
serverless function at `/api/auth` (code in `api/auth.mjs`). Hook it up once:

1. Go to <https://github.com/settings/developers> → **New OAuth App**.
   - Application name: anything (e.g. `emmyfreed admin`)
   - Homepage URL: `https://www.emmyfreed.com`
   - Authorization callback URL: `https://www.emmyfreed.com/api/auth`
   - Save, then copy the **Client ID** and generate a **Client Secret**.
2. In Vercel → this project → Settings → Environment Variables, add
   (for Production, Preview, and Development):
   - `OAUTH_CLIENT_ID` = the client ID
   - `OAUTH_CLIENT_SECRET` = the client secret
3. Redeploy (or push any commit). Visit `/admin`, sign in — done.

Note: the OAuth callback host must match the domain you use. The app
above is set up for `www.emmyfreed.com`, so use `www.emmyfreed.com/admin`.

### Emmy's workflow
1. Open `www.emmyfreed.com/admin`, sign in with GitHub (first time only).
2. Change the words in the boxes, tap **Save my changes**.
3. Wait ~1 min for Vercel to redeploy. Refresh the site.

### AI/code workflow (unchanged)
AI edits any file in this repo directly (including `content/site.json`
if that's easier than using the editor). The two flows don't conflict.

## TODO
- Swap placeholder SVG portraits in `My Pictures` for real photos (replace the inline `<svg>` inside each `.photo-inner` with `<img src="...">`).
