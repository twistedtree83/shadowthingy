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
| G12 | #17 | Time scrubber: the band sweeping across the globe | yes | pending |
| G13 | #18 | Three modes: Verify, Time, Locate | yes | pending |
| G14 | #19 | Guards: low sun, the equinoxes, and a broken residual | yes | pending |
| G15 | #20 | Report export: one self-contained file that outlives the session | yes | pending |
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
