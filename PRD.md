# Gnomon — recovering time and place from the geometry of shadows

> This is the canonical spec. It is mirrored into the tracker as issue #1.
> The task graph is [`scripts2/prd.json`](scripts2/prd.json).

## Problem Statement

A photograph arrives with a claim attached to it. It was taken here, at this time, on this date. Sometimes the claim is in the EXIF. More often the EXIF has been stripped, or the image is a screenshot of a screenshot, and the claim is just something somebody said.

Verifying that claim is currently the work of a specialist. The technique is well understood — the sun is a clock and a compass, and every vertical object in sunlight is a hand on that clock — but the practice of it is a manual grind through projective geometry: mark the shadows, find the vanishing points, calibrate the camera, recover the sun vector, and only then compare it against where the sun actually was. Each step has a way of going quietly wrong, and the failure mode is not a crash. It is a plausible-looking number.

That failure mode is the actual problem. The people who need this answer — journalists checking a source, investigators sequencing an incident, researchers dating an archive photograph — are going to act on it. An answer of "the sun was at 34° elevation" with no attached tolerance is worse than no answer at all, because it will be believed. A cropped image, a digitally zoomed image, or a screenshot has lost the information needed to calibrate the camera, and any tool that hides that loss behind a confident number is manufacturing evidence.

There is a second problem sitting underneath the first, and it disqualifies most of the obvious solutions. The images this technique gets pointed at are sensitive. They may be unpublished. They may identify a source. Uploading one to a server is a disclosure, and even a tool that only fetches map tiles for the region of interest has told a third party which part of the world is being examined — which is frequently the single most sensitive fact in the whole investigation. A verification tool that leaks the question defeats itself.

So the problem is: **make shadow-geometry verification available to a competent non-specialist, without ever letting the image or the region of interest leave their machine, and without ever producing a confident answer the geometry does not support.**

## Solution

A single-file web app that runs entirely in the browser. Open the HTML, drop in a photograph, click six times, and read off where the sun was — with an honest error band attached.

The user marks **objects**. An object is three clicks: the base of something vertical, its top, and the tip of its shadow. Two objects is enough. From those clicks the app extracts three families of lines — the verticals, the shadows on the ground, and the rays running from each top to its shadow tip — and finds where each family converges. Those three vanishing points encode the sun's direction in the camera's frame.

Turning that into a real-world direction needs the camera's focal length, which is where most of the honesty lives. The app tries five methods in order, from EXIF's `FocalLengthIn35mmFilm` down to a bare statistical prior, and **the method that succeeded sets the width of every downstream error bar.** A photo with intact metadata produces a narrow band. A screenshot produces a wide one. The wide band is the correct answer for a screenshot, and the app is built so that the wide band is what you get.

One method deserves particular mention because it is free. A vertical object is perpendicular to the ground plane; a shadow lies in that plane. The two directions are orthogonal, and two orthogonal vanishing points calibrate a camera on their own — from the six clicks already placed, with no metadata at all. When that estimate and the EXIF estimate disagree, the app says so and does not average them. Disagreement is not noise to be smoothed; it is the signature of a crop, a digital zoom, or fabricated metadata, and it is often the most interesting thing on the screen.

The app then checks its own assumptions. Vertical, shadow, and ray are coplanar — they must be, in a real scene, because they are three sides of a triangle standing on flat ground. That coplanarity gives a **residual** that is computed independently of the calibration, so it is a genuine check rather than a restatement. When the residual is near zero, the scene behaves like a real scene. When it climbs, something has broken: the ground is sloped, the "vertical" object is leaning, the lens is distorted, or the image is a composite. The residual is the headline confidence number, shown before any answer is.

Uncertainty is measured, not derived. Every marked point is perturbed by a few pixels, the focal length is swept across its tier's range, and the whole pipeline is re-run five hundred times. What the user sees is the 5th, 50th and 95th percentile of that distribution — a band that got wide because the geometry genuinely is loose, not because a formula said so.

With a sun direction in hand and a date, the app inverts the problem. It walks a global grid, evaluates the solar position at every cell for the claimed instant, and keeps the cells where the sun would have been where the shadows say it was. The result is a band across the globe, drawn over coastlines with no tile server involved. Adding an azimuth narrows the band to a patch; scrubbing the assumed time animates it sweeping across the world.

Three modes share the same marking canvas. **Verify** takes a known place and a claimed time and returns a plain-language verdict. **Time** takes a known place and returns the windows of the day that fit — usually two, either side of noon. **Locate** takes only a date and returns the map band.

Nothing is uploaded, nothing is stored, and the network is touched exactly once, at page load, for three libraries and a coastline file. After that the app is airtight.

## User Stories

### Getting an image in

1. As an investigator, I want to drag a photograph onto the page and have it appear immediately, so that I can start work without a file dialog or an import step.
2. As an investigator, I want the image to be displayed the right way up, so that objects I know are vertical actually appear vertical and the geometry is not silently rotated.
3. As an investigator, I want the app to read the EXIF and pre-fill the date, time, and location fields, so that I do not retype what the file already knows.
4. As an investigator, I want to work with an image that has no EXIF at all, so that stripped and screenshotted images are first-class inputs rather than errors.
5. As an investigator, I want to be told when the image was digitally zoomed, so that I know the effective focal length is not the one written in the metadata.
6. As an investigator, I want to be told when the image has been resized since capture, so that the focal length is rescaled by the right ratio instead of being wrong by that ratio.
7. As an investigator, I want to be told loudly when the aspect ratio has changed, so that I know the image was cropped and the principal point is no longer the centre of the frame.
8. As an investigator, I want the timezone recovered from the EXIF offset when it is present, so that I am not guessing at the single field that most affects the answer.
9. As an investigator, I want the timezone recovered by differencing the GPS timestamp against the local timestamp when the offset field is absent, so that a second source of truth is used before I am asked to guess.
10. As an investigator, I want to be asked for the timezone explicitly when neither source is available, so that I am never silently defaulted into UTC.
11. As a source-protecting journalist, I want certainty that the image never leaves my machine, so that I can analyse unpublished material without creating a disclosure.

### Marking the scene

12. As an investigator, I want to place an object with three clicks — base, top, shadow tip — so that marking is fast enough to do several times.
13. As an investigator, I want to see which of the three clicks I am on, so that I do not lose my place partway through an object.
14. As an investigator, I want a magnified loupe while I am dragging a point, so that I can place it on the actual shadow tip rather than approximately near it.
15. As an investigator, I want to drag any point after placing it, so that I can refine a mark without starting the object again.
16. As an investigator, I want to delete an object, so that a bad mark does not have to be lived with.
17. As an investigator, I want the three line families drawn in distinct colours, so that I can see at a glance which lines are verticals, which are shadows, and which are rays.
18. As an investigator, I want dashed extensions drawn toward each family's convergence point, so that I can see whether the lines actually agree before I trust any number derived from them.
19. As an investigator, I want those extensions drawn even when the convergence point is off-screen, so that near-parallel families are still legible.
20. As an investigator, I want to mark more than two objects, so that a least-squares fit can average out my clicking error.
21. As an investigator, I want to mark a scene rectangle when I have one available, so that a rectangle of known right angles can calibrate the camera when metadata cannot.
22. As an investigator, I want to nominate a reference direction in the image — a road, a wall, a known bearing — so that azimuth can be reported against north rather than against nothing.

### The solar engine

23. As an investigator, I want to enter a latitude, longitude, date, time, and timezone and see the sun's elevation and azimuth, so that I can sanity-check the engine against a calculator I already trust.
24. As an investigator, I want to see the shadow multiplier for the current sun position, so that I can relate the numbers to the length of shadow I am looking at.
25. As an investigator, I want atmospheric refraction applied to the elevation, so that low-sun answers — which is where long shadows and therefore most of the interesting cases live — are not systematically wrong.
26. As a sceptical user, I want a visible panel of self-tests with pass/fail state, so that I can confirm the solar engine is right without taking anybody's word for it.
27. As a sceptical user, I want those self-tests to check the southern hemisphere explicitly, so that a hemisphere sign error cannot hide behind northern-only testing.

### Calibration and honesty

28. As an investigator, I want to be told which calibration method succeeded, so that I know how much the answer is worth.
29. As an investigator, I want the error band to widen automatically when a weaker calibration method was used, so that I cannot mistake a screenshot's answer for a full-metadata answer.
30. As an investigator, I want the camera calibrated from my marks alone when no metadata exists, so that a stripped image still produces an answer rather than a dead end.
31. As an investigator, I want to be shown the disagreement when EXIF and geometry give different focal lengths, so that I can treat it as the forensic signal it is.
32. As an investigator, I want a poorly-conditioned vanishing point to produce unbounded uncertainty rather than a large finite range, so that "we cannot tell" is distinguishable from "we can tell, roughly".
33. As an investigator, I want the coplanarity residual shown as the headline confidence figure, so that a broken assumption is the first thing I see rather than something I have to go looking for.
34. As an investigator, I want to be warned when the residual is large, so that I know to suspect sloped ground, a leaning object, lens distortion, or a composite.
35. As an investigator, I want percentile bands rather than a single number for elevation and azimuth, so that I report a range and not a false precision.
36. As an investigator, I want the interface to stay responsive while the uncertainty simulation runs, so that a slow machine does not make the app feel broken.
37. As an investigator, I want an azimuth-only mode offered when elevation cannot be recovered reliably, so that I get the part of the answer that is sound instead of an error message.
38. As an investigator, I want the app to refuse a confident answer when the sun is very low, so that the regime where the geometry is least trustworthy is not silently reported as if it were.
39. As an investigator, I want to be warned near the equinoxes, so that I know the latitude constraint is at its weakest and the band is wide for a real reason.

### Inverting to time and place

40. As an investigator, I want to give a date and see the band of the world where the sun could have been where the shadows say it was, so that an image with no location can still be narrowed down.
41. As an investigator, I want the band to have soft edges, so that it reads as a tolerance region rather than a line I might mistake for a boundary.
42. As an investigator, I want to add azimuth as a second constraint, so that the band collapses toward a patch when I have the information to collapse it.
43. As an investigator, I want to rotate the globe by dragging, so that I can look at the band from a useful angle.
44. As an investigator, I want the map drawn from a bundled coastline file, so that no request reveals which part of the world I am examining.
45. As an investigator, I want a time scrubber that animates the band sweeping across the globe, so that I can see how sensitive the result is to the assumed time.
46. As an investigator with a known location and a claimed time, I want a plain-language verdict on whether the two are consistent, so that the output is something I can quote.
47. As an investigator with a known location, I want the times of day that fit the observed shadow shown on a 24-hour timeline, so that I can see the fitting windows directly.
48. As an investigator, I want both fitting windows shown when there are two, so that the morning-or-afternoon ambiguity is presented rather than silently resolved.

### Reporting

49. As an investigator, I want to export a static HTML report, so that I can hand somebody the finding without handing them the tool.
50. As an investigator, I want the report to contain the marked image, so that a reader can see exactly which points produced the answer.
51. As an investigator, I want every intermediate value in the report, so that a reviewer can check my working rather than trusting my conclusion.
52. As an investigator, I want the calibration tier, the residual, and the percentile bands in the report, so that the tolerance travels with the answer.
53. As an investigator, I want my assumptions stated explicitly in the report, so that a reader knows what the finding rests on.
54. As an investigator, I want the report to be a self-contained file, so that it survives being emailed and opened offline.

### Debugging and development

55. As a developer, I want a persistent debug panel toggled by a key, so that I can watch every intermediate value while I work.
56. As a developer, I want vanishing points shown in homogeneous coordinates, so that the near-parallel case is visible rather than hidden behind a division.
57. As a developer, I want condition numbers, per-tier focal lengths, direction vectors, and residuals in the panel, so that I can localise an error to a stage.
58. As a developer, I want a synthetic scene test that round-trips known geometry through the whole pipeline, so that I know the geometry is correct rather than merely plausible.
59. As a developer, I want that test run across tilted and rolled camera orientations, so that an error that only appears off-axis cannot pass.
60. As a developer, I want a deliberately corrupted scene to raise the residual, so that I know the validity check actually detects invalidity.

## Implementation Decisions

### Architecture: one file, pure core, thin shell

The whole app ships as a single HTML file with inline `<script>` and `<style>`. No build step, no bundler, no framework, no module graph. It must be openable from a `file://` URL on a machine with no toolchain, and it must be auditable by one person reading one file top to bottom — an app whose entire pitch is "trust this with sensitive material" cannot ask for that trust across a dependency tree.

Within the file, the same discipline as any testable codebase applies: the computational core is pure functions over plain data, and the DOM is a rendering detail at the edge.

- **Pure:** `solar` (position from time and place), `geom` (homogeneous coordinates, SVD, vanishing points), `calib` (the focal-length cascade), `sun` (direction, residual, sign resolution), `montecarlo`, `grid` (the inverse solve), `synth` (the synthetic scene generator).
- **Shell:** canvas rendering, EXIF extraction, drag handling, map drawing, report generation.

No core function reads the clock, reads the DOM, or generates its own randomness. Time arrives as an argument. Randomness arrives as a seeded generator passed in, which is what makes the Monte Carlo reproducible and the synthetic tests deterministic. A slice that needs to break this is a design error.

### Network posture

Three libraries and one data file are fetched from a CDN at page load: `exifr`, `d3-geo`, `topojson-client`, and the Natural Earth 110m land TopoJSON. Nothing else. No backend, no analytics, no error reporting, no fonts, no tiles.

The distinction that matters is **when** and **what**. Everything fetched is fetched once, at load, before any image exists, and is identical for every user. It reveals that somebody opened the app. It cannot reveal anything about the image, because at that point there is no image.

A tile server is categorically different and is therefore forbidden. Tiles are requested per-viewport, after the analysis, and the sequence of requests _is_ the region of interest. That is the single most sensitive fact in most investigations, and it would be handed to a third party as a side effect of looking at the result. The coastline file is bundled precisely because it is the only way to draw a map without doing this.

Once loaded, the app makes no further requests. There is no `localStorage` or `sessionStorage`; all state is in memory and dies with the tab.

### The solar engine

NOAA's solar position algorithm, implemented directly, around eighty lines. No library — the algorithm is short, the constants are published, and a dependency here would be a dependency in the one place the app's correctness is most load-bearing.

Elevation is corrected for atmospheric refraction. This is not a refinement: the cases the app exists for are long-shadow cases, long shadows mean low sun, and low sun is exactly where refraction is largest — over half a degree at the horizon. Omitting it would bias the whole class of interesting inputs.

The engine's correctness is asserted by six invariants, chosen because each one is _derivable_ rather than remembered, so the test suite cannot inherit a transcription error from the implementation:

1. Declination reaches ±23.44° at the solstices and 0° at the equinoxes.
2. The equation of time stays inside roughly −14.5 to +16.5 minutes across a year, with four zero crossings.
3. Solar noon elevation equals `90° − |φ − δ|`, checked across a spread of latitudes and dates.
4. At solar noon the azimuth is ≈180° in the northern hemisphere and ≈0°/360° in the southern. **This is the assertion that catches hemisphere sign errors**, which are invisible to northern-only testing and which would corrupt every downstream result in half the world.
5. Elevation is symmetric about solar noon.
6. Sunrise and sunset bracket a day length that varies correctly with season.

These run in a visible panel with pass/fail state, so a user can confirm the engine rather than trust it.

### Projective geometry

Homogeneous coordinates throughout. A point is `[x, y, 1]`, the line through two points is their cross product, and the intersection of two lines is theirs.

**Dehomogenising is an explicit decision, never a default.** When the third component approaches zero the lines are near-parallel, the intersection is near infinity, and dividing through produces a number that is enormous, meaningless, and indistinguishable from a real measurement. Vanishing points are carried in homogeneous form and the near-infinite case is handled as its own branch, because "these lines are parallel" is a real and common answer for a photograph.

With more than two lines in a family, the vanishing point is the least-squares intersection: stack the line vectors into `A` and take the right null vector as the singular vector of the smallest singular value. The matrix is 3×3, so this is a Jacobi eigenvalue iteration on `AᵀA` rather than a general SVD — a few dozen lines of code with no dependency.

Each vanishing point carries a **condition number**, the ratio of the two smallest singular values. It is the app's measure of how well the family agrees, and it is exposed rather than consumed internally. A poorly-conditioned vanishing point propagates as _unbounded_ uncertainty, never as a large finite range. This is a deliberate refusal to convert "we cannot tell" into "we can tell, roughly" — those are different claims and a tool that conflates them is the failure mode this app exists to avoid.

### The calibration cascade

Five methods, tried in order, first success wins. The tier that succeeded is recorded and **sets the sweep width used by the Monte Carlo**, which is the mechanism by which weak provenance becomes a visibly wide band:

| Tier | Method | Sweep |
|------|--------|-------|
| 1 | `f_px = (FocalLengthIn35mmFilm / 36) × image_width_px` | ±2% |
| 2 | `f_px = (FocalLength_mm / sensor_width_mm) × image_width_px`, sensor width from a bundled `Make`/`Model` table | ±5% |
| 3 | Two orthogonal vanishing points from a user-marked scene rectangle | ±10% |
| 4 | `f² = −(v_z − c) · (v_shadow − c)` from the marks already placed | ±15% |
| 5 | Prior: `f_px ≈ 1.0–1.4 × image_width_px` | full range |

Tier 4 is the one that makes the app work on stripped images. A vertical object is perpendicular to the ground plane and a shadow lies within it, so `v_z` and `v_shadow` are orthogonal vanishing points, and two orthogonal vanishing points determine the focal length. It costs nothing beyond the six clicks already placed. It requires the dot product to be negative for `f²` to be positive; when it is not, the tier **fails through to Tier 5** rather than returning an imaginary or absolute-valued result. Returning nonsense here would be the single most damaging bug the app could have, because it would look like a successful mid-tier calibration.

When an EXIF tier and Tier 4 both succeed, both are computed and any disagreement is surfaced. They are not averaged and the disagreement is not smoothed. Two independent estimates diverging is evidence about the image — crop, digital zoom, or fabricated metadata — and it belongs in front of the user.

### Recovering the sun

With `K = [[f,0,cx],[0,f,cy],[0,0,1]]`, a vanishing point maps to a direction as `d = normalise([(vx−cx)/f, (vy−cy)/f, 1])`.

A vanishing point is a direction only up to sign, so both signs are resolved from the marks rather than assumed. `d_up` is fixed by requiring marked tops to sit above their bases in image coordinates. `d_sun` is fixed by requiring rays to run from top toward shadow tip. Getting either backwards flips the answer by 180°, which is why both are pinned to something the user actually clicked.

Elevation is `90° − angle(d_up, d_sun)`. Azimuth is the signed angle between `d_sun` and a user-supplied reference direction, both projected onto the ground plane by removing their `d_up` components.

### The validity residual

Vertical, shadow, and ray are three edges of a triangle standing on flat ground, so their direction vectors are coplanar and therefore linearly dependent:

```
residual = degrees( asin( |det[ d_up, d_shadow, d_sun ]| ) )
```

The reason this is a real check and not a tautology is that it is **independent of the calibration**. Tier 4 is derived from `v_z` and `v_shadow`; the residual brings in `v_sun`, which took no part in it. A scene can therefore satisfy the calibration and still fail the residual, and that is exactly the case worth catching.

A non-zero residual means an assumption broke — sloped ground, a leaning object, lens distortion, or compositing. It is the headline confidence indicator, shown before any answer.

### Uncertainty

Monte Carlo, not analytic propagation. Every marked point is perturbed by Gaussian noise at σ = 3px, the focal length is sampled across its tier's sweep, and Phases 3–4 re-run five hundred times. Output is the 5th, 50th and 95th percentile for elevation and azimuth.

Analytic propagation was rejected because the pipeline is not locally linear near the cases that matter: near-parallel line families and near-degenerate calibrations are precisely where a first-order approximation stops being valid, and those are the cases where an honest error bar matters most. Sampling costs a few hundred milliseconds and is correct in the regimes where the closed form silently is not.

The run is chunked through `requestIdleCallback` (falling back to a worker or sliced timeouts) so the interface stays live. The generator is seeded and passed in, so a given set of marks always produces the same band — a report that cannot be reproduced is not evidence.

### The inverse solve

A brute-force grid: longitude −180→180 at 0.5°, latitude −90→90 at 0.25°. At the claimed instant, the solar position is evaluated at every cell and cells are kept where the elevation falls inside the measured band. Azimuth is applied as a second filter when it is available.

That is roughly 500k evaluations of an eighty-line function, which is sub-second in a modern engine — cheap enough that no cleverness is warranted. An analytic solution for the elevation contour exists, but the grid extends to the two-constraint case, the soft-edged tolerance band, and the time scrubber without becoming a different algorithm each time. Brute force is the right call here and the reason is written down so a later slice does not "optimise" it into something narrower.

Rendering is `d3-geo` orthographic over bundled Natural Earth 110m coastlines, draggable to rotate. The band is drawn with soft edges because it is a tolerance region; a hard edge would imply a precision the data does not contain.

### Modes

Three modes share the marking canvas and readout, differing only in which unknowns are supplied:

- **Verify** — place and claimed time known. Output is a plain-language verdict: _"Claimed time implies a shadow bearing 47° from the one observed — inconsistent."_
- **Time** — place and bearing known. Sweep the day, show fitting windows on a 24-hour timeline. Near the solstices there are frequently two; both are shown, never silently collapsed to one.
- **Locate** — date only. Output is the map band.

### Guards

Guards are product requirements, not polish, and each exists because of a specific way the geometry stops being trustworthy:

- Below 5° elevation, refuse a confident answer. Refraction dominates, shadow tips become indistinct, and small marking errors produce large angular errors.
- Near the equinoxes, warn that the latitude constraint is at its weakest.
- Above a few degrees of residual, warn that an assumption has broken.

### Reporting

Export is a single self-contained HTML file with the image inlined as a data URI: the marked image, every intermediate value, the calibration tier, the residual, the Monte Carlo bands, the map, and the stated assumptions. It must open offline with no network and no tool, because the report will outlive the session and be read by somebody who does not have the app.

### Visual system

Neutral instrument styling. Monospace numerals, hairline rules, one accent colour, no decoration that could be mistaken for emphasis. Three regions: image canvas, readout panel, result region.

The intended register is a measuring instrument, not a dashboard — a number on screen should look like a reading, not like a conclusion. Precision is conveyed by the error band, never by the typography.

A design source exists at `claude.ai/design` for this file and should be imported when access is available; the written description above governs until then.

### Debug panel

A persistent panel, toggled by a key, showing every intermediate value: vanishing points in homogeneous coordinates, condition numbers, focal length per tier, direction vectors, residuals. It is built in the first slice and extended by every slice after it. Debugging projective geometry without one is guesswork.

## Testing Decisions

A good test here asserts external behaviour — a number that came out of the pipeline — and never reaches into the shape of an intermediate. The core is pure, so every test is a plain function call with no fixture, no DOM, and no clock.

**The synthetic round trip is the most important test in the project**, and it is worth more than all the others combined. It is the only way to distinguish geometry that is correct from geometry that is merely plausible, because it is the only test with access to ground truth:

1. Define a synthetic 3D scene — known camera position, orientation, and focal length; known sun elevation and azimuth; several vertical poles of assorted heights and positions on a flat ground plane.
2. Compute each pole's shadow tip analytically and project tops, bases and tips into image coordinates.
3. Feed those image points into the pipeline as if they were user clicks.
4. Assert the recovered focal length is within 1% of ground truth, that the recovered vanishing points match the analytically-computed ones, and that recovered elevation and azimuth are within 0.5°.

It runs across several camera orientations **including tilted and rolled**, because an implementation can be wrong in a way that is invisible from a level camera and badly wrong from a tipped one.

The same generator produces the **negative** cases, which matter as much as the positive ones. Tilt the ground plane by 10°, or lean one pole, and assert the residual rises accordingly. A validity check that has never been shown to detect invalidity is not yet a check.

Other suites:

- **Solar engine invariants** — the six assertions above, run headless in the suite and rendered in the visible panel from the same code, so the panel cannot drift from the tests.
- **Homogeneous geometry** — near-parallel families keep their homogeneous form and are flagged rather than dehomogenised; condition number rises as a family is made more degenerate.
- **Calibration cascade** — each tier is selected under the metadata conditions that should select it; Tier 4 falls through to Tier 5 on a positive dot product rather than returning a value; disagreement between an EXIF tier and Tier 4 is surfaced rather than averaged.
- **Monte Carlo** — a seeded run is reproducible; percentiles widen monotonically as the tier weakens; an unconditioned vanishing point yields unbounded rather than merely wide output.
- **Inverse solve** — a band derived from a known real location and time contains that location. This is the end-to-end test of the whole app and is the closing gate on the map.
- **Metadata integrity** — synthetic EXIF blocks exercise the digital-zoom, resize, and crop detections, including the crop case where aspect ratio changes and the principal point can no longer be assumed to be the centre.

Prior art for the pure-function-plus-invariants style, and for a purity gate enforced in CI, is the sibling `readingsoup` repository.

## Out of Scope

- **Any server-side component.** No upload, no API, no account, no persistence.
- **Lens distortion correction.** Barrel and pincushion distortion violate the pinhole model the whole pipeline assumes. Detecting it is in scope only as a raised residual; correcting it is not.
- **Automatic shadow detection.** Marking is manual. Automatic detection would introduce a confident failure mode in the one place the app most needs a human.
- **Multi-image correlation.** One image per session.
- **Terrain and elevation models.** The ground plane is assumed flat and level; departure from that shows up in the residual, and that is the extent of it.
- **Artificial light sources.** The pipeline assumes a light source at infinity.
- **Historical timezone rules.** The user supplies a UTC offset; the app does not carry a timezone database.
- **Astronomical refinements beyond NOAA** — no parallax, no ΔT modelling, no topocentric correction. NOAA's accuracy is far inside the app's error bars.
- **Mobile-first layout.** Desktop, precise pointer, and a large canvas are assumed. It should not be broken on a tablet, but marking a shadow tip with a fingertip is not a supported workflow.

## Further Notes

**The rule that governs every ambiguous decision.** A stripped, cropped, or screenshotted image must produce a **visibly wide** band, not a narrow one that happens to be wrong. Wherever a choice exists between a presentation that looks more precise and one that is more honest about its tolerance, honesty wins. Confidently wrong is the one failure mode this app cannot have. Any slice that makes the app look more certain without making it more correct is the wrong slice.

**Phase gates are hard.** Each phase ends with a gate, and a failing gate stops the build. Every later phase inherits the errors of earlier ones, and a geometry bug introduced in the vanishing-point stage does not announce itself in the result — it produces a number that looks fine. There is no version of this app worth shipping on top of a broken Phase 3.

**No stubs, no mocks, no placeholder values.** If a stage cannot be completed, it is reported as incomplete. A placeholder that returns a plausible number is indistinguishable from a working implementation right up until somebody acts on it.

**Two objects is the minimum, more is better.** Two determines each vanishing point exactly, which means clicking error passes straight through with nothing to average it against. Three or more admits a least-squares fit and a meaningful condition number. The interface should make adding a third object feel like the natural next step rather than an advanced option.

**Why the residual is the headline.** Every other number the app produces depends on the calibration being right. The residual does not — it is computed from a vanishing point the calibration never touched. It is the only figure on screen that can contradict the rest, which is exactly what qualifies it to be shown first.
