# DrillPlan

**Plan evenly-spread soil-investigation drilling locations across a site — right in your browser.**

🔗 Live: [drillplan.toondeboer.com](https://drillplan.toondeboer.com)

DrillPlan takes the outline of a site and a number of holes to drill per measurement
type, then decides *where* each hole goes so that:

- the holes are spread **evenly across the whole area**,
- holes of the **same type are kept as far apart as possible**, and
- **no two measurements share the same location**.

It is a from-scratch web rewrite of an old Python command-line script (kept for reference
in [`legacy/`](./legacy)). Everything now runs **client-side** — your file never leaves
your machine and there is no backend to maintain.

## How it works

1. **Read the area.** You upload a CSV of the site outline (`Position X` / `Position Y`
   columns). DrillPlan builds a polygon from the vertices.
2. **Spread evenly.** It lays a grid over the bounding box, keeps the points inside the
   polygon, and runs **K-Means** with `k = total holes`. The cluster centers are evenly
   distributed candidate locations.
3. **Assign types.** There are four measurement types — `BOR05`, `BOR10`, `BOR20`
   (borings at 5/10/20 m) and `PB` (*peilbuis* / monitoring well). Each location is given
   exactly one type. DrillPlan uses an **iterated local search** (hill-climbing type swaps
   with random restarts) to minimize an *inverse-distance energy* — close same-type pairs
   are penalized hardest — so each type ends up spread evenly with a large minimum
   separation rather than just pushed toward the site edges.
4. **Output.** A color-coded interactive map, a downloadable result CSV
   (`id, x, y, 0.0, type`), and a PNG of the map.

The heavy computation runs in a **Web Worker**, so the UI stays responsive and shows a
progress bar.

## Tech stack

- [Next.js](https://nextjs.org/) (App Router) + React + TypeScript
- [Tailwind CSS](https://tailwindcss.com/) for styling
- [`ml-kmeans`](https://github.com/mljs/kmeans) for K-Means++
- [`papaparse`](https://www.papaparse.com/) for CSV parsing
- A hand-rolled ray-casting point-in-polygon test (`lib/algorithm/geometry.ts`)
- Bilingual UI (Dutch / English)

## Project structure

```
app/                 Next.js pages (single-page tool)
components/          UI: upload, plot, controls, legend, language toggle
lib/algorithm/       geometry, kmeans, optimize, compute  (the ported algorithm)
lib/csv.ts           CSV parse + result export
lib/i18n.tsx         NL/EN strings + context
workers/             compute Web Worker
public/sample.csv    example site outline
legacy/              the original Python script, for reference
```

## Local development

```bash
npm install
npm run dev          # http://localhost:3000
```

Other scripts:

```bash
npm run build        # production build (type-check + lint included)
npm run start        # serve the production build
npm run lint
```

### Try it

Open the app, click **Try an example** (it loads `public/sample.csv`), set how many holes
you want per type, and press **Calculate**. Hover the points to inspect them, then download
the CSV or image.

## Input format

A CSV describing the **vertices of the site outline**, one per row:

```csv
Position X,Position Y
155000.0,463000.0
155180.0,463040.0
...
```

Coordinates are treated as a flat plane (e.g. Dutch RD-grid meters), so the map is a plain
equal-aspect XY plot rather than a geographic tile map.

## Deployment

Hosted on **Vercel** as a static/client app:

1. Import the repo into Vercel (framework auto-detected as Next.js).
2. In Vercel → *Project → Settings → Domains*, add `drillplan.toondeboer.com`.
3. Vercel shows a CNAME target. In **AWS Route 53** (where `toondeboer.com` is managed),
   add a `CNAME` record `drillplan` → that target. HTTPS is provisioned automatically.

## Legacy

The original Python implementation lives in [`legacy/`](./legacy) with its own README.
It is not used by the website; it is kept for reference. The grid/K-Means stages still
mirror it, but the type-assignment step **intentionally diverges**: the web app optimizes
an inverse-distance energy normalized per type (see [`lib/algorithm/optimize.ts`](./lib/algorithm/optimize.ts)),
which spreads same-type holes more evenly than the legacy `calc_fitness`, so the two no
longer produce identical results.
