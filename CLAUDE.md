# Gnomon

A client-side web app that recovers the sun's direction from the projective
geometry of shadows in a photograph, then determines when and where the photo was
taken — or proves its claimed time and place are impossible.

The spec is `PRD.md` and GitHub issue #1. The glossary is `CONTEXT.md`.

## The one rule

**Confidently wrong is the one failure mode this app cannot have.**

A stripped, cropped, or screenshotted image must produce a **visibly wide** band,
not a narrow one that happens to be wrong. Wherever a choice exists between a
presentation that looks more precise and one that is more honest about its
tolerance, honesty wins. A change that makes the app look more certain without
making it more correct is the wrong change.

## Hard constraints

These are not tradeable against schedule. A slice that appears simpler because it
weakens one of these is the wrong slice — park it rather than shipping it.

1. **Single HTML file.** Vanilla JS, no build step, no framework, no bundler. It
   must open from `file://` and be auditable by one person reading one file.
2. **Nothing leaves the browser.** No uploads, no backend, no analytics, no error
   reporting, **no tile servers**. The only network activity is the page-load
   fetch of `exifr`, `d3-geo`, `topojson-client`, and the Natural Earth 110m land
   TopoJSON — all before any image exists, all identical for every user. Tiles
   are forbidden specifically because the request sequence *is* the region of
   interest.
3. **No `localStorage` or `sessionStorage`.** State lives in memory and dies with
   the tab.
4. **No stubs, mocks, or placeholder values in shipped code.** A stage that
   cannot be completed is reported as incomplete. A placeholder returning a
   plausible number is indistinguishable from a working implementation right up
   until somebody acts on it.
5. **Poor conditioning propagates as unbounded uncertainty**, never as a large
   finite range. "We cannot tell" and "we can tell, roughly" are different claims.

## Architecture

Pure core, thin shell — inside the single file.

- **Pure:** `solar`, `geom`, `calib`, `sun`, `montecarlo`, `grid`, `synth`.
  No clock reads, no DOM, no `Math.random`. Time arrives as an argument;
  randomness arrives as a seeded generator, which is what makes the Monte Carlo
  reproducible and the synthetic tests deterministic.
- **Shell:** canvas rendering, EXIF extraction, drag handling, map drawing,
  report generation. No geometry, no solar maths.

`npm run check:purity` enforces the boundary. A slice that needs to break it is a
design error, not a licence.

## Verify

```bash
npm run verify      # tests + purity gate + network gate
```

Never commit a red gate.

## Agent skills

### Issue tracker

GitHub issues on `twistedtree83/shadowthingy`, mirrored by the machine-readable
task graph at `scripts2/prd.json`. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical labels, unchanged. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/`. See `docs/agents/domain.md`.

## Ralph runner

This repo is driven by an autonomous Ralph loop.

- `scripts2/RALPH_PROMPT.md` — the stable shipping rules. The authority on *how*.
- `scripts2/TUI_PROMPT.md` — the in-session autonomous runner's deltas.
- `scripts2/prd.json` — the task graph.
- `scripts2/progress/` — one file per shipped task, plus `INDEX.md`.

Issue #1 is the spec. **Never work it directly.**

## Shipping and deployment

The app is live at https://twistedtree83.github.io/Shadowy/ — deployed by
GitHub Actions (`.github/workflows/pages.yml`) from the `main` branch of the
mirror repo `twistedtree83/Shadowy`. The deploy runs `npm run verify` first;
a red gate never deploys.

**Every push to origin is followed by the mirror push.** The `shadowy` remote
carries a configured refspec (`sprint/gnomon-mvp` → `main`), so shipping is:

```bash
git push origin sprint/gnomon-mvp
git push shadowy        # refspec lands it on Shadowy main → deploys to Pages
```

If the `shadowy` remote is missing (fresh clone):

```bash
git remote add shadowy https://github.com/twistedtree83/Shadowy.git
git config remote.shadowy.push "refs/heads/sprint/gnomon-mvp:refs/heads/main"
```

A second checkout of this repo may exist one directory up (the user opens its
`gnomon.html` directly). After pushing, fast-forward it too if present, so the
copy the user double-clicks never goes stale.
