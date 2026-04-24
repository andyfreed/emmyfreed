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
- No build, no bundler, no package.json needed

## TODO
- Swap placeholder SVG portraits in `My Pictures` for real photos (replace the inline `<svg>` inside each `.photo-inner` with `<img src="...">`).
