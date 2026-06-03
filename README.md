# hamidthri.github.io

Personal research portfolio of **Hamid Taheri** — robotics, perception, and deep reinforcement learning.
Built with [Astro](https://astro.build) + [Three.js](https://threejs.org), deployed to GitHub Pages.

🔗 **Live:** https://hamidthri.github.io

## Highlights

- **Multi-page** Astro site (Home · Research · Projects · About · Notes · Contact) with per-paper and per-project detail pages.
- **3D hero scene** — a robot autonomously navigates a LiDAR-sensed environment toward a goal you steer with the cursor (a 3D upgrade of the PPO navigation work). Gracefully degrades to a 2D canvas on low-power / no-WebGL / reduced-motion, and ships **0 KB of Three.js** to those visitors.
- **Live GitHub stars** fetched at build time, with a committed offline cache so builds never fail.
- Content lives in `src/content/**` — add a paper / project / note / news item by dropping in one file.

## Develop

```bash
npm install
npm run dev        # http://localhost:4321
npm run build      # static output → dist/
npm run preview    # serve dist/ exactly as Pages will
npm run check      # type-check
```

## Project structure

```
src/
  content/        publications · projects · posts · news   (the editable data)
  content.config.ts                                        (Zod schemas)
  layouts/Base.astro                                       (nav · footer · cursor · loader · SEO)
  components/                                              (Hero, cards, Icon, …)
  pages/                                                   (routes + [slug] detail pages)
  lib/  github.ts site.ts
  styles/ tokens.css global.css                            (design system)
  scripts/scene/                                           (3D + 2D hero, capability ladder)
public/  media · cv · og · data/github-cache.json
```

## Updating content

| Want to… | Do this |
|---|---|
| Add a publication | new `src/content/publications/<slug>.md` |
| Add a project | new `src/content/projects/<slug>.mdx` |
| Write a note | new `src/content/posts/<slug>.mdx` |
| Add a news item | append to `src/content/news/news.json` |
| Replace the CV | drop a PDF at `public/cv/Hamid_Taheri_CV.pdf` |
| Refresh star counts | re-run a deploy (or update `public/data/github-cache.json`) |

## Deploy

Pushing to `master` triggers `.github/workflows/deploy.yml` (build with `withastro/action`,
publish with `actions/deploy-pages`). Set **Settings → Pages → Source → GitHub Actions** once.

A custom domain can be added later via `public/CNAME` + DNS (set `site` in `astro.config.mjs`).
