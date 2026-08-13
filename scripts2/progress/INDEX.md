# Progress index — gnomon

Graph: `scripts2/prd.json` · Branch: `sprint/gnomon-mvp` · Parent: #1

| ID | Issue | Task | AFK | Status |
|----|-------|------|-----|--------|
| G1  | #2  | Scaffold: three-region layout and the debug panel | yes | **shipped** — [G1.md](G1.md) |
| G2  | #3  | Solar engine: NOAA position, six invariants, manual UI | yes | **shipped** — [G2.md](G2.md) |
| G3  | #4  | Homogeneous geometry kernel: vanishing points and conditioning | yes | **shipped** — [G3.md](G3.md) |
| G4  | #5  | Synthetic scene generator and the vanishing-point round trip | yes | **shipped** — [G4.md](G4.md) |
| G5  | #6  | Image, EXIF, and metadata integrity flags | yes | **shipped** — [G5.md](G5.md) |
| G6  | #7  | Marking: objects, loupe, and the three line families | yes | **shipped** — [G6.md](G6.md) |
| G7  | #8  | Calibration cascade: five tiers, fall-through, and disagreement | yes | **shipped** — [G7.md](G7.md) |
| G8  | #9  | Sun direction, sign resolution, and the validity residual | yes | **shipped** — [G8.md](G8.md) |
| G9  | #10 | Monte Carlo uncertainty and the azimuth-only fallback | yes | **shipped** — [G9.md](G9.md) |
| G10 | #11 | Inverse solve: the global elevation-and-azimuth grid | yes | **shipped** — [G10.md](G10.md) |
| G11 | #16 | Map: orthographic globe, bundled coastlines, soft band | yes | **shipped** — [G11.md](G11.md) |
| G12 | #17 | Time scrubber: the band sweeping across the globe | yes | **shipped** — [G12.md](G12.md) |
| G13 | #18 | Three modes: Verify, Time, Locate | yes | **shipped** — [G13.md](G13.md) |
| G14 | #19 | Guards: low sun, the equinoxes, and a broken residual | yes | **shipped** — [G14.md](G14.md) |
| G15 | #20 | Report export: one self-contained file that outlives the session | yes | **shipped** — [G15.md](G15.md) |
| G16 | #21 | Visual system: import the Claude Design source | **no** | pending — human gate (`/design-login`) |
| G17 | #22 | Tuning and honesty pass | **no** | pending — human gate (judgement) |

## The two lanes

`G1` unblocks everything. After it, two independent lanes run in parallel and
rejoin at `G7`:

- **Geometry** — `G3` → `G4` → `G7` → `G8` → `G9`. The critical path and where the
  project's risk lives. `G4` is the gate that makes everything after it
  trustworthy.
- **Image** — `G5` → `G6`. Independent until `G6`, which needs `G3`'s
  vanishing-point maths to draw its convergence extensions.

`G2` (solar engine) is independent of both and is a good first task — self-contained,
with an unambiguous gate.

After `G9`: `G10` → `G11` → `G12` is a linear tail, and `G13` → `G14` → `G15`
closes it out.

## Closed as superseded

`#12`, `#13`, `#14`, `#15` were created by a parallel session working a different
14-ticket cut of the spec. They are closed as `not_planned`; the 17-ticket graph
above is the one of record. No content was lost — each is covered by a ticket here.

---

## Terminus — the AFK run is complete

**15 of 17 shipped.** Both remaining tasks are human gates by construction.

```
WAITING: G16 (#21) — import the Claude Design source. Needs an interactive
         /design-login, which no autonomous session can perform. Either run the
         import from an interactive Claude Code session, use Claude Design's
         "Send to Claude Code Web", or paste Gnomon.dc.html + image-slot.js +
         support.js into the session.

WAITING: G17 (#22) — the tuning and honesty pass. Every threshold in the app is
         a first estimate and nobody can assert from a test that a band READS as
         honest. See the list below.
```

### What G17 has to decide

**The one that matters most.** The spec's central rule says a stripped image
must produce a *visibly wide* band. Measured on the fixtures, it does not — and
the geometry says it should not:

| fixture | tier | band width |
|---|---|---|
| clean | 1 (±2%) | 3.8° |
| stripped | 4 (±15%) | 3.7° |
| cropped | 1 (±8%) | **5.7°** |

G9 found why: `d_up` and `d_sun` are built with the *same* focal length, so
scaling it rotates both alike and their mutual angle barely moves. **Elevation
is genuinely robust to focal length.** Tier 4 recovers `f` to better than 1% from
the marks alone, so a stripped-but-uncropped image legitimately supports a narrow
band. What actually destroys information is a **crop**, because it moves the
principal point — and that case does widen, by 50%.

This is a real tension between the stated rule and what the geometry supports. It
is a product decision, not a bug, and it belongs to a human.

### Thresholds awaiting judgement

| constant | value | where |
|---|---|---|
| principal-point sampling on a crop | 0.15 × image width | G9 |
| crop sweep penalty | 4× | G7 |
| low-sun refusal | 5° | G14 |
| equinox warning | \|δ\| < 4° | G14 |
| residual warn / refuse | 1.5× / 6× the noise floor | G14 |
| weak-check floor | 5° | G14 |
| Monte Carlo σ | 3px | G9 |

### Also for G17

- **Rebuild the demo fixture with larger objects and a longer reference.** Its
  poles are ~130px, so marking noise produces a ~25° residual floor and
  `weak-residual-check` fires on every run — correctly, but it means the residual
  guard is never exercised for real.
- Tier 3 accepts any quadrilateral as a "rectangle" without a plausibility check;
  a wildly non-rectangular one yields a confident wrong answer at ±10%.
- With a near-level camera the dashed convergence extensions fan toward points
  far off-canvas. Honest, but judge whether it reads as "converging".
