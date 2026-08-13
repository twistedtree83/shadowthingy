# scripts2

The Ralph runner's files, plus the dev fixtures.

## The bibles

- `RALPH_PROMPT.md` — stable shipping rules. The authority on *how*.
- `TUI_PROMPT.md` — the in-session autonomous runner's deltas.
- `prd.json` — the task graph. `progress/` — one note per shipped task.

## Gates

- `check-purity.js` — the core reads no clock, DOM, storage, network or ambient
  randomness.
- `check-network.js` — no tile servers, no storage, no exfiltration, no absolute
  URL outside the allowed CDN hosts.
- `extract-core.js` — pulls the core out of the single `<script id="gnomon-core">`
  block. This is what replaces a build step, and it is how the gates and the
  headless suite read the same code the browser runs.

## Fixtures

`samples/` is gitignored — the repo never holds imagery, which is the whole
point of the app. Regenerate it:

```bash
node scripts2/fixture-scene.js > samples/scene.json
python3 scripts2/make-fixture.py            # needs pillow + piexif
```

That writes five JPEGs of one synthetic scene:

| file | what it tests |
|---|---|
| `scene-clean.jpg` | intact EXIF, no flags |
| `scene-cropped.jpg` | 16:9 crop of a 3:2 frame — principal point untrustworthy |
| `scene-resized.jpg` | half size, aspect preserved — focal rescales |
| `scene-stripped.jpg` | no EXIF at all |
| `scene-rotated.jpg` | portrait bytes with `Orientation=6` |

The scene's geometry comes from `Gnomon.synth` and its sun angles from
`Gnomon.solar` at the instant the EXIF claims, so the shadows genuinely match
the stated time and place. Nothing in the fixture pipeline reimplements a
projection — a second implementation is exactly what would let a fixture agree
with a bug.

`ship.js <ID>` flips a task to `passes: true` and rewrites its `INDEX.md` row.
