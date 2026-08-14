# CONTEXT — Gnomon

The glossary. When a slice names one of these concepts — in a test name, an issue
title, a variable, a UI label — it uses the term as defined here. Synonyms listed
as *avoid* are avoided deliberately; they blur distinctions the app depends on.

## The scene

**Object** — one marked thing in the photograph, consisting of exactly three
points: **base**, **top**, and **shadow tip**. The unit of marking. Two objects
is the minimum for a solution; three or more admits a least-squares fit.
*Avoid:* "pole", "marker", "annotation".

**Segment** — one of the three lines an object yields: the **vertical**
(base→top), the **shadow** (base→tip), or the **ray** (top→tip).

**Family** — all segments of one kind across every marked object. There are
exactly three families: verticals, shadows, rays. A family converges on a
vanishing point.

**Reference direction** — a user-nominated direction in the image with a known
real-world bearing (a road, a wall). Azimuth is reported against it. Without one,
only relative azimuth is available.

**Scene rectangle** — an optional user-marked quadrilateral known to be a
rectangle in the world. Feeds Tier 3 calibration.

## The geometry

**Vanishing point** (`v_z`, `v_shadow`, `v_sun`) — where a family converges, held
in **homogeneous coordinates**. Never dehomogenised without an explicit
near-parallel check. *Avoid:* "convergence point" in code; it is fine in UI prose.

**Condition number** — the ratio of the two smallest singular values of a
family's line matrix. The measure of how well a family agrees. High condition
number means the vanishing point is poorly determined and uncertainty must
propagate as **unbounded**, not merely wide.

**Unbounded** — the uncertainty state meaning *we cannot tell*. Deliberately
distinct from a large finite range, which means *we can tell, roughly*. Never
render one as the other.

**Vanishing line** (`ℓ`) — the image line through `v_z` and `v_shadow`. The
vertical, shadow and ray directions are three edges of one triangle, so they are
coplanar and `v_sun` must lie on `ℓ`. The physical constraint the constrained
estimator solves against, and the collinearity behind the coplanarity residual.

**Free estimator / constrained estimator** — the two instruments for the ray
direction. The **free** estimator is the ray family's own least-squares
vanishing point; it needs the rays to fix a point unaided, which they cannot do
when they nearly coincide — a shadow cast toward or away from the camera, or
small distant objects. The **constrained** estimator is the least-squares point
*on the vanishing line*; it stays well-posed there, at the cost of inheriting
the shadow family's noise. The Monte Carlo measures both bands on identical
draws and reports the narrower instrument, because with two objects the
condition number is identically zero and cannot arbitrate. *Avoid:* calling
either one "correct" — they are instruments, chosen by measured width.

**Penumbra** — the smear the sun's 0.53° disc puts on every shadow tip:
roughly `L·α / (sin h · cos h)` pixels along a shadow of image length `L` at
elevation `h`. Modelled in the Monte Carlo as anisotropic tip noise, inflated
along the shadow only. The physical reason low-sun answers are soft — the band
carries it, so the low-sun guard can warn instead of refusing a healthy median.

**Principal point** (`c`) — the image centre, unless a crop was detected, in
which case it is unknown and that fact is loud.

**Focal length in pixels** (`f_px`) — what calibration recovers. Always in
pixels; millimetres only ever appear as an input from EXIF.

## Calibration

**Tier** — one of the five focal-length methods, tried in order. The tier that
succeeded is recorded and **sets the sweep width**. *Avoid:* "method",
"strategy" — "tier" carries the ordering, which matters.

**Sweep** — the range of `f_px` the Monte Carlo samples, determined by the tier.
±2% at Tier 1 through full-range at Tier 5. This is the mechanism by which weak
provenance becomes a visibly wide band.

**Disagreement** — an EXIF tier and Tier 4 both succeeding with different
answers. A forensic signal (crop, digital zoom, fabricated metadata), never
averaged away and never called an error.

**Fall through** — a tier declining to answer so the next is tried. Tier 4 falls
through to Tier 5 on a positive dot product rather than returning an imaginary
`f`. *Avoid:* "fail" — falling through is correct behaviour, not a failure.

## The answer

**Elevation** (`α`) — the sun's angle above the horizon, refraction-corrected.

**Azimuth** — the sun's bearing, from north, clockwise, 0–360°.

**Shadow multiplier** — `1 / tan α`. The length of a shadow in units of the
object's height. The number that makes the geometry intuitive.

**Residual** — the validity check, in degrees, judged against its Monte Carlo
noise floor. Under the free estimator it is the coplanarity check,
`degrees(asin(|det[d_up, d_shadow, d_sun]|))`; under the constrained estimator
it is the in-plane spread — how far each object's private ray-line ∩ ℓ
intersection disagrees with the joint fit. Both are independent of calibration,
which is what qualifies the residual to be the **headline confidence
indicator**. A rising residual means an assumption broke: sloped ground,
leaning object, lens distortion, or compositing.

**Band** — any tolerance region, in any of the three places one appears: the
5th–95th percentile range on elevation or azimuth, the fitting windows on the
24-hour timeline, or the region on the map. Always soft-edged. *Avoid:*
"estimate", "result", "answer" for the region itself — the band *is* the answer.

**Azimuth-only** — the degraded mode offered when neither estimator can bound
the elevation but the bearing came back bounded — the bearing does not depend
on the vertical scale, so it survives shadows cast toward the camera and small
distant objects. Every mode runs on it. Presented proactively as a mode, never
as an error, and never escalated to a refusal while the bearing stands.

## The modes

**Verify** — place and claimed time known; output is a verdict.
**Time** — place and bearing known; output is fitting windows on a timeline.
**Locate** — date only; output is the map band.

## The rule

**Confidently wrong** — the one failure mode the app may not have. A stripped,
cropped, or screenshotted image must produce a **visibly wide** band. Wherever a
choice exists between looking more precise and being more honest about tolerance,
honesty wins. This phrase is used verbatim in issues and commit messages when a
decision turns on it.
