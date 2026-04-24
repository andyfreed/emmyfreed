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
- `content/site.json` — editable text content (served to the page at runtime; managed via the CMS below)
- `admin/` — Decap CMS admin UI at `/admin`
- `api/auth.mjs` — GitHub OAuth proxy for Decap (Vercel serverless function)
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

## CMS — Emmy can edit from a browser (`/admin`)

Some of the page text lives in `content/site.json` and can be edited
without code at `emmyfreed.com/admin`. Emmy logs in with GitHub, fills
out a form, hits save — Decap commits the change to this repo and
Vercel auto-deploys. A tiny `fetch('/content/site.json')` in
`index.html` swaps the text on page load.

### Currently editable fields
- Home: tiny intro line, intro paragraph, primary button, secondary button
- About Me: heading
- Footer: copyright line

Everything else (SVGs, layout, CSS, photos, favorites, slime maker) is
still edited by AI or directly in code. To expose more fields: add a
`data-cms="section.key"` attribute in `index.html`, add the matching
key to `content/site.json`, and add a field to `admin/config.yml`.

### One-time OAuth setup (you, not Emmy)

The CMS needs GitHub OAuth to commit on Emmy's behalf. The proxy runs
as a Vercel serverless function at `/api/auth` (code in `api/auth.mjs`).
You have to hook it up once:

1. Go to <https://github.com/settings/developers> → **New OAuth App**.
   - Application name: anything (e.g. `emmyfreed admin`)
   - Homepage URL: `https://emmyfreed.com`
   - Authorization callback URL: `https://emmyfreed.com/api/auth`
   - Save, then copy the **Client ID** and generate a **Client Secret**.
2. In Vercel → this project → Settings → Environment Variables, add
   (for Production, Preview, and Development):
   - `OAUTH_CLIENT_ID` = the client ID
   - `OAUTH_CLIENT_SECRET` = the client secret
3. Redeploy (or push any commit). Visit `/admin`, click "Login with
   GitHub", authorize — Emmy now has an editor.

### Emmy's workflow
1. Open `emmyfreed.com/admin`, log in with GitHub.
2. Pick "Main page text", edit the fields, click **Save**, then **Publish**.
3. Wait ~30s for Vercel to redeploy. Refresh the site.

### AI/code workflow (unchanged)
AI edits any file in this repo directly (including `content/site.json`
if that's easier than using the admin UI). The two flows don't conflict.

## TODO
- Swap placeholder SVG portraits in `My Pictures` for real photos (replace the inline `<svg>` inside each `.photo-inner` with `<img src="...">`).
