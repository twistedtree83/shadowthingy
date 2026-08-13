# TUI_PROMPT — autonomous runner, in-session

Master prompt for `/ralph-runner` on **gnomon**. Reuses `RALPH_PROMPT.md` for the
stable rules and overrides only the TUI/autonomous deltas below.

## Deltas from RALPH_PROMPT

- **In-session only.** Do the work yourself. Never shell out to `claude`,
  `ralph.sh`, or `ralphonce.sh`. That is what keeps this on the subscription.
- **No check-ins between tasks.** "Autonomous" means uninterrupted within this
  session. Loop straight from one task to the next.
- **Re-resolve eligibility every iteration** off live graph state. A task is
  eligible when `passes:false` **and** `afk:true` **and** every `depends` entry
  now passes. Re-resolving is what lets a task unblocked by the one just shipped
  get picked up automatically.
- **Sequential by default.** Fan out to parallel subagents only if the user
  explicitly asks and the tasks are genuinely independent (worktree isolation).

## Project context

- Graph: `scripts2/prd.json` · Branch: `sprint/gnomon-mvp` · Repo: `twistedtree83/shadowthingy`
- Parent issue: #1 (the spec). **Never work #1 directly** — it is the spec, not a task.
- Runtime is **Node 22**. `npm run verify` runs `node --test` plus the purity and
  network gates. There are no dependencies — `npm install` is not required, for
  the app or the tests.
- The app is **one file**: `gnomon.html`. The core lives in a single
  `<script id="gnomon-core">` block that the test runner extracts and evaluates.

## Architecture the runner must preserve

Pure core, thin shell — inside the single file.

- **Pure:** `solar`, `geom`, `calib`, `sun`, `montecarlo`, `grid`, `synth`.
- **Shell:** canvas rendering, EXIF extraction, drag handling, map drawing,
  report generation. No geometry and no solar maths in the shell.
- The in-page test panel and the headless suite call the **same** assertion
  functions. A slice that adds an assertion adds it once. A second copy of an
  assertion is a bug.

## Parallel structure of this graph

`G1` unblocks the two independent lanes that carry the project:

- **The geometry lane** — `G3` → `G4` → `G7` → `G8` → `G9`. This is the critical
  path and the hardest work. `G4` (the synthetic round trip) is the gate that
  makes everything after it trustworthy; do not let it slip behind `G7`.
- **The image lane** — `G5` → `G6`. Independent of `G3`/`G4` until `G6`, which
  needs the vanishing-point maths to draw its convergence extensions.

`G2` (the solar engine) is independent of both and can be taken at any time; it
is a good first task because it is self-contained and its gate is unambiguous.

The two lanes rejoin at `G7`. After `G9`, `G10` → `G11` → `G12` is a linear tail,
and `G13` → `G14` → `G15` closes it out.

Prefer finishing the geometry lane early. It is where the project's risk lives —
everything downstream inherits its errors, and a bug there produces a plausible
number rather than a crash.

## Human gates in this graph

The loop must not attempt these. Surface a `WAITING:` line with the exact action.

- **`G16`** — import the visual design source from `claude.ai/design`. Requires an
  interactive `/design-login`, which no autonomous session can perform. `afk:false`.
- **`G17`** — the tuning and honesty pass. `afk:false`: nobody can assert from a
  test that a band *reads* as honest, or that a verdict sentence says what it
  means. This is the task that enforces the project's central rule and it needs
  human judgement by construction.

## Stop conditions

1. Most-important remaining task is `afk:false` → park with `WAITING:`.
2. `npm run verify` fails and cannot be fixed within the slice → stop, report,
   never commit red, never leave the slice half-applied.
3. An open GH issue is not in the graph and cannot be auto-ingested → stop for triage.
4. A slice cannot be built without weakening a hard rule in `RALPH_PROMPT.md` → park.
5. **A gate passes only because an assertion was weakened or a negative case was
   deleted** → stop. This is a stop condition rather than a rule because it is the
   specific way an autonomous run fails on this project: the geometry is hard, the
   tests are strict, and the path of least resistance is to loosen a tolerance.
   Loosening a tolerance is a product decision and belongs to the human.

## Terminus

Report IDs and commits shipped, what is now unblocked, what remains, and a
`WAITING:` line for **each** human-gated task still open.
