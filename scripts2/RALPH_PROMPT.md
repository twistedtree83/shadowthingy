# RALPH_PROMPT — shared rules

Canonical operating rules for shipping tasks from a `scripts2/prd*.json` graph.
Stable across headless and TUI runs. **Do not edit casually** — the TUI runner
overrides only what it must, in `TUI_PROMPT.md`.

## Bibles

- `../PRD.md` and GH issue #1 — the product spec. The authority on *what* and *why*.
- `../CONTEXT.md` — the glossary. The authority on *what things are called*.
- The linked GH issue on each task — the authority on *this slice's* scope and acceptance criteria.
- This file — the authority on *how* to ship.

If the bibles are silent on a fork, **park the task for the human**. Do not invent
product decisions.

## The 10-step, per task

1. **Announce** the task: id, issue number, title, one line on the slice.
2. **Read the code** that already exists in the touched area before writing anything.
3. **`/tdd` one vertical slice.** Red → green → refactor. The slice must cut through
   every layer it touches and be demoable on its own. Never a horizontal layer.
4. **`npm run verify`** must be green. Never commit a red gate.
5. **Commit** on the graph's `branchName`. One commit per task, never batched.
6. **Close the GH issue** with a comment linking the commit.
7. **Set `passes: true`** on the task in the target graph.
8. **Write `scripts2/progress/<ID>.md`** — what shipped, what was decided, what was left.
9. **Flip the task's line in `scripts2/progress/INDEX.md`**.
10. **Push the branch.** The green gate is the guard.

A task ships **whole** or **does not start**. Never leave a half-applied slice.

## Step 2 cross-check

Before the loop, reconcile open GH issues against the graph. An open issue that is
not in the graph and cannot be auto-ingested is a **stop condition** — park for triage.

## Phase gates are hard

Every task carries a **gate** — the assertion that proves the slice actually works.
A failing gate stops the run. Do not continue to a dependent task on the theory
that the failure is cosmetic or will be fixed later.

This matters more here than on a normal project. Every later stage inherits the
errors of earlier ones, and a geometry bug does not announce itself in the result
— it produces a number that looks fine. There is no version of this app worth
shipping on top of a broken vanishing-point stage.

## Hard rules — project-specific, non-negotiable

These come from the PRD. They are not tradeable against schedule, and an
autonomous run must **never** weaken one to make a slice simpler. If a change
appears to simplify the build by weakening one of these, it is the wrong change —
park it.

1. **The honesty rule.** A stripped, cropped, or screenshotted image must produce
   a **visibly wide** band, not a narrow one that happens to be wrong. Wherever a
   choice exists between a presentation that looks more precise and one that is
   more honest about its tolerance, honesty wins. **Confidently wrong is the one
   failure mode this app cannot have.** A slice that makes the app look more
   certain without making it more correct is the wrong slice.

2. **The network boundary.** The only permitted network activity is the page-load
   fetch of `exifr`, `d3-geo`, `topojson-client`, and the Natural Earth 110m land
   TopoJSON. No uploads, no backend, no analytics, no error reporting, no fonts,
   **no tile servers**. Tiles are forbidden specifically because they are fetched
   per-viewport after the analysis, so the request sequence *is* the region of
   interest. Any slice that adds a runtime network call is wrong.
   `npm run check:network` enforces this.

3. **Single file, no build step.** Vanilla JS in one HTML file. No framework, no
   bundler, no module graph, no `npm install` required to run the app. It must
   open from `file://` on a machine with no toolchain.

4. **No storage.** No `localStorage`, no `sessionStorage`, no IndexedDB, no
   cookies. State lives in memory and dies with the tab.

5. **No stubs, mocks, or placeholder values in shipped code.** A stage that
   cannot be completed is reported as incomplete. A placeholder that returns a
   plausible number is indistinguishable from a working implementation right up
   until somebody acts on it. This is the rule most likely to be quietly broken
   by an autonomous run — do not break it.

6. **Poor conditioning propagates as unbounded uncertainty**, never as a large
   finite range. "We cannot tell" and "we can tell, roughly" are different claims
   and the UI must never render one as the other.

7. **Tier 4 falls through, it does not fudge.** The orthogonal-vanishing-point
   calibration requires a negative dot product for a real `f`. On a positive dot
   product it falls through to Tier 5. Taking an absolute value, clamping, or
   returning an imaginary component would be the single most damaging bug the app
   could have, because it would look like a successful mid-tier calibration.

8. **Disagreement is surfaced, never averaged.** When an EXIF tier and Tier 4 both
   succeed with different answers, both are shown and the disagreement is
   reported. It is a forensic signal — crop, digital zoom, or fabricated metadata
   — not noise to be smoothed.

## Purity rule

`solar`, `geom`, `calib`, `sun`, `montecarlo`, `grid`, and `synth` are pure. No
DOM, no network, no storage, no clock reads, no `Math.random`. Time enters as an
argument. Randomness enters as a seeded generator passed in — that is what makes
the Monte Carlo reproducible and the synthetic tests deterministic, and a report
that cannot be reproduced is not evidence.

`npm run check:purity` enforces this; a slice that needs to break it is a design
error, not a licence.

## How the core is tested

The app is one HTML file, so the core is defined inside a single
`<script id="gnomon-core">` block. The test runner extracts that block from the
HTML and evaluates it — there is no build step and no second copy of the code.

The in-page test panel and the headless suite call **the same assertion
functions**, so the panel cannot drift from the tests. A slice that adds an
assertion adds it once.

## The test that matters most

The **synthetic round trip** is worth more than every other test combined. It is
the only test with access to ground truth, and therefore the only way to know the
geometry is correct rather than merely plausible.

It builds a 3D scene with known camera, known sun and known poles, projects to
image coordinates, feeds those in as if they were user clicks, and asserts the
recovered values match. It runs across tilted and rolled camera orientations,
because an implementation can be wrong in a way that is invisible from a level
camera and badly wrong from a tipped one.

The same generator produces the **negative** cases — tilt the ground, lean a pole
— and asserts the residual rises. A validity check that has never been shown to
detect invalidity is not yet a check. Never delete or weaken a negative case to
make a slice pass.
