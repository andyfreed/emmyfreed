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

## TODO
- Swap placeholder SVG portraits in `My Pictures` for real photos (replace the inline `<svg>` inside each `.photo-inner` with `<img src="...">`).
